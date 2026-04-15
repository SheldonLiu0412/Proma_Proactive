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
const MEMORY_WORKSPACE_SLUG = "dream";
const MEMORY_WORKSPACE_ID = "c66bb370-20f4-4ed6-8d15-df6590476038";
const MEMORY_WORKSPACE_DIR = join(PROMA_DIR, "agent-workspaces", MEMORY_WORKSPACE_SLUG);
const SDK_CONFIG_DIR = join(PROMA_DIR, "sdk-config");
const PROACTIVE_DIR = "/Users/jay/Documents/GitHub/Proma_Proactive";
const SDK_CLI_PATH =
  "/Users/jay/Documents/GitHub/Proma/node_modules/@anthropic-ai/claude-agent-sdk/cli.js";
const MEMORY_WORKSPACE_FILES_DIR = join(MEMORY_WORKSPACE_DIR, "workspace-files");

const AGENT_SESSIONS_JSON = join(PROMA_DIR, "agent-sessions.json");
const AGENT_SESSIONS_DIR = join(PROMA_DIR, "agent-sessions");

// 与 Proma 正式会话对齐
const MODEL_ID = "claude-sonnet-4-6";
const MEMORY_WORKSPACE_NAME = "Memory记忆巩固";

// Memory 完成标志
const COMPLETION_MARKER = "✅ MEMORY_COMPLETE";

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
    workspaceId: MEMORY_WORKSPACE_ID,
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

// ---------- System Prompt（复刻 Proma buildSystemPrompt） ----------

function buildSystemPrompt(sessionId) {
  return `# Proma Agent

你是 Proma Agent — 一个集成在 Proma 桌面应用中的通用AI助手，由 Claude Agent SDK 驱动。你有极强的自主性和主观能动性，可以完成任何任务，尽最大努力帮助用户。

## 工具使用指南

- 读取文件用 Read，搜索文件名用 Glob，搜索内容用 Grep — 不要用 Bash 执行 cat/find/grep 等命令替代专用工具
- 编辑已有文件用 Edit（精确字符串替换），创建新文件用 Write — Edit 的 old_string 必须是文件中唯一匹配的字符串
- 执行 shell 命令用 Bash — 破坏性操作（rm、git push --force 等）前先确认
- 文本输出直接写在回复中，不要用 echo/printf
- 当存在内置工具时，优先采用内置工具完成任务，避免滥用 MCP、shell 等过于通用的工具来完成简单任务
- **路径规则**：你的 cwd 是会话目录，不是项目源码目录。操作附加工作目录中的文件时，Glob/Grep/Read 的 path 参数必须使用**绝对路径**（如 \`/Users/xxx/project/src\`），不要用相对路径
- 处理多个独立任务时，尽量并行调用工具以提高效率
- **先搜后写**：修改代码前先用 Grep/Glob 搜索现有实现，复用已有模式和工具函数，最小化变更范围

## SubAgent 委派策略

**核心原则：先探索再行动，用 SubAgent 保持主上下文干净。根据任务复杂度选择合适的模型。**

Agent 工具支持 \`model\` 参数（可选值：\`sonnet\` / \`opus\` / \`haiku\`），默认使用 haiku 保持高效低成本，但复杂任务应升级模型。

### 内置 SubAgent

- **explorer**（默认 haiku）：代码库探索。快速搜索文件、理解项目结构、收集相关上下文
- **researcher**（默认 haiku，复杂调研升级 sonnet）：技术调研。方案对比、依赖评估、架构分析
- **code-reviewer**（默认 haiku，关键变更升级 sonnet）：代码审查。任务完成后调用，检查代码质量

## 用户信息

- 用户名: Guaniu

## 工作区

- 工作区名称: ${MEMORY_WORKSPACE_NAME}
- 工作区根目录: ~/.proma/agent-workspaces/${MEMORY_WORKSPACE_SLUG}/
- 当前会话目录（cwd）: ~/.proma/agent-workspaces/${MEMORY_WORKSPACE_SLUG}/${sessionId}/
- Skills 目录: ~/.proma/agent-workspaces/${MEMORY_WORKSPACE_SLUG}/skills/

### .context 目录层级

存在两个 \`.context/\` 目录，用途不同：
- **会话级** \`.context/\`（当前 cwd 下）：当前会话的临时工作台
- **工作区级** \`~/.proma/agent-workspaces/${MEMORY_WORKSPACE_SLUG}/workspace-files/.context/\`：跨会话共享的持久文档

## 文档输出与知识管理

**核心原则：有价值的产出要沉淀为文件，不要只留在聊天流中消失。**

- CLAUDE.md：跨会话有价值的项目知识
- .context/note.md：研究与分析输出
- .context/todo.md：任务进度追踪

## 交互规范

1. 优先使用中文回复，保留技术术语
2. 自称 Proma Agent
3. 回复简洁直接，不要冗长`;
}

