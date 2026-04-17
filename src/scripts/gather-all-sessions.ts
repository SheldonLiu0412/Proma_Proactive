#!/usr/bin/env npx tsx
/**
 * gather-all-sessions.ts
 *
 * 收集所有历史会话（Agent + Chat），用于 Memory 初始化。
 * 过滤掉 Memory 专用工作区自身的会话和空会话。
 * Agent 会话额外过滤少于 minTurns 轮对话的（默认 3）。
 *
 * 用法：
 *   npx tsx src/scripts/gather-all-sessions.ts [--min-turns N] [--limit N] [--output path] [--with-digests dir]
 *
 * --limit: 总会话上限，优先保留 Agent 类型，再优先保留最近的
 * --with-digests: 收集完成后自动为每个会话提取摘要，保存到指定目录
 * --output: 输出会自动拆分为 <path>-part1.json 和 <path>-part2.json
 *
 * 输出：按 createdAt 升序排列的全部有效会话列表。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import { PATHS } from "../utils/paths.js";
import { loadMemoryInstanceConfig } from "../utils/instance-config.mjs";
import { formatTimestamp } from "../utils/time.js";

// ---------- 类型定义 ----------

interface AgentSessionMeta {
  id: string;
  title: string;
  workspaceId?: string;
  channelId?: string;
  sdkSessionId?: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  pinned?: boolean;
}

interface ChatSessionMeta {
  id: string;
  title: string;
  modelId?: string;
  channelId?: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
}

interface WorkspaceMeta {
  id: string;
  name: string;
  slug: string;
}

interface AllSession {
  id: string;
  title: string;
  type: "agent" | "chat";
  workspaceId?: string;
  workspaceName?: string;
  modelId?: string;
  createdAt: number;
  updatedAt: number;
  createdAtStr: string;
  updatedAtStr: string;
  messageCount: number;
  turnCount: number;
}

interface GatherAllResult {
  gatheredAt: string;
  minTurns: number;
  sessions: AllSession[];
  summary: {
    totalAgent: number;
    totalChat: number;
    totalFiltered: number;
    totalValid: number;
  };
}

// ---------- 工具函数 ----------

function countJsonlLines(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const content = readFileSync(filePath, "utf-8");
  return content.split("\n").filter((line) => line.trim().length > 0).length;
}

/**
 * 统计 JSONL 中用户消息的数量（即对话轮数）。
 */
function countUserTurns(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  let turns = 0;
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.role === "user" || msg.type === "user") turns++;
    } catch {
      continue;
    }
  }
  return turns;
}

function getLastMessageTimestamp(filePath: string): number | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const msg = JSON.parse(lines[i]);
      if (msg._createdAt) return msg._createdAt;
    } catch {
      continue;
    }
  }
  return null;
}

function loadJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

// ---------- 主逻辑 ----------

function gatherAllSessions(minTurns: number): GatherAllResult {
  const config = loadMemoryInstanceConfig();
  const excludedWorkspaceId = config.memoryWorkspace.id;
  const agentData = loadJson<{ sessions: AgentSessionMeta[] }>(
    PATHS.agentSessions,
    { sessions: [] }
  );
  const chatData = loadJson<{ conversations: ChatSessionMeta[] }>(
    PATHS.conversations,
    { conversations: [] }
  );
  const wsData = loadJson<{ workspaces: WorkspaceMeta[] }>(
    PATHS.workspaces,
    { workspaces: [] }
  );

  const wsMap = new Map<string, string>();
  for (const ws of wsData.workspaces) {
    wsMap.set(ws.id, ws.name);
  }

  const sessions: AllSession[] = [];
  let filtered = 0;

  // Agent 会话
  for (const s of agentData.sessions) {
    if (s.workspaceId === excludedWorkspaceId) {
      filtered++;
      continue;
    }

    const jsonlPath = resolve(PATHS.agentSessionLogs, `${s.id}.jsonl`);
    const messageCount = countJsonlLines(jsonlPath);

    if (messageCount === 0) {
      filtered++;
      continue;
    }

    const turnCount = countUserTurns(jsonlPath);
    if (turnCount < minTurns) {
      filtered++;
      continue;
    }

    const lastMsgTs = getLastMessageTimestamp(jsonlPath);
    const effectiveUpdatedAt = lastMsgTs || s.updatedAt;

    sessions.push({
      id: s.id,
      title: s.title,
      type: "agent",
      workspaceId: s.workspaceId,
      workspaceName: s.workspaceId ? wsMap.get(s.workspaceId) : undefined,
      createdAt: s.createdAt,
      updatedAt: effectiveUpdatedAt,
      createdAtStr: formatTimestamp(s.createdAt),
      updatedAtStr: formatTimestamp(effectiveUpdatedAt),
      messageCount,
      turnCount,
    });
  }

  const totalAgent = sessions.length;

  // Chat 会话 — 不做 minTurns 过滤，只过滤空会话
  for (const c of chatData.conversations) {
    const jsonlPath = resolve(PATHS.conversationLogs, `${c.id}.jsonl`);
    const messageCount = countJsonlLines(jsonlPath);

    if (messageCount === 0) {
      filtered++;
      continue;
    }

    const turnCount = countUserTurns(jsonlPath);
    if (turnCount < 1) {
      filtered++;
      continue;
    }

    const lastMsgTs = getLastMessageTimestamp(jsonlPath);
    const effectiveUpdatedAt = lastMsgTs || c.updatedAt;

    sessions.push({
      id: c.id,
      title: c.title,
      type: "chat",
      modelId: c.modelId,
      createdAt: c.createdAt,
      updatedAt: effectiveUpdatedAt,
      createdAtStr: formatTimestamp(c.createdAt),
      updatedAtStr: formatTimestamp(effectiveUpdatedAt),
      messageCount,
      turnCount,
    });
  }

  const totalChat = sessions.length - totalAgent;

  // 按 createdAt 升序排列（时间顺序）
  sessions.sort((a, b) => a.createdAt - b.createdAt);

  return {
    gatheredAt: new Date().toISOString(),
    minTurns,
    sessions,
    summary: {
      totalAgent,
      totalChat,
      totalFiltered: filtered,
      totalValid: sessions.length,
    },
  };
}

