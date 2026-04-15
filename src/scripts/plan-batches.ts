#!/usr/bin/env npx tsx
/**
 * plan-batches.ts
 *
 * 根据已收集的会话列表，计算分批方案并写入临时文件。
 * 主 Agent 读取该文件后直接按批次布置 SubAgent，无需自行推算分批逻辑。
 *
 * 用法：
 *   # init 模式：从 gather-all-sessions 的输出中读取会话列表
 *   npx tsx src/scripts/plan-batches.ts --mode init \
 *     --input /tmp/memory-init-sessions-part1.json \
 *     --input2 /tmp/memory-init-sessions-part2.json \
 *     --output /tmp/memory-init-batches.json
 *
 *   # daily 模式：从 gather-sessions 的输出中读取会话列表
 *   npx tsx src/scripts/plan-batches.ts --mode daily \
 *     --input /tmp/memory-gather.json \
 *     --output /tmp/memory-daily-batches.json
 *
 * 输出格式（JSON）：
 * {
 *   mode: "init" | "daily",
 *   totalSessions: number,
 *   totalBatches: number,       // daily 模式若不需要分批则为 1
 *   needsBatching: boolean,     // daily 模式特有：是否需要多批次
 *   batches: [
 *     {
 *       batchNo: number,        // 从 1 开始
 *       totalBatches: number,   // 便于 SubAgent prompt 中填 "第 N 批（共 M 批）"
 *       isFirst: boolean,       // init 模式：是否为创建批
 *       isLast: boolean,        // 是否为最后一批（需要写日志和日记）
 *       sessionIds: string[],   // 本批会话 ID 列表
 *     }
 *   ]
 * }
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ---------- 类型 ----------

interface SessionEntry {
  id: string;
  createdAt: number;
  createdAtStr: string;
  [key: string]: unknown;
}

interface BatchEntry {
  batchNo: number;
  totalBatches: number;
  isFirst: boolean;
  isLast: boolean;
  sessionIds: string[];
}

interface BatchPlan {
  mode: "init" | "daily";
  totalSessions: number;
  totalBatches: number;
  needsBatching: boolean;
  batches: BatchEntry[];
}

// ---------- 工具 ----------

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------- init 分批逻辑 ----------
// 规则：
//   1. 按 createdAt 升序（gather-all-sessions 已排好序）
//   2. 每 10 个一批
//   3. 最后一天的会话必须单独成最后一批（即使不满 10 个）
//      若最后一天会话原本在最后一批且数量 ≤ 10，直接作为单独一批（不额外拆分）

function planInitBatches(sessions: SessionEntry[]): BatchEntry[] {
  if (sessions.length === 0) return [];

  // 找出最后一天的日期（取 createdAtStr 的日期部分 YYYY-MM-DD）
  const lastDateStr = sessions[sessions.length - 1].createdAtStr.slice(0, 10);
  const lastDaySessions = sessions.filter(
    (s) => s.createdAtStr.slice(0, 10) === lastDateStr
  );
  const historySessions = sessions.filter(
    (s) => s.createdAtStr.slice(0, 10) !== lastDateStr
  );

  // 历史批次（每 10 个一批）
  const historyChunks = chunkArray(historySessions, 10);

  // 最后一天作为单独最后一批
  const allChunks = [...historyChunks, lastDaySessions];
  const total = allChunks.length;

  return allChunks.map((chunk, i) => ({
    batchNo: i + 1,
    totalBatches: total,
    isFirst: i === 0,
    isLast: i === total - 1,
    sessionIds: chunk.map((s) => s.id),
  }));
}

// ---------- daily 分批逻辑 ----------
// 规则：
//   - 总会话数 ≤ 16：不分批，单批处理（needsBatching: false）
//   - 总会话数 > 16：每 10 个一批（needsBatching: true）

const DAILY_BATCH_THRESHOLD = 16;
const DAILY_BATCH_SIZE = 10;

function planDailyBatches(sessions: SessionEntry[]): { batches: BatchEntry[]; needsBatching: boolean } {
  if (sessions.length === 0) {
    return { batches: [], needsBatching: false };
  }

  if (sessions.length <= DAILY_BATCH_THRESHOLD) {
    return {
      needsBatching: false,
      batches: [
        {
          batchNo: 1,
          totalBatches: 1,
          isFirst: true,
          isLast: true,
          sessionIds: sessions.map((s) => s.id),
        },
      ],
    };
  }

  const chunks = chunkArray(sessions, DAILY_BATCH_SIZE);
  const total = chunks.length;
  return {
    needsBatching: true,
    batches: chunks.map((chunk, i) => ({
      batchNo: i + 1,
      totalBatches: total,
      isFirst: i === 0,
      isLast: i === total - 1,
      sessionIds: chunk.map((s) => s.id),
    })),
  };
}

// ---------- CLI ----------

function main() {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  const inputs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputs.push(args[++i]);
    } else if (args[i] === "--input2" && args[i + 1]) {
      inputs.push(args[++i]);
    } else if (args[i].startsWith("--") && args[i + 1]) {
      opts[args[i].slice(2)] = args[++i];
    }
  }

  const mode = opts.mode as "init" | "daily";
  const outputPath = opts.output;

  if (!mode || !outputPath || inputs.length === 0) {
    console.error("Usage: plan-batches.ts --mode <init|daily> --input <path> [--input2 <path>] --output <path>");
    process.exit(1);
  }

  // 读取并合并会话列表
  let sessions: SessionEntry[] = [];

  for (const inputPath of inputs) {
    if (!existsSync(inputPath)) {
      console.error(`Input file not found: ${inputPath}`);
      process.exit(1);
    }
    const data = loadJson<{ sessions?: SessionEntry[]; newSessions?: SessionEntry[]; updatedSessions?: SessionEntry[] }>(inputPath);
    // init 模式：sessions 字段；daily 模式：newSessions + updatedSessions
    if (data.sessions) {
      sessions = sessions.concat(data.sessions);
    } else {
      if (data.newSessions) sessions = sessions.concat(data.newSessions);
      if (data.updatedSessions) sessions = sessions.concat(data.updatedSessions);
    }
  }

  // 按 createdAt 升序保证顺序一致
  sessions.sort((a, b) => a.createdAt - b.createdAt);

  let plan: BatchPlan;

  if (mode === "init") {
    const batches = planInitBatches(sessions);
    plan = {
      mode: "init",
      totalSessions: sessions.length,
      totalBatches: batches.length,
      needsBatching: batches.length > 1,
      batches,
    };
  } else {
    const { batches, needsBatching } = planDailyBatches(sessions);
    plan = {
      mode: "daily",
      totalSessions: sessions.length,
      totalBatches: batches.length,
      needsBatching,
      batches,
    };
  }

  writeFileSync(outputPath, JSON.stringify(plan, null, 2), "utf-8");

  // 输出摘要到 stdout
  console.log(`Mode: ${plan.mode} | Sessions: ${plan.totalSessions} | Batches: ${plan.totalBatches} | NeedsBatching: ${plan.needsBatching}`);
  for (const b of plan.batches) {
    const tags = [b.isFirst && "first", b.isLast && "last"].filter(Boolean).join(", ");
    console.log(`  Batch ${b.batchNo}/${b.totalBatches}: ${b.sessionIds.length} sessions${tags ? ` [${tags}]` : ""}`);
  }
  console.log(`→ ${outputPath}`);
}

main();