// ---------- Dynamic Context（复刻 Proma buildDynamicContext） ----------

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

  return `**当前时间: ${timeStr}**

<workspace_state>
工作区: ${MEMORY_WORKSPACE_NAME}
</workspace_state>

<working_directory>${sessionCwd}</working_directory>`;
}

// ---------- Mentioned Tools 注入（复刻 Proma orchestrator） ----------

function buildMentionedToolsPrefix() {
  const qualifiedName = `proma-workspace-${MEMORY_WORKSPACE_SLUG}:memory-daily`;
  return `<mentioned_tools>
用户在消息中明确引用了以下工具，请在本次回复中主动调用：
- Skill: ${qualifiedName}（请立即调用此 Skill）
</mentioned_tools>`;
}

// ---------- Memory Prompt ----------

function buildMemoryPrompt(targetDate, sessionCwd) {
  const dynamicCtx = buildDynamicContext(sessionCwd);
  const mentionPrefix = buildMentionedToolsPrefix();

  const userMessage = `今天是 ${targetDate}，请执行 memory-daily 流程。

关键提示：
- 工具脚本在 ${PROACTIVE_DIR}/src/scripts/ 下，使用 npx tsx 运行
- 运行脚本时先 cd ${PROACTIVE_DIR}
- Memory 存储在 ~/.proma/memory/ 下
- 今日日期参数: --date ${targetDate}

完成所有步骤后请输出完成标志：${COMPLETION_MARKER}`;

  return `${dynamicCtx}\n\n${mentionPrefix}\n\n${userMessage}`;
}

function buildResumePrompt(sessionCwd) {
  const dynamicCtx = buildDynamicContext(sessionCwd);
  return `${dynamicCtx}\n\n你的 Memory 任务被中断了，请继续执行未完成的步骤。
完成后请输出完成标志：${COMPLETION_MARKER}`;
}

// ---------- 内置 SubAgent（复刻 Proma buildBuiltinAgents） ----------

const BUILTIN_AGENTS = {
  "code-reviewer": {
    description: "代码审查子代理。在完成代码修改后调用，审查代码质量、发现潜在问题、提出改进建议。",
    prompt: `你是一个专注于代码质量的审查员。你的职责是：
1. 审查变更的代码，关注逻辑错误、重复代码、命名清晰度、不必要的复杂度、潜在性能问题
2. 检查规范一致性：读取 CLAUDE.md（如存在），确认变更符合项目规范
3. 输出格式：按严重程度分类（🔴 必须修复 / 🟡 建议改进 / 🟢 值得肯定），每条意见附带文件路径和行号
保持客观、具体，不要泛泛而谈。如果代码质量很好，直接说"审查通过，无需修改"。`,
    tools: ["Read", "Glob", "Grep", "Bash"],
    model: "haiku",
  },
  explorer: {
    description: "代码库探索子代理。用于快速搜索文件、理解项目结构、查找相关代码。",
    prompt: `你是一个高效的代码库探索员。并行使用 Glob 和 Grep 搜索，返回信息时包含具体的文件路径和关键代码片段。保持简洁，只返回与任务相关的信息。`,
    tools: ["Read", "Glob", "Grep", "Bash"],
    model: "haiku",
  },
  researcher: {
    description: "技术调研子代理。用于对比技术方案、评估依赖库、分析架构选型。",
    prompt: `你是一个技术调研员。输出格式：问题概述、方案对比（表格）、推荐方案、风险提示、参考来源。保持客观，给出有依据的建议。`,
    tools: ["Read", "Glob", "Grep", "Bash", "WebSearch", "WebFetch"],
    model: "haiku",
  },
};

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

  let capturedSdkSessionId = resumeSessionId;
  let foundCompletion = false;
  let lastResultMsg = null;

  log(
    "INFO",
    resumeSessionId
      ? `Resuming SDK session: ${resumeSessionId}`
      : "Starting new Memory SDK session"
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
  log("INFO", "=== Proma Memory Runner ===");
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
    log("INFO", "[DRY RUN] System prompt:");
    console.log(buildSystemPrompt("dry-run-session-id"));
    console.log("\n--- User prompt ---\n");
    console.log(buildMemoryPrompt(targetDate, "/tmp/dry-run-cwd"));
    process.exit(0);
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
