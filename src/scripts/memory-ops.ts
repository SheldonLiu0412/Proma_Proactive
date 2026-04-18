#!/usr/bin/env npx tsx
/**
 * memory-ops.ts
 *
 * Memory 存储 CRUD 操作脚本。
 * 保证数据格式一致性，自动处理归档逻辑。
 *
 * 用法：
 *   npx tsx src/scripts/memory-ops.ts <command> [options]
 *
 * 命令：
 *   profile:show                          显示当前画像（Markdown）
 *
 *   sop:list                              列出所有 SOP 候选
 *   sop:create --title <t> --source <sessionId> (--content <c> | --content-file <path>)
 *   sop:update --id <id> [--title <t>] [--status <s>] [--content <c>] [--source <sessionId>]
 *   sop:delete --id <id>
 *
 *   state:show                            显示运行状态
 *   state:complete --sessions <json-array>  标记会话处理完成
 *
 *   correction:add    --type <agent-behavior|skill-update|user-preference> --target <t> --summary <s> --detail <d> --source <sessionId>
 *   correction:edit   --id <id> [--summary <s>] [--detail <d>] [--type <t>] [--target <t>]
 *   correction:delete --id <id>
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { PATHS } from "../utils/paths.mjs";
import { todayStr } from "../utils/time";

// ---------- 工具函数 ----------

function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveJson(path: string, data: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function appendJsonl(path: string, data: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(data) + "\n", "utf-8");
}

function today(): string {
  return todayStr();
}

function genId(prefix: string, items: Array<{ id: string }>): string {
  let max = 0;
  for (const item of items) {
    const match = item.id.match(new RegExp(`^${prefix}_(\\d+)$`));
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}_${String(max + 1).padStart(3, "0")}`;
}

function parseArgs(argv: string[]): { command: string; opts: Record<string, string> } {
  const command = argv[0] || "";
  const opts: Record<string, string> = {};
  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      opts[argv[i].slice(2)] = argv[++i];
    }
  }
  return { command, opts };
}

// ---------- Profile 操作 ----------

function profileShow() {
  if (!existsSync(PATHS.profile)) {
    console.log("(empty profile)");
    return;
  }
  console.log(readFileSync(PATHS.profile, "utf-8"));
}

// ---------- SOP 操作 ----------

interface SopEntry {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  seenCount: number;
  file: string;
  representativeSession?: string;
}

function sopList() {
  const index = loadJson<SopEntry[]>(PATHS.sopIndex, []);
  if (index.length === 0) {
    console.log("No SOP candidates");
    return;
  }
  for (const s of index) {
    console.log(`[${s.id}] (${s.status}) ${s.title} | seen: ${s.seenCount}x`);
  }
}

function sopCreate(opts: Record<string, string>) {
  const { title, content, "content-file": contentFile, source } = opts;
  if (!title || !source) {
    console.error("Required: --title, --source");
    process.exit(1);
  }

  const index = loadJson<SopEntry[]>(PATHS.sopIndex, []);
  const id = genId("sop", index);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "untitled";
  const fileName = `${id}_${slug}.md`;
  const d = today();

  const entry: SopEntry = {
    id,
    title,
    status: "candidate",
    createdAt: d,
    updatedAt: d,
    seenCount: 1,
    file: fileName,
    representativeSession: source || undefined,
  };

  index.push(entry);
  saveJson(PATHS.sopIndex, index);

  // 写入 SOP 文件：优先从文件读取，其次 --content，最后报错（不写空壳）
  const filePath = join(PATHS.sopCandidates, fileName);
  let md: string;
  if (contentFile && existsSync(contentFile)) {
    md = readFileSync(contentFile, "utf-8");
  } else if (content) {
    md = content;
  } else {
    console.error(`Error: --content or --content-file required. SOP index entry created but file not written.`);
    process.exit(1);
  }
  writeFileSync(filePath, md, "utf-8");

  console.log(`Created SOP candidate ${id}: ${title} → ${fileName}`);
}

function sopUpdate(opts: Record<string, string>) {
  const { id, title, status, content, "content-file": contentFile, source } = opts;
  if (!id) {
    console.error("Required: --id");
    process.exit(1);
  }

  const index = loadJson<SopEntry[]>(PATHS.sopIndex, []);
  const entry = index.find((s) => s.id === id);
  if (!entry) {
    console.error(`SOP ${id} not found`);
    process.exit(1);
  }

  if (title) entry.title = title;
  if (status) entry.status = status;
  if (source) entry.representativeSession = source;
  entry.updatedAt = today();
  entry.seenCount++;

  saveJson(PATHS.sopIndex, index);

  // 更新文件内容：优先 --content-file，其次 --content
  const filePath = join(PATHS.sopCandidates, entry.file);
  if (contentFile && existsSync(contentFile)) {
    writeFileSync(filePath, readFileSync(contentFile, "utf-8"), "utf-8");
  } else if (content) {
    writeFileSync(filePath, content, "utf-8");
  }

  console.log(`Updated SOP ${id}`);
}

function sopDelete(opts: Record<string, string>) {
  const { id } = opts;
  if (!id) {
    console.error("Required: --id");
    process.exit(1);
  }

  const index = loadJson<SopEntry[]>(PATHS.sopIndex, []);
  const idx = index.findIndex((s) => s.id === id);
  if (idx === -1) {
    console.error(`SOP ${id} not found`);
    process.exit(1);
  }

  const entry = index[idx];
  const filePath = join(PATHS.sopCandidates, entry.file);
  index.splice(idx, 1);
  saveJson(PATHS.sopIndex, index);

  // 删除 SOP 文件（如存在）
  if (existsSync(filePath)) {
    try { unlinkSync(filePath); } catch { /* ignore */ }
  }

  console.log(`Deleted SOP ${id}: ${entry.title}`);
}

