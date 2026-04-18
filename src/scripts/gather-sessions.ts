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

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { resolve } from "path";
import { PATHS } from "../utils/paths.mjs";
import { fileURLToPath } from "url";
import { loadMemoryInstanceConfig } from "../utils/instance-config.mjs";
import { getDayRange, formatTimestamp } from "../utils/time.js";
import {
  countJsonlLines,
  getLastMessageTimestamp,
  loadJson,
  buildWorkspaceMap,
  type AgentSessionMeta,
  type ChatSessionMeta,
  type WorkspaceMeta,
} from "../utils/sessions.js";

// ---------- 类型定义 ----------

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
        const fromArgs = sess.kind === "updated" ? ["--from", String(sess.incrementalFrom)] : [];
        execFileSync(
          "npx",
          ["tsx", extractScript, "--id", sess.id, "--type", sess.type, ...fromArgs, "--output", outFile],
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
    execFileSync(
      "npx",
      ["tsx", planScript, "--mode", "daily", "--input", outputPath, "--output", planBatchesPath],
      { cwd, stdio: "inherit" }
    );
  }
}

main();
