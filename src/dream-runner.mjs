#!/usr/bin/env node
/**
 * dream-runner.mjs
 *
 * Dream 系统启动脚本。
 * 在 Dream 工作区中创建一个真实的 Proma 会话（注册到 agent-sessions.json），
 * 通过 Claude Agent SDK 执行 dream-daily 任务。
 * 用户可在 Proma UI 中实时看到会话进度。
 *
 * 保活机制：周期检测完成标志，未完成则自动 resume。
 *
 * 用法：
 *   node src/dream-runner.mjs [--date YYYY-MM-DD] [--max-retries N] [--dry-run]
 *
 * 环境变量：
 *   ANTHROPIC_API_KEY — 必需
 */

import { query } from "/Users/jay/Documents/GitHub/Proma/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs";
import { randomUUID } from "crypto";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";

// ---------- 常量 ----------

const PROMA_DIR = join(homedir(), ".proma");
const DREAM_WORKSPACE_SLUG = "dream";
const DREAM_WORKSPACE_ID = "c66bb370-20f4-4ed6-8d15-df6590476038";
const DREAM_WORKSPACE_DIR = join(PROMA_DIR, "agent-workspaces", DREAM_WORKSPACE_SLUG);
const SDK_CONFIG_DIR = join(PROMA_DIR, "sdk-config");
const PROACTIVE_DIR = "/Users/jay/Documents/GitHub/Proma_Proactive";
const SDK_CLI_PATH =
  "/Users/jay/Documents/GitHub/Proma/node_modules/@anthropic-ai/claude-agent-sdk/cli.js";

const AGENT_SESSIONS_JSON = join(PROMA_DIR, "agent-sessions.json");
const AGENT_SESSIONS_DIR = join(PROMA_DIR, "agent-sessions");

// Dream 完成标志
const COMPLETION_MARKER = "✅ DREAM_COMPLETE";

// 保活配置
const MAX_RETRIES = parseInt(getArg("--max-retries") || "5");
const RETRY_DELAY_MS = 5000;
const DRY_RUN = process.argv.includes("--dry-run");

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
    workspaceId: DREAM_WORKSPACE_ID,
    createdAt: now,
    updatedAt: now,
  };

  index.sessions.push(meta);
  writeFileSync(AGENT_SESSIONS_JSON, JSON.stringify(index, null, 2));

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
  writeFileSync(AGENT_SESSIONS_JSON, JSON.stringify(index, null, 2));
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
  const sessionCwd = join(DREAM_WORKSPACE_DIR, promaSessionId);

  // 创建目录结构
  mkdirSync(join(sessionCwd, ".claude"), { recursive: true });
  mkdirSync(join(sessionCwd, ".context"), { recursive: true });

  // 写入 SDK 项目配置
  writeFileSync(
    join(sessionCwd, ".claude", "settings.json"),
    JSON.stringify({ plansDirectory: ".context" }, null, 2)
  );

  log("INFO", `Created session CWD: ${sessionCwd}`);
  return sessionCwd;
}

// ---------- Dream Prompt ----------

function buildDreamPrompt(targetDate) {
  return `你是 Proma Dream Agent。今天是 ${targetDate}。

请按照 dream-daily Skill 的流程执行今日的 Dream 任务。

关键提示：
- 工具脚本在 ${PROACTIVE_DIR}/src/scripts/ 下，使用 npx tsx 运行
- 运行脚本时先 cd ${PROACTIVE_DIR}
- Dream 存储在 ~/.proma/dream/ 下
- 今日日期参数: --date ${targetDate}

现在开始执行 dream-daily 流程。`;
}

function buildResumePrompt() {
  return `你的 Dream 任务被中断了，请继续执行未完成的步骤。
完成后请输出完成标志：${COMPLETION_MARKER}`;
}

// ---------- SDK 选项 ----------

function buildSdkOptions(sessionCwd, resumeSessionId) {
  // 构建干净的环境变量
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("ANTHROPIC_")) {
      env[key] = value;
    }
  }
  Object.assign(env, {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: "64000",
    CLAUDE_CODE_ENABLE_TASKS: "true",
    CLAUDE_CONFIG_DIR: SDK_CONFIG_DIR,
  });

  const options = {
    pathToClaudeCodeExecutable: SDK_CLI_PATH,
    executable: "node",
    model: "claude-sonnet-4-5-20250929",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    includePartialMessages: false,
    cwd: sessionCwd,
    env,
    additionalDirectories: [PROACTIVE_DIR],
    plugins: [{ type: "local", path: DREAM_WORKSPACE_DIR }],
    settingSources: ["user", "project"],
    maxTurns: 50,
    effort: "high",
  };

  if (resumeSessionId) {
    options.resume = resumeSessionId;
  }

  return options;
}

// ---------- 运行一轮 query ----------

async function runQuery(prompt, sessionCwd, resumeSessionId, promaSessionId) {
  const options = buildSdkOptions(sessionCwd, resumeSessionId);

  let capturedSdkSessionId = resumeSessionId;
  let foundCompletion = false;
  let lastResultMsg = null;

  log(
    "INFO",
    resumeSessionId
      ? `Resuming SDK session: ${resumeSessionId}`
      : "Starting new Dream SDK session"
  );

  // 持久化 user 消息到 Proma JSONL
  if (!resumeSessionId) {
    appendPromaMessage(promaSessionId, {
      type: "user",
      message: {
        content: [{ type: "text", text: prompt }],
      },
      parent_tool_use_id: null,
    });
  } else {
    appendPromaMessage(promaSessionId, {
      type: "user",
      message: {
        content: [{ type: "text", text: prompt }],
      },
      parent_tool_use_id: null,
    });
  }

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
  log("INFO", "=== Proma Dream Runner ===");
  log("INFO", `Target date: ${targetDate}`);
  log("INFO", `Max retries: ${MAX_RETRIES}`);

  // 验证环境
  if (!process.env.ANTHROPIC_API_KEY) {
    log("ERROR", "ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  if (!existsSync(SDK_CLI_PATH)) {
    log("ERROR", `SDK CLI not found: ${SDK_CLI_PATH}`);
    process.exit(1);
  }

  if (DRY_RUN) {
    log("INFO", "[DRY RUN] Would send prompt:");
    console.log(buildDreamPrompt(targetDate));
    process.exit(0);
  }

  // 1. 在 Proma 元数据层注册会话
  const title = `Dream ${targetDate}`;
  const promaMeta = registerPromaSession(title);
  const promaSessionId = promaMeta.id;

  // 2. 创建会话工作目录
  const sessionCwd = createSessionCwd(promaSessionId);

  // 3. 第一轮：发送 Dream 任务
  const prompt = buildDreamPrompt(targetDate);
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
      buildResumePrompt(),
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
    log("INFO", "=== Dream completed successfully ===");
    log("INFO", `Proma session: ${promaSessionId}`);
    process.exit(0);
  } else {
    log("ERROR", `=== Dream did not complete after ${MAX_RETRIES} retries ===`);
    log("INFO", `Proma session: ${promaSessionId} (can resume manually)`);
    process.exit(1);
  }
}

main().catch((err) => {
  log("ERROR", `Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