// ---------- Corrections 操作 ----------

interface Correction {
  id: string;
  type: "agent-behavior" | "skill-update" | "user-preference";
  target: string;
  summary: string;
  detail: string;
  source: string;
  observedAt: string;
  status: "pending" | "accepted" | "rejected";
}

function correctionAdd(opts: Record<string, string>) {
  const { type, target, summary, detail, source } = opts;
  if (!type || !target || !summary || !detail || !source) {
    console.error("Required: --type, --target, --summary, --detail, --source");
    process.exit(1);
  }
  if (type !== "agent-behavior" && type !== "skill-update" && type !== "user-preference") {
    console.error('--type must be "agent-behavior", "skill-update", or "user-preference"');
    process.exit(1);
  }

  const corrections = loadJson<Correction[]>(PATHS.correctionsActive, []);

  const id = genId("corr", corrections);
  const entry: Correction = {
    id,
    type: type as Correction["type"],
    target,
    summary,
    detail,
    source,
    observedAt: today(),
    status: "pending",
  };

  corrections.push(entry);
  saveJson(PATHS.correctionsActive, corrections);
  console.log(`Added correction ${id} (${type}): ${summary}`);
}

function correctionEdit(opts: Record<string, string>) {
  const { id, summary, detail, type, target } = opts;
  if (!id) {
    console.error("Required: --id");
    process.exit(1);
  }

  const corrections = loadJson<Correction[]>(PATHS.correctionsActive, []);
  const entry = corrections.find((c) => c.id === id);
  if (!entry) {
    console.error(`Correction ${id} not found`);
    process.exit(1);
  }

  // 归档旧版本
  appendJsonl(PATHS.correctionsArchive, { action: "edit", old: { ...entry }, date: today() });

  if (summary) entry.summary = summary;
  if (detail) entry.detail = detail;
  if (type) entry.type = type as Correction["type"];
  if (target) entry.target = target;

  saveJson(PATHS.correctionsActive, corrections);
  console.log(`Edited correction ${id}`);
}

