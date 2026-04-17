#!/usr/bin/env npx tsx
/**
 * extract-session-digest.ts
 *
 * 将单个会话的 JSONL 日志提取为结构化 Markdown 摘要。
 * 支持全量提取和增量提取（从指定时间戳开始）。
 *
 * 用法：
 *   npx tsx src/scripts/extract-session-digest.ts --id <sessionId> --type agent [--from <timestamp>] [--output path]
 *   npx tsx src/scripts/extract-session-digest.ts --id <sessionId> --type chat [--from <timestamp>] [--output path]
 *
 * --from: 增量起点（Unix 毫秒时间戳），只提取该时间之后的消息
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PATHS } from "../utils/paths.js";
import { formatTimestamp, formatDuration } from "../utils/time.js";

// ---------- 类型定义 ----------

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  thinking?: string;
  [key: string]: unknown;
}

interface RawMessage {
  type: "user" | "assistant" | "result" | "system";
  subtype?: string;
  message?: {
    content?: ContentBlock[] | string;
    model?: string;
    role?: string;
  };
  tool_use_result?: boolean;
  parent_tool_use_id?: string | null;
  _createdAt?: number;
  // result fields
  num_turns?: number;
  total_cost_usd?: number;
  _durationMs?: number;
  duration_ms?: number;
  modelUsage?: Record<string, { costUSD?: number }>;
  result?: string;
  stop_reason?: string;
  // legacy format
  role?: string;
  content?: string;
  createdAt?: number;
  events?: Array<{ type: string; text?: string }>;
  model?: string;
}

interface DialogueTurn {
  index: number;
  timestamp: number;
  timeStr: string;
  userText: string;
  segments: Array<{ type: "text"; text: string } | { type: "tool"; call: string } | { type: "readonly"; counts: Record<string, number> }>;
  toolCalls: string[]; // 保留用于 categorizeFileOps
}

interface SessionDigest {
  title: string;
  sessionId: string;
  sessionType: "agent" | "chat";
  isIncremental: boolean;
  incrementalFrom?: number;
  meta: {
    workspaceName?: string;
    createdAt: string;
    updatedAt: string;
    durationStr: string;
    totalRounds: number;
    totalCost: number;
    models: string[];
  };
  previousSummary?: string;
  turns: DialogueTurn[];
  fileOps: {
    read: string[];
    modified: string[];
    created: string[];
    commands: string[];
    subagents: string[];
  };
}

// ---------- JSONL 解析 ----------

function parseJsonl(filePath: string): RawMessage[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  const messages: RawMessage[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return messages;
}

function isLegacyFormat(msg: RawMessage): boolean {
  return "role" in msg && !("type" in msg && msg.type !== undefined);
}

function getTimestamp(msg: RawMessage): number {
  return msg._createdAt || msg.createdAt || 0;
}

// ---------- 提取用户文本 ----------

function extractUserText(msg: RawMessage): string | null {
  // 跳过 tool_result 回传
  if (msg.tool_use_result) return null;

  // legacy format
  if (isLegacyFormat(msg)) {
    if (msg.role === "user" && typeof msg.content === "string") {
      return msg.content;
    }
    return null;
  }

  // new format
  if (msg.type !== "user") return null;
  const content = msg.message?.content;
  if (!Array.isArray(content)) return null;

  const texts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) {
      texts.push(block.text);
    }
  }
  return texts.length > 0 ? texts.join("\n") : null;
}

// ---------- 提取 Assistant 文本和工具调用 ----------

const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep"]);

function extractAssistantContent(msg: RawMessage): {
  segments: Array<{ type: "text"; text: string } | { type: "tool"; call: string } | { type: "readonly"; counts: Record<string, number> }>;
  toolCalls: string[];
} {
  const segments: Array<{ type: "text"; text: string } | { type: "tool"; call: string } | { type: "readonly"; counts: Record<string, number> }> = [];
  const toolCalls: string[] = [];

  // legacy format
  if (isLegacyFormat(msg)) {
    if (msg.role === "assistant" && typeof msg.content === "string") {
      return { segments: [{ type: "text", text: msg.content }], toolCalls: [] };
    }
    return { segments: [], toolCalls: [] };
  }

  if (msg.type !== "assistant") return { segments: [], toolCalls: [] };
  const content = msg.message?.content;
  if (!Array.isArray(content)) return { segments: [], toolCalls: [] };

  for (const block of content) {
    if (block.type === "text" && block.text) {
      segments.push({ type: "text", text: block.text as string });
    } else if (block.type === "tool_use" && block.name) {
      const toolName = block.name as string;
      if (READ_ONLY_TOOLS.has(toolName)) {
        // 连续的 read-only 合并到上一个 read-only segment
        const last = segments[segments.length - 1];
        if (last && last.type === "readonly") {
          if (last.counts[toolName]) last.counts[toolName]++;
          else last.counts[toolName] = 1;
        } else {
          segments.push({ type: "readonly", counts: { [toolName]: 1 } });
        }
      } else {
        const summary = formatToolCall(toolName, block.input);
        segments.push({ type: "tool", call: summary });
        toolCalls.push(summary);
      }
    }
    // skip thinking blocks
  }

  return { segments, toolCalls, readOnlyCounts: {} };
}

function formatToolCall(
  name: string,
  input?: Record<string, unknown>
): string {
  const truncate = (s: string) => s.length > 10 ? s.slice(0, 10) + "..." : s;
  if (!input) return name;

  switch (name) {
    case "Read":
      return `Read(${truncate(shortenPath(input.file_path as string))})`;
    case "Write":
      return `Write(${truncate(shortenPath(input.file_path as string))})`;
    case "Edit":
      return `Edit(${truncate(shortenPath(input.file_path as string))})`;
    case "Glob":
      return `Glob(${truncate(input.pattern as string)})`;
    case "Grep":
      return `Grep(${truncate(input.pattern as string)})`;
    case "Bash": {
      const cmd = (input.command as string) || "";
      return `Bash(${truncate(cmd)})`;
    }
    case "Agent":
      return `Agent(${truncate(input.subagent_type as string || "general")})`;
    case "Skill":
      return `Skill(${truncate(input.skill as string)})`;
    default:
      return name;
  }
}

function shortenPath(p: string | undefined): string {
  if (!p) return "?";
  // 只保留最后两级路径
  const parts = p.split("/");
  if (parts.length <= 2) return p;
  return ".../" + parts.slice(-2).join("/");
}

// ---------- 文件操作统计 ----------

function categorizeFileOps(allToolCalls: string[]): SessionDigest["fileOps"] {
  const read = new Set<string>();
  const modified = new Set<string>();
  const created = new Set<string>();
  const commands = new Set<string>();
  const subagents = new Set<string>();

  for (const call of allToolCalls) {
    const readMatch = call.match(/^Read\((.+)\)$/);
    if (readMatch) {
      read.add(readMatch[1]);
      continue;
    }
    const editMatch = call.match(/^Edit\((.+)\)$/);
    if (editMatch) {
      modified.add(editMatch[1]);
      continue;
    }
    const writeMatch = call.match(/^Write\((.+)\)$/);
    if (writeMatch) {
      created.add(writeMatch[1]);
      continue;
    }
    const bashMatch = call.match(/^Bash\((.+)\)$/);
    if (bashMatch) {
      commands.add(bashMatch[1]);
      continue;
    }
    const agentMatch = call.match(/^Agent\((.+)\)$/);
    if (agentMatch) {
      subagents.add(agentMatch[1]);
      continue;
    }
  }

  return {
    read: [...read],
    modified: [...modified],
    created: [...created],
    commands: [...commands],
    subagents: [...subagents],
  };
}

// ---------- 组装对话轮次 ----------

function buildTurns(
  messages: RawMessage[],
  incrementalFrom?: number
): { turns: DialogueTurn[]; resultMsgs: RawMessage[] } {
  const turns: DialogueTurn[] = [];
  const resultMsgs: RawMessage[] = [];

  let currentUserText = "";
  let currentUserTs = 0;
  let assistantSegments: Array<{ type: "text"; text: string } | { type: "tool"; call: string } | { type: "readonly"; counts: Record<string, number> }> = [];
  let assistantToolCalls: string[] = [];
  let turnIndex = 0;

  function flushTurn() {
    if (currentUserText || assistantSegments.length > 0) {
      turnIndex++;
      turns.push({
        index: turnIndex,
        timestamp: currentUserTs,
        timeStr: currentUserTs ? formatTimestamp(currentUserTs) : "",
        userText: currentUserText.trim(),
        segments: [...assistantSegments],
        toolCalls: [...assistantToolCalls],
      });
      currentUserText = "";
      currentUserTs = 0;
      assistantSegments = [];
      assistantToolCalls = [];
    }
  }

  for (const msg of messages) {
    const ts = getTimestamp(msg);

    // 增量过滤
    if (incrementalFrom && ts && ts < incrementalFrom) continue;

    // compact boundary — 跳过
    if (msg.type === "system" && msg.subtype === "compact_boundary") continue;

    // result 消息
    if (msg.type === "result" || (isLegacyFormat(msg) && msg.role === "status")) {
      resultMsgs.push(msg);
      flushTurn();
      continue;
    }

    // 用户消息
    const userText = extractUserText(msg);
    if (userText !== null) {
      flushTurn();
      currentUserText = userText;
      currentUserTs = ts;
      continue;
    }

    // Assistant 消息
    const isAssistant =
      msg.type === "assistant" || (isLegacyFormat(msg) && msg.role === "assistant");
    if (isAssistant) {
      const { segments, toolCalls } = extractAssistantContent(msg);
      for (const seg of segments) {
        if (seg.type === "readonly") {
          const last = assistantSegments[assistantSegments.length - 1];
          if (last && last.type === "readonly") {
            for (const [name, count] of Object.entries(seg.counts)) {
              last.counts[name] = (last.counts[name] || 0) + count;
            }
          } else {
            assistantSegments.push({ ...seg, counts: { ...seg.counts } });
          }
        } else {
          assistantSegments.push(seg);
        }
      }
      assistantToolCalls.push(...toolCalls);
      continue;
    }
  }

  flushTurn();
  return { turns, resultMsgs };
}

// ---------- 生成摘要统计 ----------

function buildMeta(
  resultMsgs: RawMessage[],
  messages: RawMessage[],
  sessionMeta?: { title?: string; workspaceName?: string; createdAt?: number; updatedAt?: number }
): SessionDigest["meta"] {
  let totalCost = 0;
  let totalRounds = 0;
  const models = new Set<string>();

  for (const r of resultMsgs) {
    totalCost += r.total_cost_usd || 0;
    totalRounds++;
    if (r.modelUsage) {
      for (const m of Object.keys(r.modelUsage)) {
        models.add(m);
      }
    }
  }

  const firstTs = messages.length > 0 ? getTimestamp(messages[0]) : 0;
  const lastTs = messages.length > 0 ? getTimestamp(messages[messages.length - 1]) : 0;
  const duration = lastTs - firstTs;

  return {
    workspaceName: sessionMeta?.workspaceName,
    createdAt: sessionMeta?.createdAt ? formatTimestamp(sessionMeta.createdAt) : (firstTs ? formatTimestamp(firstTs) : "unknown"),
    updatedAt: sessionMeta?.updatedAt ? formatTimestamp(sessionMeta.updatedAt) : (lastTs ? formatTimestamp(lastTs) : "unknown"),
    durationStr: duration > 0 ? formatDuration(duration) : "unknown",
    totalRounds,
    totalCost: Math.round(totalCost * 1000) / 1000,
    models: [...models],
  };
}

// ---------- 生成增量会话的前情提要 ----------

function buildPreviousSummary(
  messages: RawMessage[],
  incrementalFrom: number
): string {
  // 从增量起点之前的消息中提取核心信息
  const priorMessages = messages.filter(
    (m) => getTimestamp(m) < incrementalFrom
  );
  if (priorMessages.length === 0) return "";

  // 提取前次的用户消息关键词
  const userTexts: string[] = [];
  for (const m of priorMessages) {
    const text = extractUserText(m);
    if (text) {
      // 只取前100字符
      userTexts.push(text.slice(0, 100));
    }
  }

  const priorResultMsgs = priorMessages.filter(
    (m) => m.type === "result"
  );
  const priorCost = priorResultMsgs.reduce(
    (sum, r) => sum + (r.total_cost_usd || 0),
    0
  );
  const priorRounds = priorResultMsgs.length;

  const lines: string[] = [];
  lines.push(`此会话在增量起点之前已有 ${priorRounds} 轮对话，费用 $${priorCost.toFixed(3)}`);
  if (userTexts.length > 0) {
    lines.push(`前次用户话题摘要：`);
    // 只取最近3条用户消息
    for (const t of userTexts.slice(-3)) {
      lines.push(`- ${t}${t.length >= 100 ? "..." : ""}`);
    }
  }

  return lines.join("\n");
}

// ---------- 渲染 Markdown ----------

function renderMarkdown(digest: SessionDigest): string {
  const lines: string[] = [];

  lines.push(`# 会话摘要: ${digest.title}`);
  lines.push("");
  lines.push("## 元信息");
  lines.push(`- 会话ID: ${digest.sessionId}`);
  lines.push(`- 类型: ${digest.sessionType === "agent" ? "Agent 会话" : "Chat 对话"}`);
  if (digest.meta.workspaceName) {
    lines.push(`- 工作区: ${digest.meta.workspaceName}`);
  }
  lines.push(`- 创建时间: ${digest.meta.createdAt}`);
  lines.push(`- 最后更新: ${digest.meta.updatedAt}`);
  lines.push(`- 持续时长: ${digest.meta.durationStr}`);
  lines.push(`- 对话轮次: ${digest.meta.totalRounds} 轮`);
  lines.push(`- 总费用: $${digest.meta.totalCost}`);
  if (digest.meta.models.length > 0) {
    lines.push(`- 使用模型: ${digest.meta.models.join(", ")}`);
  }
  lines.push("");

  // 增量前情提要
  if (digest.isIncremental && digest.previousSummary) {
    lines.push("## 前情提要（增量起点之前）");
    lines.push(`> ${digest.previousSummary.split("\n").join("\n> ")}`);
    lines.push("");
    lines.push(`> **以下为增量内容（${formatTimestamp(digest.incrementalFrom!)} 之后）**`);
    lines.push("");
  }

  // 对话内容
  lines.push("## 对话内容");
  lines.push("");

  for (const turn of digest.turns) {
    lines.push(`### 轮次 ${turn.index}${turn.timeStr ? ` (${turn.timeStr})` : ""}`);

    if (turn.userText) {
      const userDisplay =
        turn.userText.length > 300
          ? turn.userText.slice(0, 300) + "\n...(截断)"
          : turn.userText;
      lines.push(`**用户**: ${userDisplay}`);
    }

    for (const seg of turn.segments) {
      if (seg.type === "text") {
        const display = seg.text.length > 500 ? seg.text.slice(0, 500) + "\n...(截断)" : seg.text;
        lines.push(`**Agent**: ${display}`);
      } else if (seg.type === "readonly") {
        const summary = Object.entries(seg.counts)
          .map(([name, count]) => count > 1 ? `${name} ×${count}` : name)
          .join(", ");
        lines.push(summary);
      } else {
        lines.push(seg.call);
      }
    }

    lines.push("");
  }

  // 文件操作统计（仅 Agent 会话）
  if (digest.sessionType === "agent") {
    const ops = digest.fileOps;
    const hasOps =
      ops.read.length + ops.modified.length + ops.created.length +
      ops.commands.length + ops.subagents.length > 0;

    if (hasOps) {
      lines.push("## Agent 行为统计");
      if (ops.read.length > 0) {
        lines.push(`- 读取文件: ${ops.read.join(", ")}`);
      }
      if (ops.modified.length > 0) {
        lines.push(`- 修改文件: ${ops.modified.join(", ")}`);
      }
      if (ops.created.length > 0) {
        lines.push(`- 创建文件: ${ops.created.join(", ")}`);
      }
      if (ops.commands.length > 0) {
        lines.push(`- 执行命令: ${ops.commands.slice(0, 10).join(", ")}${ops.commands.length > 10 ? ` ...等${ops.commands.length}条` : ""}`);
      }
      if (ops.subagents.length > 0) {
        lines.push(`- SubAgent: ${ops.subagents.join(", ")}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------- 主逻辑 ----------

function extractDigest(
  sessionId: string,
  sessionType: "agent" | "chat",
  incrementalFrom?: number,
  sessionMeta?: { title?: string; workspaceName?: string; createdAt?: number; updatedAt?: number }
): string {
  // 确定 JSONL 路径
  const jsonlPath =
    sessionType === "agent"
      ? resolve(PATHS.agentSessionLogs, `${sessionId}.jsonl`)
      : resolve(PATHS.conversationLogs, `${sessionId}.jsonl`);

  const allMessages = parseJsonl(jsonlPath);
  if (allMessages.length === 0) {
    return `# 会话摘要: ${sessionMeta?.title || sessionId}\n\n(会话为空，无消息记录)`;
  }

  const { turns, resultMsgs } = buildTurns(allMessages, incrementalFrom);
  const meta = buildMeta(resultMsgs, allMessages, sessionMeta);

  // 收集所有工具调用
  const allToolCalls = turns.flatMap((t) => t.toolCalls);
  const fileOps = categorizeFileOps(allToolCalls);

  // 增量前情提要
  let previousSummary: string | undefined;
  if (incrementalFrom) {
    previousSummary = buildPreviousSummary(allMessages, incrementalFrom);
  }

  const title = sessionMeta?.title || sessionId;

  const digest: SessionDigest = {
    title,
    sessionId,
    sessionType,
    isIncremental: !!incrementalFrom,
    incrementalFrom,
    meta,
    previousSummary,
    turns,
    fileOps,
  };

  return renderMarkdown(digest);
}

// ---------- CLI ----------

function main() {
  const args = process.argv.slice(2);
  let sessionId = "";
  let sessionType: "agent" | "chat" = "agent";
  let from: number | undefined;
  let outputPath: string | undefined;
  let title: string | undefined;
  let workspaceName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--id":
        sessionId = args[++i];
        break;
      case "--type":
        sessionType = args[++i] as "agent" | "chat";
        break;
      case "--from":
        from = parseInt(args[++i], 10);
        break;
      case "--output":
        outputPath = args[++i];
        break;
      case "--title":
        title = args[++i];
        break;
      case "--workspace":
        workspaceName = args[++i];
        break;
    }
  }

  if (!sessionId) {
    console.error("Usage: extract-session-digest.ts --id <sessionId> --type agent|chat [--from timestamp] [--output path]");
    process.exit(1);
  }

  const md = extractDigest(sessionId, sessionType, from, { title, workspaceName });

  if (outputPath) {
    writeFileSync(outputPath, md, "utf-8");
    console.log(`Digest written to ${outputPath}`);
  } else {
    console.log(md);
  }
}

main();
