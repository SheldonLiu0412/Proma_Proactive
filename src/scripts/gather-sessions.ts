#!/usr/bin/env npx tsx
/**
 * gather-sessions.ts
 *
 * 收集指定日期内活跃的会话（Agent 会话 + Chat 会话）。
 * 区分新建会话和增量更新的旧会话。
 * 自动排除当前 Memory 专用工作区自身的会话。
 *
 * 用法：
 *   npx tsx src/scripts/gather-sessions.ts [--date YYYY-MM-DD] [--output path] [--with-digests dir] [--plan-batches path]
 *
 * --with-digests: 收集完成后自动为每个会话提取摘要，保存到指定目录（自动处理 new/updated 的增量参数）
 * --plan-batches: 摘要提取完成后自动计算分批方案，输出到指定路径（需同时指定 --output 和 --with-digests）
 * 默认日期为今天，输出到 stdout（或指定文件）。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";
import { PATHS } from "../utils/paths.js";
import { fileURLToPath } from "url";
import { loadMemoryInstanceConfig } from "../utils/instance-config.mjs";
import { getDayRange, formatTimestamp } from "../utils/time.js";

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

interface DreamState {
  lastRunAt: string | null;
  lastProcessedSessions: { new: string[]; updated: string[] };
  processedSessionTimestamps: Record<string, number>;
  totalRuns: number;
}

interface GatheredSession {
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
}

interface GatheredNewSession extends GatheredSession {
  kind: "new";
}

interface GatheredUpdatedSession extends GatheredSession {
  kind: "updated";
  lastProcessedAt: number;
  incrementalFrom: number;
}

interface GatherResult {
  date: string;
  gatheredAt: string;
  newSessions: GatheredNewSession[];
  updatedSessions: GatheredUpdatedSession[];
  summary: {
    totalNew: number;
    totalUpdated: number;
    totalSkipped: number;
  };
}

// ---------- 工具函数 ----------

function countJsonlLines(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const content = readFileSync(filePath, "utf-8");
  return content.split("\n").filter((line) => line.trim().length > 0).length;
}

/**
 * 读取 JSONL 文件最后一条消息的 _createdAt 时间戳。
 * 这是判断会话是否有真实新内容的关键——metadata 的 updatedAt 可能因重新打开而变化。
 */
function getLastMessageTimestamp(filePath: string): number | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;
  // 从最后一行往前找，取第一个有 _createdAt 的
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

function buildWorkspaceMap(
  workspaces: WorkspaceMeta[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ws of workspaces) {
    map.set(ws.id, ws.name);
  }
  return map;
}

// ---------- 主逻辑 ----------