function correctionDelete(opts: Record<string, string>) {
  const { id } = opts;
  if (!id) {
    console.error("Required: --id");
    process.exit(1);
  }

  const corrections = loadJson<Correction[]>(PATHS.correctionsActive, []);
  const idx = corrections.findIndex((c) => c.id === id);
  if (idx === -1) {
    console.error(`Correction ${id} not found`);
    process.exit(1);
  }

  appendJsonl(PATHS.correctionsArchive, { action: "delete", old: { ...corrections[idx] }, date: today() });
  corrections.splice(idx, 1);
  saveJson(PATHS.correctionsActive, corrections);
  console.log(`Deleted correction ${id} (archived)`);
}

// ---------- State 操作 ----------

interface DreamState {
  lastRunAt: string | null;
  lastProcessedSessions: { new: string[]; updated: string[] };
  processedSessionTimestamps: Record<string, number>;
  totalRuns: number;
}

function stateShow() {
  const state = loadJson<DreamState>(PATHS.state, {
    lastRunAt: null,
    lastProcessedSessions: { new: [], updated: [] },
    processedSessionTimestamps: {},
    totalRuns: 0,
  });
  console.log(JSON.stringify(state, null, 2));
}

function stateComplete(opts: Record<string, string>) {
  const sessionsJson = opts.sessions;
  if (!sessionsJson) {
    console.error("Required: --sessions (JSON array of session IDs)");
    process.exit(1);
  }

  let sessionIds: string[];
  try {
    sessionIds = JSON.parse(sessionsJson);
  } catch {
    console.error("Invalid JSON for --sessions");
    process.exit(1);
  }

  const state = loadJson<DreamState>(PATHS.state, {
    lastRunAt: null,
    lastProcessedSessions: { new: [], updated: [] },
    processedSessionTimestamps: {},
    totalRuns: 0,
  });

  // 读取每个会话 JSONL 的最后消息 _createdAt 作为处理时间戳
  // 这与 gather-sessions.ts 的增量检测逻辑一致
  for (const id of sessionIds) {
    // 先尝试 agent-sessions，再尝试 conversations
    const agentJsonl = join(PATHS.agentSessionLogs, `${id}.jsonl`);
    const chatJsonl = join(PATHS.conversationLogs, `${id}.jsonl`);
    const jsonlPath = existsSync(agentJsonl) ? agentJsonl : chatJsonl;

    if (existsSync(jsonlPath)) {
      const content = readFileSync(jsonlPath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      // 从最后一行往前找 _createdAt
      let ts: number | null = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const msg = JSON.parse(lines[i]);
          if (msg._createdAt) { ts = msg._createdAt; break; }
        } catch { continue; }
      }
      if (ts) {
        state.processedSessionTimestamps[id] = ts;
      }
    }
  }

  state.lastRunAt = new Date().toISOString();
  state.lastProcessedSessions = {
    new: sessionIds,
    updated: [],
  };
  state.totalRuns++;

  saveJson(PATHS.state, state);
  console.log(`State updated: ${sessionIds.length} sessions marked as processed, run #${state.totalRuns}`);
}

// ---------- 主入口 ----------

function main() {
  const { command, opts } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "profile:show":
      return profileShow();

    case "sop:list":
      return sopList();
    case "sop:create":
      return sopCreate(opts);
    case "sop:update":
      return sopUpdate(opts);
    case "sop:delete":
      return sopDelete(opts);

    case "state:show":
      return stateShow();
    case "state:complete":
      return stateComplete(opts);

    case "correction:add":
      return correctionAdd(opts);
    case "correction:edit":
      return correctionEdit(opts);
    case "correction:delete":
      return correctionDelete(opts);

    default:
      console.error(`Unknown command: ${command}`);
      console.error("Available: profile:show, sop:list/create/update/delete, state:show/complete, correction:add/edit/delete");
      process.exit(1);
  }
}

main();