// ---------- CLI ----------

function main() {
  const args = process.argv.slice(2);
  let minTurns = 2;
  let outputPath: string | undefined;
  let digestsDir: string | undefined;
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--min-turns" && args[i + 1]) {
      minTurns = parseInt(args[++i], 10);
    } else if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === "--with-digests" && args[i + 1]) {
      digestsDir = args[++i];
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    }
  }

  const result = gatherAllSessions(minTurns);

  // 如果设置了 limit，优先保留 Agent 会话，再保留最近的
  if (limit && result.sessions.length > limit) {
    const beforeCount = result.sessions.length;
    // 按 type 分组（保持时间顺序不变）
    const agents = result.sessions.filter((s) => s.type === "agent");
    const chats = result.sessions.filter((s) => s.type === "chat");

    let selected: AllSession[];
    if (agents.length >= limit) {
      // Agent 就够了，取最近的 limit 个（数组已按 createdAt 升序，从尾部取）
      selected = agents.slice(-limit);
    } else {
      // Agent 全保留，剩余名额给最近的 Chat
      const chatSlots = limit - agents.length;
      const selectedChats = chats.slice(-chatSlots);
      selected = [...agents, ...selectedChats];
    }
    // 重新按 createdAt 升序排列
    selected.sort((a, b) => a.createdAt - b.createdAt);
    result.sessions = selected;

    const newAgent = selected.filter((s) => s.type === "agent").length;
    const newChat = selected.filter((s) => s.type === "chat").length;
    result.summary.totalAgent = newAgent;
    result.summary.totalChat = newChat;
    result.summary.totalValid = selected.length;
    console.log(
      `Limit applied: ${beforeCount} → ${selected.length} (${newAgent} agent + ${newChat} chat, prefer agent + recent)`
    );
  }

  // 输出：如果指定了 outputPath，拆分为两个文件避免单文件过长
  if (outputPath) {
    const half = Math.ceil(result.sessions.length / 2);
    const part1Sessions = result.sessions.slice(0, half);
    const part2Sessions = result.sessions.slice(half);

    const basePath = outputPath.replace(/\.json$/, "");

    const part1: GatherAllResult = {
      ...result,
      sessions: part1Sessions,
      summary: { ...result.summary, totalValid: result.sessions.length },
    };
    const part2: GatherAllResult = {
      ...result,
      sessions: part2Sessions,
      summary: { ...result.summary, totalValid: result.sessions.length },
    };

    writeFileSync(`${basePath}-part1.json`, JSON.stringify(part1, null, 2), "utf-8");
    writeFileSync(`${basePath}-part2.json`, JSON.stringify(part2, null, 2), "utf-8");

    console.log(
      `Gathered ${result.summary.totalValid} valid sessions (${result.summary.totalAgent} agent + ${result.summary.totalChat} chat, filtered ${result.summary.totalFiltered})`
    );
    console.log(
      `  → ${basePath}-part1.json (${part1Sessions.length} sessions)\n  → ${basePath}-part2.json (${part2Sessions.length} sessions)`
    );
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  // 批量提取摘要
  if (digestsDir) {
    mkdirSync(digestsDir, { recursive: true });
    const extractScript = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "extract-session-digest.ts");
    const cwd = resolve(extractScript, "..", "..");
    let success = 0;
    let failed = 0;

    for (const sess of result.sessions) {
      const outFile = resolve(digestsDir, `${sess.id}.md`);
      if (existsSync(outFile)) {
        success++;
        continue; // 已存在则跳过
      }
      try {
        execSync(
          `npx tsx "${extractScript}" --id ${sess.id} --type ${sess.type} --output "${outFile}"`,
          { cwd, stdio: "pipe", timeout: 30000 }
        );
        success++;
      } catch (err: unknown) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [SKIP] ${sess.id} (${sess.title}): ${msg.split("\n")[0]}`);
      }
    }

    console.log(`Digests: ${success} extracted, ${failed} failed → ${digestsDir}`);
  }
}

main();
