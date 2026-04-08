#!/usr/bin/env npx tsx
/**
 * memory-ops.ts
 *
 * Dream 记忆存储 CRUD 操作脚本。
 * 保证数据格式一致性，自动处理归档逻辑。
 *
 * 用法：
 *   npx tsx src/scripts/memory-ops.ts <command> [options]
 *
 * 命令：
 *   profile:show                          显示当前画像（Markdown）
 *
 *   pref:list                             列出所有偏好
 *   pref:add --category <c> --subcategory <sc> --summary <s> --detail <d> --source <sessionId>
 *   pref:edit --id <id> --summary <s> --detail <d> --reason <r> --source <sessionId> [--category <c>] [--subcategory <sc>]
 *   pref:delete --id <id> --reason <r>
 *   pref:touch --id <id> --source <sessionId>
 *
 *   sop:list                              列出所有 SOP 候选
 *   sop:create --title <t> --content <c> [--source <sessionId>]
 *   sop:update --id <id> [--title <t>] [--status <s>] [--content <c>] [--source <sessionId>]
 *
 *   state:show                            显示运行状态
 *   state:complete --sessions <json-array>  标记会话处理完成
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { PATHS } from "../utils/paths.js";

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
  return new Date().toISOString().slice(0, 10);
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

// ---------- Preferences 操作 ----------

interface Preference {
  id: string;
  category: string;
  subcategory: string;
  summary: string;
  detail: string;
  firstSeen: string;
  firstSource: string;
  lastSeen: string;
  lastSource: string;
  seenCount: number;
}

function prefList() {
  const prefs = loadJson<Preference[]>(PATHS.preferencesActive, []);
  if (prefs.length === 0) {
    console.log("No active preferences");
    return;
  }
  for (const p of prefs) {
    console.log(`[${p.id}] (${p.category}) ${p.summary} | seen: ${p.seenCount}x, last: ${p.lastSeen}`);
  }
}

function prefAdd(opts: Record<string, string>) {
  const { category, subcategory, summary, detail, source } = opts;
  if (!category || !summary) {
    console.error("Required: --category, --summary");
    process.exit(1);
  }

  const prefs = loadJson<Preference[]>(PATHS.preferencesActive, []);
  const id = genId("pref", prefs);
  const d = today();

  const pref: Preference = {
    id,
    category,
    subcategory: subcategory || "",
    summary,
    detail: detail || "",
    firstSeen: d,
    firstSource: source || "",
    lastSeen: d,
    lastSource: source || "",
    seenCount: 1,
  };

  prefs.push(pref);
  saveJson(PATHS.preferencesActive, prefs);
  console.log(`Added preference ${id}: ${summary}`);
}

function prefEdit(opts: Record<string, string>) {
  const { id, summary, detail, reason, source, category, subcategory } = opts;
  if (!id) {
    console.error("Required: --id");
    process.exit(1);
  }

  const prefs = loadJson<Preference[]>(PATHS.preferencesActive, []);
  const idx = prefs.findIndex((p) => p.id === id);
  if (idx === -1) {
    console.error(`Preference ${id} not found`);
    process.exit(1);
  }

  // 归档旧版本
  const oldSnapshot = { ...prefs[idx] };
  appendJsonl(PATHS.preferencesArchive, {
    action: "edit",
    prefId: id,
    oldSnapshot,
    reason: reason || "",
    date: today(),
    source: source || "",
  });

  // 更新
  if (summary) prefs[idx].summary = summary;
  if (detail) prefs[idx].detail = detail;
  if (category) prefs[idx].category = category;
  if (subcategory) prefs[idx].subcategory = subcategory;
  prefs[idx].lastSeen = today();
  if (source) prefs[idx].lastSource = source;
  prefs[idx].seenCount++;

  saveJson(PATHS.preferencesActive, prefs);
  console.log(`Edited preference ${id} (old version archived)`);
}

function prefDelete(opts: Record<string, string>) {
  const { id, reason } = opts;
  if (!id) {
    console.error("Required: --id");
    process.exit(1);
  }

  const prefs = loadJson<Preference[]>(PATHS.preferencesActive, []);
  const idx = prefs.findIndex((p) => p.id === id);
  if (idx === -1) {
    console.error(`Preference ${id} not found`);
    process.exit(1);
  }

  // 归档
  const oldSnapshot = { ...prefs[idx] };
  appendJsonl(PATHS.preferencesArchive, {
    action: "delete",
    prefId: id,
    oldSnapshot,
    reason: reason || "",
    date: today(),
  });

  // 删除
  prefs.splice(idx, 1);
  saveJson(PATHS.preferencesActive, prefs);
  console.log(`Deleted preference ${id} (archived)`);
}

function prefTouch(opts: Record<string, string>) {
  const { id, source } = opts;
  if (!id) {
    console.error("Required: --id");
    process.exit(1);
  }

  const prefs = loadJson<Preference[]>(PATHS.preferencesActive, []);
  const pref = prefs.find((p) => p.id === id);
  if (!pref) {
    console.error(`Preference ${id} not found`);
    process.exit(1);
  }

  pref.lastSeen = today();
  if (source) pref.lastSource = source;
  pref.seenCount++;

  saveJson(PATHS.preferencesActive, prefs);
  console.log(`Touched preference ${id}: seenCount=${pref.seenCount}`);
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
  const { title, content, source } = opts;
  if (!title) {
    console.error("Required: --title");
    process.exit(1);
  }

  const index = loadJson<SopEntry[]>(PATHS.sopIndex, []);
  const id = genId("sop", index);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
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

  // 写入 SOP 文件
  const filePath = join(PATHS.sopCandidates, fileName);
  const md = content || `# ${title}\n\n> 创建于 ${d}\n\n## 观察到的模式\n\n(待填充)\n\n## 典型步骤\n\n(待填充)\n\n## 来源会话\n\n(待填充)\n\n## 固化建议\n\n(待填充)\n`;
  writeFileSync(filePath, md, "utf-8");

  console.log(`Created SOP candidate ${id}: ${title} → ${fileName}`);
}

function sopUpdate(opts: Record<string, string>) {
  const { id, title, status, content, source } = opts;
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

  // 更新文件内容（如果提供）
  if (content) {
    const filePath = join(PATHS.sopCandidates, entry.file);
    writeFileSync(filePath, content, "utf-8");
  }

  console.log(`Updated SOP ${id}`);
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

    case "pref:list":
      return prefList();
    case "pref:add":
      return prefAdd(opts);
    case "pref:edit":
      return prefEdit(opts);
    case "pref:delete":
      return prefDelete(opts);
    case "pref:touch":
      return prefTouch(opts);

    case "sop:list":
      return sopList();
    case "sop:create":
      return sopCreate(opts);
    case "sop:update":
      return sopUpdate(opts);

    case "state:show":
      return stateShow();
    case "state:complete":
      return stateComplete(opts);

    default:
      console.error(`Unknown command: ${command}`);
      console.error("Available: profile:show, pref:list/add/edit/delete/touch, sop:list/create/update, state:show/complete");
      process.exit(1);
  }
}

main();
