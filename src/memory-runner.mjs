#!/usr/bin/env node
/**
 * memory-runner.mjs
 *
 * Memory 系统启动脚本。
 * 在 Memory 工作区中创建一个真实的 Proma 会话（注册到 agent-sessions.json），
 * 通过 Claude Agent SDK 执行 memory-daily 任务。
 * 用户可在 Proma UI 中实时看到会话进度。
 *
 * 保活机制：周期检测完成标志，未完成则自动 resume。
 *
 * 用法：
 *   node src/memory-runner.mjs [--date YYYY-MM-DD] [--max-retries N] [--dry-run]
 *
 * 环境变量：
 *   ANTHROPIC_API_KEY — 必需
 */

import { randomUUID } from "crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  appendFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { PATHS } from "./utils/paths.mjs";
import { loadMemoryInstanceConfig } from "./utils/instance-config.mjs";

// ---------- 常量 ----------

const PROMA_DIR = PATHS.proma;
const INSTANCE_CONFIG = loadMemoryInstanceConfig();
const MEMORY_WORKSPACE_SLUG = INSTANCE_CONFIG.memoryWorkspace.slug;
const MEMORY_WORKSPACE_ID = INSTANCE_CONFIG.memoryWorkspace.id;
const MEMORY_WORKSPACE_NAME = INSTANCE_CONFIG.memoryWorkspace.name;
const MEMORY_WORKSPACE_DIR = INSTANCE_CONFIG.memoryWorkspaceDir;
const SDK_CONFIG_DIR = join(PROMA_DIR, "sdk-config");
const PROACTIVE_DIR = INSTANCE_CONFIG.projectRoot;
const SDK_CLI_PATH = INSTANCE_CONFIG.sdkCliPath;
const SDK_MODULE_PATH = INSTANCE_CONFIG.sdkModulePath;
const MEMORY_WORKSPACE_FILES_DIR = join(MEMORY_WORKSPACE_DIR, "workspace-files");

const AGENT_SESSIONS_JSON = PATHS.agentSessions;
const AGENT_SESSIONS_DIR = PATHS.agentSessionLogs;

// 与 Proma 正式会话对齐
const MODEL_ID = "claude-sonnet-4-6";

// Memory 完成标志
const COMPLETION_MARKER = "✅ MEMORY_COMPLETE";

// 保活配置
const MAX_RETRIES = parseInt(getArg("--max-retries") || "5", 10);
const RETRY_DELAY_MS = 5000;
const DRY_RUN = process.argv.includes("--dry-run");
let cachedQueryFn = null;

// ---------- 工具函数 ----------

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && idx + 1 < process.argv.length
    ? process.argv[idx + 1]
    : null;
}