function gatherSessions(dateStr?: string): GatherResult {
  const { start, end, dateStr: resolvedDate } = getDayRange(dateStr);
  const config = loadMemoryInstanceConfig();
  const excludedWorkspaceId = config.memoryWorkspace.id;

  // 加载数据
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
  const state = loadJson<DreamState>(PATHS.state, {
    lastRunAt: null,
    lastProcessedSessions: { new: [], updated: [] },
    processedSessionTimestamps: {},
    totalRuns: 0,
  });

  const wsMap = buildWorkspaceMap(wsData.workspaces);

  const newSessions: GatheredNewSession[] = [];
  const updatedSessions: GatheredUpdatedSession[] = [];
  let skipped = 0;

  // 处理 Agent 会话
  for (const s of agentData.sessions) {
    // 排除 Memory 专用工作区自身的会话，避免自我分析
    if (s.workspaceId === excludedWorkspaceId) {
      skipped++;
      continue;
    }

    const jsonlPath = resolve(PATHS.agentSessionLogs, `${s.id}.jsonl`);
    const messageCount = countJsonlLines(jsonlPath);

    // 过滤空会话（没有消息记录）
    if (messageCount === 0) {
      skipped++;
      continue;
    }

    // 用 JSONL 最后一条消息的真实时间戳判断是否今日活跃
    // metadata 的 updatedAt 可能因重新打开会话而变化，不可靠
    const lastMsgTs = getLastMessageTimestamp(jsonlPath);
    const effectiveUpdatedAt = lastMsgTs || s.updatedAt;
    const activeToday = effectiveUpdatedAt >= start && effectiveUpdatedAt <= end;
    if (!activeToday) continue;

    const isNew = s.createdAt >= start && s.createdAt <= end;

    const base: GatheredSession = {
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
    };

    if (isNew) {
      newSessions.push({ ...base, kind: "new" });
    } else {
      const lastProcessedAt = state.processedSessionTimestamps[s.id];
      // 对比真实消息时间戳，而非 metadata updatedAt
      if (lastProcessedAt && effectiveUpdatedAt <= lastProcessedAt) {
        skipped++;
        continue;
      }
      updatedSessions.push({
        ...base,
        kind: "updated",
        lastProcessedAt: lastProcessedAt || s.createdAt,
        incrementalFrom: lastProcessedAt || s.createdAt,
      });
    }
  }

  // 处理 Chat 会话
  for (const c of chatData.conversations) {
    const jsonlPath = resolve(PATHS.conversationLogs, `${c.id}.jsonl`);
    const messageCount = countJsonlLines(jsonlPath);

    // 过滤空会话
    if (messageCount === 0) {
      skipped++;
      continue;
    }

    // 用 JSONL 最后一条消息的真实时间戳判断
    const lastMsgTs = getLastMessageTimestamp(jsonlPath);
    const effectiveUpdatedAt = lastMsgTs || c.updatedAt;
    const activeToday = effectiveUpdatedAt >= start && effectiveUpdatedAt <= end;
    if (!activeToday) continue;

    const isNew = c.createdAt >= start && c.createdAt <= end;

    const base: GatheredSession = {
      id: c.id,
      title: c.title,
      type: "chat",
      modelId: c.modelId,
      createdAt: c.createdAt,
      updatedAt: effectiveUpdatedAt,
      createdAtStr: formatTimestamp(c.createdAt),
      updatedAtStr: formatTimestamp(effectiveUpdatedAt),
      messageCount,
    };

    if (isNew) {
      newSessions.push({ ...base, kind: "new" });
    } else {
      const lastProcessedAt = state.processedSessionTimestamps[c.id];
      if (lastProcessedAt && effectiveUpdatedAt <= lastProcessedAt) {
        skipped++;
        continue;
      }
      updatedSessions.push({
        ...base,
        kind: "updated",
        lastProcessedAt: lastProcessedAt || c.createdAt,
        incrementalFrom: lastProcessedAt || c.createdAt,
      });
    }
  }

  // 按 updatedAt 降序排列
  newSessions.sort((a, b) => b.updatedAt - a.updatedAt);
  updatedSessions.sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    date: resolvedDate,
    gatheredAt: new Date().toISOString(),
    newSessions,
    updatedSessions,
    summary: {
      totalNew: newSessions.length,
      totalUpdated: updatedSessions.length,
      totalSkipped: skipped,
    },
  };
}

// ---------- CLI ----------

function main() {
  const args = process.argv.slice(2);
  let dateStr: string | undefined;
  let outputPath: string | undefined;
  let digestsDir: string | undefined;
  let planBatchesPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) {
      dateStr = args[++i];
    } else if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === "--with-digests" && args[i + 1]) {
      digestsDir = args[++i];
    } else if (args[i] === "--plan-batches" && args[i + 1]) {
      planBatchesPath = args[++i];
    }
  }

  const result = gatherSessions(dateStr);
  const json = JSON.stringify(result, null, 2);

  if (outputPath) {
    writeFileSync(outputPath, json, "utf-8");
    console.log(
      `Gathered ${result.summary.totalNew} new + ${result.summary.totalUpdated} updated sessions → ${outputPath}`
    );
  } else {
    console.log(json);
  }

  if (digestsDir) {
    mkdirSync(digestsDir, { recursive: true });
    const scriptDir = import.meta.dirname ?? fileURLToPath(new URL(".", import.meta.url));
    const extractScript = resolve(scriptDir, "extract-session-digest.ts");
    const cwd = resolve(scriptDir, "..", "..");
    let success = 0;
    let failed = 0;

    const allSessions = [...result.newSessions, ...result.updatedSessions];

    for (const sess of allSessions) {
      const outFile = resolve(digestsDir, `${sess.id}.md`);
      if (existsSync(outFile)) { success++; continue; }
      try {
        const fromArg = sess.kind === "updated" ? `--from ${sess.incrementalFrom}` : "";
        execSync(
          `npx tsx "${extractScript}" --id ${sess.id} --type ${sess.type} ${fromArg} --output "${outFile}"`,
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

  if (planBatchesPath && outputPath) {
    const scriptDir = import.meta.dirname ?? fileURLToPath(new URL(".", import.meta.url));
    const planScript = resolve(scriptDir, "plan-batches.ts");
    const cwd = resolve(scriptDir, "..", "..");
    execSync(
      `npx tsx "${planScript}" --mode daily --input "${outputPath}" --output "${planBatchesPath}"`,
      { cwd, stdio: "inherit" }
    );
  }
}

main();