function getTargetDate() {
  const dateArg = getArg("--date");
  if (dateArg) return dateArg;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function log(level, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 原子写 JSON：先写入同目录下的 .tmp 文件，再 rename 覆盖。
 * 避免与 Proma 主进程并发读写 agent-sessions.json 时发生 lost-update。
 */
function atomicWriteJson(path, data) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

async function getQueryFn() {
  if (cachedQueryFn) return cachedQueryFn;
  if (!SDK_MODULE_PATH || !existsSync(SDK_MODULE_PATH)) {
    throw new Error(`SDK module not found: ${SDK_MODULE_PATH || "(unset)"}`);
  }

  const sdkModule = await import(pathToFileURL(SDK_MODULE_PATH).href);
  if (typeof sdkModule.query !== "function") {
    throw new Error(`Invalid SDK module: ${SDK_MODULE_PATH}`);
  }

  cachedQueryFn = sdkModule.query;
  return cachedQueryFn;
}

// ---------- Proma 元数据操作 ----------

/**
 * 在 agent-sessions.json 中注册新会话，模拟 Proma 的 createAgentSession
 */
function registerPromaSession(title) {
  const index = JSON.parse(readFileSync(AGENT_SESSIONS_JSON, "utf-8"));
  const now = Date.now();

  const meta = {
    id: randomUUID(),
    title,
    workspaceId: MEMORY_WORKSPACE_ID,
    createdAt: now,
    updatedAt: now,
  };

  index.sessions.push(meta);
  atomicWriteJson(AGENT_SESSIONS_JSON, index);

  // 确保消息日志目录存在
  if (!existsSync(AGENT_SESSIONS_DIR)) {
    mkdirSync(AGENT_SESSIONS_DIR, { recursive: true });
  }

  log("INFO", `Registered Proma session: ${meta.id} — "${title}"`);
  return meta;
}

/**
 * 更新会话元数据（如 sdkSessionId、updatedAt）
 */
function updatePromaSession(promaSessionId, updates) {
  const index = JSON.parse(readFileSync(AGENT_SESSIONS_JSON, "utf-8"));
  const idx = index.sessions.findIndex((s) => s.id === promaSessionId);
  if (idx === -1) {
    log("WARN", `Session ${promaSessionId} not found in index, skip update`);
    return;
  }
  index.sessions[idx] = {
    ...index.sessions[idx],
    ...updates,
    updatedAt: Date.now(),
  };
  atomicWriteJson(AGENT_SESSIONS_JSON, index);
}

/**
 * 追加消息到 Proma JSONL 日志
 */
function appendPromaMessage(promaSessionId, msg) {
  const jsonlPath = join(AGENT_SESSIONS_DIR, `${promaSessionId}.jsonl`);
  const record = { ...msg, _createdAt: Date.now() };
  appendFileSync(jsonlPath, JSON.stringify(record) + "\n");
}

// ---------- 会话工作目录 ----------

function createSessionCwd(promaSessionId) {
  const sessionCwd = join(MEMORY_WORKSPACE_DIR, promaSessionId);

  // 创建目录结构
  mkdirSync(join(sessionCwd, ".claude"), { recursive: true });
  mkdirSync(join(sessionCwd, ".context"), { recursive: true });

  // 写入 SDK 项目配置
  writeFileSync(
    join(sessionCwd, ".claude", "settings.json"),
    JSON.stringify({ plansDirectory: ".context", skipWebFetchPreflight: true }, null, 2)
  );

  log("INFO", `Created session CWD: ${sessionCwd}`);
  return sessionCwd;
}

// ---------- Prompt 模板（从 components/runner/ 读取） ----------

const RUNNER_COMPONENTS_DIR = join(PROACTIVE_DIR, "components", "runner");

function readComponent(name) {
  return readFileSync(join(RUNNER_COMPONENTS_DIR, name), "utf-8");
}

/**
 * 简单模板替换：将 ${VAR} 占位符替换为 vars 中的对应值。
 * 未知变量会抛错以便在启动时暴露配置遗漏。
 */
function renderTemplate(template, vars) {
  return template.replace(/\$\{([A-Z_]+)\}/g, (_, key) => {
    if (!(key in vars)) {
      throw new Error(`Missing template variable: ${key}`);
    }
    return vars[key];
  });
}

function buildSystemPrompt(sessionId) {
  return renderTemplate(readComponent("system-prompt.md"), {
    MEMORY_WORKSPACE_NAME,
    MEMORY_WORKSPACE_SLUG,
    SESSION_ID: sessionId,
  });
}

function buildDynamicContext(sessionCwd) {
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return renderTemplate(readComponent("dynamic-context.md"), {
    TIME_STR: timeStr,
    MEMORY_WORKSPACE_NAME,
    SESSION_CWD: sessionCwd,
  });
}

function buildMemoryPrompt(targetDate, sessionCwd) {
  return renderTemplate(readComponent("memory-prompt.md"), {
    DYNAMIC_CONTEXT: buildDynamicContext(sessionCwd),
    SKILL_QUALIFIED_NAME: `proma-workspace-${MEMORY_WORKSPACE_SLUG}:memory-daily`,
    TARGET_DATE: targetDate,
    PROACTIVE_DIR,
    COMPLETION_MARKER,
  });
}

function buildResumePrompt(sessionCwd) {
  return renderTemplate(readComponent("resume-prompt.md"), {
    DYNAMIC_CONTEXT: buildDynamicContext(sessionCwd),
    COMPLETION_MARKER,
  });
}

// ---------- 内置 SubAgent（从 builtin-agents.json 加载） ----------

const BUILTIN_AGENTS = JSON.parse(readComponent("builtin-agents.json"));

// ---------- SDK 选项 ----------

function buildSdkOptions(sessionCwd, promaSessionId, resumeSessionId) {
  // 构建环境变量：继承当前进程所有环境变量（包括 ANTHROPIC_API_KEY、ANTHROPIC_BASE_URL 等）
  const env = { ...process.env };
  Object.assign(env, {
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: "64000",
    CLAUDE_CODE_ENABLE_TASKS: "true",
    CLAUDE_CONFIG_DIR: SDK_CONFIG_DIR,
  });

  const options = {
    pathToClaudeCodeExecutable: SDK_CLI_PATH,
    executable: "node",
    model: MODEL_ID,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    includePartialMessages: false,
    cwd: sessionCwd,
    env,
    // 对齐 Proma：工作区附加目录 + workspace-files 目录
    additionalDirectories: [PROACTIVE_DIR, MEMORY_WORKSPACE_FILES_DIR],
    plugins: [{ type: "local", path: MEMORY_WORKSPACE_DIR }],
    settingSources: ["user", "project"],
    maxTurns: 50,
    effort: "high",
    // 对齐 Proma：system prompt 使用 claude_code preset + append
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: buildSystemPrompt(promaSessionId),
    },
    // 对齐 Proma：内置 SubAgent
    agents: BUILTIN_AGENTS,
  };

  if (resumeSessionId) {
    options.resume = resumeSessionId;
  }

  return options;
}

// ---------- 运行一轮 query ----------

async function runQuery(prompt, sessionCwd, resumeSessionId, promaSessionId) {
  const options = buildSdkOptions(sessionCwd, promaSessionId, resumeSessionId);
  const query = await getQueryFn();

  let capturedSdkSessionId = resumeSessionId;
  let foundCompletion = false;
  let lastResultMsg = null;

  log(
    "INFO",
    resumeSessionId
      ? `Resuming SDK session: ${resumeSessionId}`
      : "Starting new Memory SDK session"
  );

  // 持久化 user 消息到 Proma JSONL（首轮与 resume 统一写入）
  appendPromaMessage(promaSessionId, {
    type: "user",
    message: {
      content: [{ type: "text", text: prompt }],
    },
    parent_tool_use_id: null,
  });

  const queryIterator = query({
    prompt,
    options,
  });

  try {
    for await (const msg of queryIterator) {
      // 捕获 SDK session_id 并回写 Proma 元数据
      if (msg.session_id && !capturedSdkSessionId) {
        capturedSdkSessionId = msg.session_id;
        log("INFO", `SDK session ID: ${capturedSdkSessionId}`);
        updatePromaSession(promaSessionId, {
          sdkSessionId: capturedSdkSessionId,
        });
      }

      // 持久化 assistant 消息
      if (msg.type === "assistant") {
        appendPromaMessage(promaSessionId, {
          type: "assistant",
          message: msg.message || { content: [] },
          parent_tool_use_id: msg.parent_tool_use_id || null,
          session_id: msg.session_id,
          uuid: msg.uuid,
        });

        // 检查完成标志
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (
              block.type === "text" &&
              block.text?.includes(COMPLETION_MARKER)
            ) {
              foundCompletion = true;
              log("INFO", "Detected completion marker!");
            }
          }
        }
      }

      // 持久化 tool_result user 消息
      if (
        msg.type === "user" &&
        msg.message?.content?.some((c) => c.type === "tool_result")
      ) {
        appendPromaMessage(promaSessionId, {
          type: "user",
          message: msg.message,
          tool_use_result: true,
          parent_tool_use_id: msg.parent_tool_use_id || null,
        });
      }

      // 持久化 result 消息
      if (msg.type === "result") {
        lastResultMsg = msg;
        appendPromaMessage(promaSessionId, {
          type: "result",
          subtype: msg.subtype || "success",
          is_error: msg.is_error || false,
          duration_ms: msg.duration_ms,
          duration_api_ms: msg.duration_api_ms,
          num_turns: msg.num_turns,
          result: msg.result,
          stop_reason: msg.stop_reason,
          session_id: msg.session_id,
          total_cost_usd: msg.total_cost_usd,
          usage: msg.usage,
          modelUsage: msg.modelUsage,
          uuid: msg.uuid,
        });

        // 更新 Proma 会话的 updatedAt
        updatePromaSession(promaSessionId, {});

        const cost = msg.total_cost_usd || 0;
        const turns = msg.num_turns || 0;
        log(
          "INFO",
          `Round finished — turns: ${turns}, cost: $${cost.toFixed(3)}, stop: ${msg.stop_reason || "unknown"}`
        );

        // result.result 中也检查完成标志
        if (
          typeof msg.result === "string" &&
          msg.result.includes(COMPLETION_MARKER)
        ) {
          foundCompletion = true;
          log("INFO", "Detected completion marker in result!");
        }
      }
    }
  } catch (err) {
    log("ERROR", `Query error: ${err.message}`);
  }

  return {
    sdkSessionId: capturedSdkSessionId,
    completed: foundCompletion,
    result: lastResultMsg,
  };
}

// ---------- 主流程 ----------

async function main() {
  const targetDate = getTargetDate();
  log("INFO", "=== Proma Memory Runner ===");
  log("INFO", `Target date: ${targetDate}`);
  log("INFO", `Max retries: ${MAX_RETRIES}`);

  // dry-run 只渲染 prompt，不发起 API 调用，无需 key 或 SDK
  if (DRY_RUN) {
    log("INFO", "[DRY RUN] System prompt:");
    console.log(buildSystemPrompt("dry-run-session-id"));
    console.log("\n--- User prompt ---\n");
    console.log(buildMemoryPrompt(targetDate, "/tmp/dry-run-cwd"));
    process.exit(0);
  }

  // 验证环境
  if (!process.env.ANTHROPIC_API_KEY) {
    log("ERROR", "ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  if (!SDK_CLI_PATH || !existsSync(SDK_CLI_PATH)) {
    log("ERROR", `SDK CLI not found: ${SDK_CLI_PATH}`);
    process.exit(1);
  }

  // 1. 在 Proma 元数据层注册会话
  const title = `Memory ${targetDate}`;
  const promaMeta = registerPromaSession(title);
  const promaSessionId = promaMeta.id;

  // 2. 创建会话工作目录
  const sessionCwd = createSessionCwd(promaSessionId);

  // 3. 第一轮：发送 Memory 任务
  const prompt = buildMemoryPrompt(targetDate, sessionCwd);
  let { sdkSessionId, completed } = await runQuery(
    prompt,
    sessionCwd,
    null,
    promaSessionId
  );

  // 4. 保活循环
  let retryCount = 0;
  while (!completed && retryCount < MAX_RETRIES) {
    retryCount++;
    log(
      "WARN",
      `Task not completed, retry ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s...`
    );
    await sleep(RETRY_DELAY_MS);

    if (!sdkSessionId) {
      log("ERROR", "No SDK session ID captured, cannot resume");
      break;
    }

    const resumeResult = await runQuery(
      buildResumePrompt(sessionCwd),
      sessionCwd,
      sdkSessionId,
      promaSessionId
    );

    sdkSessionId = resumeResult.sdkSessionId || sdkSessionId;
    completed = resumeResult.completed;
  }

  // 5. 标记会话结束状态
  updatePromaSession(promaSessionId, {
    stoppedByUser: false,
    ...(completed ? {} : { stoppedByUser: true }),
  });

  if (completed) {
    log("INFO", "=== Memory completed successfully ===");
    log("INFO", `Proma session: ${promaSessionId}`);
    process.exit(0);
  } else {
    log("ERROR", `=== Memory did not complete after ${MAX_RETRIES} retries ===`);
    log("INFO", `Proma session: ${promaSessionId} (can resume manually)`);
    process.exit(1);
  }
}

main().catch((err) => {
  log("ERROR", `Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
