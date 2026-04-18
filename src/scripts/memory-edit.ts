#!/usr/bin/env npx tsx
/**
 * memory-edit.ts
 *
 * 记忆操作脚本。
 * 接收用户操作需求，通过 LLM 分析并输出结构化操作计划数组，映射到具体指令执行。
 * 支持多操作批量执行和操作层重试（失败→收集错误→二次调用模型修正→重试）。
 *
 * 用法：
 *   npx tsx src/scripts/memory-edit.ts --instruction "把我对 DeepSeek 的偏好加到画像里"
 *   npx tsx src/scripts/memory-edit.ts --instruction "删除 SOP 候选 sop_001"
 *   npx tsx src/scripts/memory-edit.ts --list
 *
 * 输出：纯文本操作结果（直接输出到 stdout）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { execFileSync } from "child_process";
import { callLLM, callLLMJson } from "../utils/llm-client";
import { PATHS } from "../utils/paths.mjs";

// ---------- 类型定义 ----------

interface MemorySnapshot {
  profile: string;
  correctionsCount: number;
  sopCount: number;
  recentDiaries: string[];
  recentLogs: string[];
}

interface EditOperation {
  operation: string;
  target: string;
  action: "add" | "edit" | "delete";
  content?: string;
  summary?: string;   // correction 专用：简短摘要
  detail?: string;    // correction 专用：详细说明
  section?: string;
  type?: "agent-behavior" | "skill-update" | "user-preference"; // correction 专用
  reasoning: string;
}

interface EditPlan {
  operations: EditOperation[];
}

interface OperationResult {
  op: EditOperation;
  success: boolean;
  result: string;
  error?: string;
}

// ---------- 工具函数 ----------

function parseArgs(): { mode: "edit" | "list"; instruction: string } {
  const args = process.argv.slice(2);
  let instruction = "";
  let listMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--instruction" && i + 1 < args.length) {
      instruction = args[++i];
    }
    if (args[i] === "--list") {
      listMode = true;
    }
  }

  if (listMode) {
    return { mode: "list", instruction: "" };
  }

  if (!instruction.trim()) {
    console.error("Usage: npx tsx src/scripts/memory-edit.ts --instruction <instruction>");
    console.error("       npx tsx src/scripts/memory-edit.ts --list");
    process.exit(1);
  }
  return { mode: "edit", instruction };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// ---------- Profile 规范读取（缓存） ----------

let _profileGuidelines: string | null = null;

function loadProfileGuidelines(): string {
  if (_profileGuidelines !== null) return _profileGuidelines;

  const guidelinesPath = join(PATHS.projectRoot, "components/profile-rules.md");
  if (existsSync(guidelinesPath)) {
    try {
      const raw = readFileSync(guidelinesPath, "utf-8");
      // 去掉模板变量前缀，清理行号前缀
      _profileGuidelines = raw
        .replace(/\{\{[A-Z_]+\}\}/g, "")
        .replace(/^\d+:\s+/gm, "")
        .trim();
      return _profileGuidelines;
    } catch {
      // fallback
    }
  }

  return `【画像规范文件缺失：${guidelinesPath}】\n请确保该文件存在，或参考项目 docs/ 目录下的规范模板。`;
}

// ---------- 构建记忆快照 ----------

function buildMemorySnapshot(): MemorySnapshot {
  const snapshot: MemorySnapshot = {
    profile: "",
    correctionsCount: 0,
    sopCount: 0,
    recentDiaries: [],
    recentLogs: [],
  };

  if (existsSync(PATHS.profile)) {
    const content = readFileSync(PATHS.profile, "utf-8");
    snapshot.profile = content.length > 3000 ? content.slice(0, 3000) + "\n... [截断]" : content;
  }

  const corrections = loadJson<unknown[]>(PATHS.correctionsActive, []);
  snapshot.correctionsCount = corrections.length;

  const sopIndex = loadJson<{ id: string; title: string; status: string; file: string }[]>(PATHS.sopIndex, []);
  snapshot.sopCount = sopIndex.length;

  if (existsSync(PATHS.diary)) {
    const files = readdirSync(PATHS.diary)
      .filter((f: string) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, 3);
    for (const f of files) {
      const content = readFileSync(join(PATHS.diary, f), "utf-8");
      snapshot.recentDiaries.push(`[${f}]\n${content.slice(0, 500)}...`);
    }
  }

  if (existsSync(PATHS.journal)) {
    const files = readdirSync(PATHS.journal)
      .filter((f: string) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, 3);
    for (const f of files) {
      const content = readFileSync(join(PATHS.journal, f), "utf-8");
      snapshot.recentLogs.push(`[${f}]\n${content.slice(0, 500)}...`);
    }
  }

  return snapshot;
}

function snapshotToText(snapshot: MemorySnapshot): string {
  const parts: string[] = [];
  parts.push("=== 用户画像 (profile.md) ===");
  parts.push(snapshot.profile || "(空)");
  parts.push("\n=== 行为纠偏记录 ===");
  parts.push(`共 ${snapshot.correctionsCount} 条活跃记录`);
  parts.push("\n=== SOP 候选 ===");
  parts.push(`共 ${snapshot.sopCount} 个候选`);
  if (snapshot.recentDiaries.length > 0) {
    parts.push("\n=== 最近日记 ===");
    parts.push(snapshot.recentDiaries.join("\n\n"));
  }
  if (snapshot.recentLogs.length > 0) {
    parts.push("\n=== 最近记忆日志 ===");
    parts.push(snapshot.recentLogs.join("\n\n"));
  }
  return parts.join("\n");
}

// ---------- 列出记忆目录结构 ----------

function listMemoryStructure(): string {

  function buildTree(dir: string, prefix: string = ""): string[] {
    const lines: string[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return lines;
    }
    entries = entries.filter((e: string) => e !== ".DS_Store");

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const path = join(dir, entry);
      const isLast = i === entries.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      try {
        const stat = statSync(path);
        if (stat.isDirectory()) {
          lines.push(`${prefix}${connector}${entry}/`);
          lines.push(...buildTree(path, prefix + childPrefix));
        } else {
          const size = stat.size < 1024 ? `${stat.size}B` : `${(stat.size / 1024).toFixed(1)}KB`;
          lines.push(`${prefix}${connector}${entry} (${size})`);
        }
      } catch {
        lines.push(`${prefix}${connector}${entry} (?)`);
      }
    }
    return lines;
  }

  const lines: string[] = [];
  lines.push(`记忆根目录: ${PATHS.memory}`);
  lines.push("");
  lines.push(".memory/");
  lines.push(...buildTree(PATHS.memory, ""));
  return lines.join("\n");
}

// ---------- 文件锁 ----------

const LOCK_FILE = join(PATHS.memory, ".edit.lock");
const LOCK_TIMEOUT_MS = 30000; // 30秒超时

function acquireLock(): boolean {
  if (existsSync(LOCK_FILE)) {
    try {
      const lockContent = readFileSync(LOCK_FILE, "utf-8").trim();
      const lockTime = parseInt(lockContent, 10);
      if (!isNaN(lockTime) && Date.now() - lockTime < LOCK_TIMEOUT_MS) {
        return false; // 锁被占用且未超时
      }
      // 锁已超时，强制释放
      console.error("[memory-edit] 检测到超时锁，强制释放...");
    } catch {
      // 锁文件损坏，强制释放
    }
  }
  writeFileSync(LOCK_FILE, String(Date.now()), "utf-8");
  return true;
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE)) {
      unlinkSync(LOCK_FILE);
    }
  } catch {
    // 忽略释放失败
  }
}

// ---------- 操作执行 ----------

function runMemoryOps(command: string, args: string[]): { success: boolean; result: string } {
  try {
    const scriptPath = join(PATHS.projectRoot, "src/scripts/memory-ops.ts");
    const result = execFileSync("npx", ["tsx", scriptPath, command, ...args], {
      encoding: "utf-8",
      cwd: PATHS.projectRoot,
      timeout: 30000,
    });
    return { success: true, result: result.trim() };
  } catch (err: any) {
    const errorMsg = `操作失败: ${err.message}${err.stderr ? "\n" + err.stderr : ""}`;
    return { success: false, result: errorMsg };
  }
}

function executeSingleOperation(op: EditOperation): OperationResult {
  const operation = op.operation.toLowerCase();

  // Profile 操作 —— 返回指导信息，不直接写入
  if (operation.startsWith("profile:")) {
    const profilePath = PATHS.profile;
    const guidelines = loadProfileGuidelines();

    return {
      op,
      success: true, // 返回指导不算失败，但也不是真正修改了文件
      result: `⚠️ 画像（profile.md）不支持通过脚本直接修改。

文件路径：${profilePath}

${guidelines}

${op.section ? `目标段落："${op.section}"` : "请在文件中找到合适的位置进行编辑"}
${op.content ? `\n建议内容：\n${op.content}` : ""}

注意：画像只能编辑，不允许重新创建或删除。`,
    };
  }

  // Correction 操作
  if (operation.startsWith("correction:")) {
    if (op.action === "add") {
      const corrType = op.type || "user-preference";
      const summary = op.summary || op.content || "";
      const detail = op.detail || op.content || "";
      const { success, result } = runMemoryOps("correction:add", [
        "--type", corrType,
        "--target", op.target || "general",
        "--summary", summary,
        "--detail", detail,
        "--source", "memory-edit",
      ]);
      return { op, success, result };
    }
    if (op.action === "edit") {
      if (!op.target) {
        return { op, success: false, result: "编辑失败: 未指定 correction ID", error: "MISSING_TARGET" };
      }
      const args = ["--id", op.target];
      if (op.summary) args.push("--summary", op.summary);
      if (op.detail) args.push("--detail", op.detail);
      if (!op.summary && !op.detail && op.content) {
        args.push("--summary", op.content, "--detail", op.content);
      }
      const { success, result } = runMemoryOps("correction:edit", args);
      return { op, success, result };
    }
    if (op.action === "delete") {
      if (!op.target) {
        return { op, success: false, result: "删除失败: 未指定 correction ID", error: "MISSING_TARGET" };
      }
      const { success, result } = runMemoryOps("correction:delete", [
        "--id", op.target,
      ]);
      return { op, success, result };
    }
    return { op, success: false, result: `未知的 correction 操作: ${op.action}`, error: "UNKNOWN_ACTION" };
  }

  // SOP 操作 —— 只支持删除，直接操作文件
  if (operation.startsWith("sop:")) {
    if (op.action === "delete") {
      if (!op.target) {
        return { op, success: false, result: "删除失败: 未指定 SOP ID", error: "MISSING_TARGET" };
      }

      const index = loadJson<Array<{ id: string; file: string }>>(PATHS.sopIndex, []);
      const idx = index.findIndex((s) => s.id === op.target);
      if (idx === -1) {
        return { op, success: false, result: `SOP ${op.target} 不存在`, error: "NOT_FOUND" };
      }

      const entry = index[idx];
      const mdPath = join(PATHS.sopCandidates, entry.file);

      // 从索引中移除
      index.splice(idx, 1);
      writeFileSync(PATHS.sopIndex, JSON.stringify(index, null, 2) + "\n", "utf-8");

      // 删除 MD 文件（如存在）
      if (existsSync(mdPath)) {
        try {
          unlinkSync(mdPath);
        } catch (e: any) {
          return { op, success: false, result: `索引已更新，但删除 MD 文件失败: ${e.message}`, error: "FILE_DELETE_FAILED" };
        }
      }

      return { op, success: true, result: `已删除 SOP ${op.target}: ${entry.file}（索引 + 文档）` };
    }

    return { op, success: false, result: `SOP 只支持 delete 操作，不支持 ${op.action}`, error: "UNSUPPORTED_ACTION" };
  }

  // Fallback
  return {
    op,
    success: false,
    result: `❌ 无法执行操作: ${op.operation} / ${op.action}\n原因：该操作类型不被支持。`,
    error: "UNSUPPORTED_OPERATION",
  };
}

async function executeOperations(operations: EditOperation[]): Promise<OperationResult[]> {
  // 获取文件锁
  if (!acquireLock()) {
    return operations.map((op) => ({
      op,
      success: false,
      result: "操作失败: 另一个 memory-edit 进程正在执行，请稍后再试。",
      error: "LOCKED",
    }));
  }

  const results: OperationResult[] = [];

  try {
    for (const op of operations) {
      console.error(`[memory-edit] 执行操作: ${op.operation} / ${op.action} (target: ${op.target || "(未指定)"})`);
      const result = executeSingleOperation(op);
      results.push(result);
      console.error(`[memory-edit] 操作结果: ${result.success ? "成功" : "失败"}`);
    }
  } finally {
    // 无论成功失败都释放锁
    releaseLock();
  }

  return results;
}

// ---------- 操作层重试 ----------

async function retryWithCorrection(
  failedResults: OperationResult[],
  originalInstruction: string,
  snapshotText: string,
  previousPlan: EditPlan
): Promise<EditPlan | null> {
  const errorContext = failedResults
    .filter((r) => !r.success)
    .map((r) => {
      const errorCode = r.error || "UNKNOWN";
      return `- 操作: ${r.op.operation} / ${r.op.action}\n  目标: ${r.op.target}\n  错误码: ${errorCode}\n  错误信息: ${r.result}`;
    })
    .join("\n");

  const retryPrompt = `你是 Proma Memory 记忆系统。之前的一批操作中有部分失败，请分析错误原因并输出修正后的操作计划。

原始需求: "${originalInstruction}"

之前的操作计划（部分失败）：
${JSON.stringify(previousPlan, null, 2)}

失败详情：
${errorContext}

请输出修正后的 JSON 操作计划。要求：
- 只修正失败的操作
- 如果某个操作确实无法修正（如目标 ID 不存在），将其移除
- 保持其他成功操作不变（不需要重新执行）
- 输出格式: { "operations": [...] }
- 每个 operation 字段同之前：operation, target, action, content, summary, detail, section, type, reasoning`;

  try {
    const corrected = await callLLMJson<EditPlan>(retryPrompt, {
      system: "你是 Proma Memory 记忆系统。只输出 JSON，不输出其他内容。",
      temperature: 0.2,
      retries: 2,
    });
    return corrected;
  } catch (err: any) {
    console.error(`[memory-edit] 纠错调用失败: ${err.message}`);
    return null;
  }
}

// ---------- 结果格式化 ----------

function formatResults(results: OperationResult[], includeProfileGuidelines: boolean): string {
  const lines: string[] = [];
  const profileOps = results.filter((r) => r.op.operation.toLowerCase().startsWith("profile:"));
  const otherOps = results.filter((r) => !r.op.operation.toLowerCase().startsWith("profile:"));

  // Profile 操作结果（规范只返回一次）
  if (profileOps.length > 0) {
    lines.push("\n📋 Profile 编辑指导");
    lines.push("=".repeat(40));
    for (const r of profileOps) {
      lines.push(`\n[${r.op.operation}] ${r.op.action}`);
      lines.push(`目标: ${r.op.target || "profile.md"}`);
      if (r.op.section) lines.push(`段落: ${r.op.section}`);
      if (r.op.reasoning) lines.push(`理由: ${r.op.reasoning}`);
    }
    // 规范只附加一次
    if (includeProfileGuidelines) {
      lines.push("\n" + "-".repeat(40));
      lines.push(loadProfileGuidelines());
      lines.push("-".repeat(40));
      lines.push("\n⚠️ 请使用 Edit 工具手动编辑 profile.md。画像只能编辑，不允许重新创建或删除。");
    }
  }

  // 其他操作结果
  if (otherOps.length > 0) {
    lines.push("\n🔧 执行结果");
    lines.push("=".repeat(40));
    for (const r of otherOps) {
      const status = r.success ? "✅" : "❌";
      lines.push(`\n${status} [${r.op.operation}] ${r.op.action}`);
      lines.push(`目标: ${r.op.target || "(未指定)"}`);
      if (r.op.reasoning) lines.push(`理由: ${r.op.reasoning}`);
      lines.push(`结果: ${r.result}`);
      if (r.error) lines.push(`错误码: ${r.error}`);
    }
  }

  return lines.join("\n");
}

// ---------- 目标解析上下文 ----------

function buildTargetContext(): string {
  const parts: string[] = [];

  // Corrections 列表
  const corrections = loadJson<Array<{ id: string; summary: string; detail: string; type: string }>>(PATHS.correctionsActive, []);
  if (corrections.length > 0) {
    parts.push("=== 当前行为纠偏记录（corrections/active.json）===");
    for (const c of corrections) {
      parts.push(`- ${c.id}: [${c.type}] ${c.summary}`);
    }
  } else {
    parts.push("=== 当前行为纠偏记录：无 ===");
  }

  // SOP 列表
  const sops = loadJson<Array<{ id: string; title: string; status: string; file: string }>>(PATHS.sopIndex, []);
  if (sops.length > 0) {
    parts.push("\n=== 当前 SOP 候选（sop-candidates/index.json）===");
    for (const s of sops) {
      parts.push(`- ${s.id}: ${s.title} (${s.status})`);
    }
  } else {
    parts.push("\n=== 当前 SOP 候选：无 ===");
  }

  return parts.join("\n");
}

// ---------- LLM 规划 ----------

async function generatePlan(instruction: string, snapshotText: string): Promise<EditPlan> {
  const targetContext = buildTargetContext();

  const planPrompt = `你是 Proma Memory 记忆系统。请分析用户的操作需求，输出一个或多个结构化记忆操作计划。

当前日期: ${today()}

当前记忆状态：
${snapshotText}

可操作的完整目标列表：
${targetContext}

用户提供的操作需求: "${instruction}"

请输出 JSON 格式的操作计划数组：
{
  "operations": [
    {
      "operation": "操作类型",
      "target": "操作目标（优先使用上述列表中的准确ID，用户描述模糊时根据summary/title匹配）",
      "action": "add|edit|delete",
      "content": "具体内容（通用字段，所有操作类型都需填写）",
      "summary": "简短摘要（correction:add/edit 专用。根据用户需求填充该字段。）",
      "detail": "详细说明（correction:add/edit 专用。与 summary 配合使用，提供比摘要更详细的背景或示例）",
      "section": "段落（profile用）",
      "type": "agent-behavior|skill-update|user-preference（correction:add/edit 时必填）",
      "reasoning": "理由"
    }
  ]
}

可用操作及对应的 action 值（严格按此映射）：
- profile:add → action 必须为 "add"
- profile:edit → action 必须为 "edit"
- correction:add → action 必须为 "add"，type 必填
- correction:edit → action 必须为 "edit"
- correction:delete → action 必须为 "delete"
- sop:delete → action 必须为 "delete"

correction 类型判断规则：
- "agent-behavior" → 用户对 Agent 行为方式的纠正（如"不要催复"、"不要反问"）
- "skill-update" → 用户对 Skill 内容或逻辑的纠正（如"这个 Skill 的步骤缺了一步"）
- "user-preference" → 用户的个人偏好（如"我喜欢用英文注释"、"结果要输出 markdown"）

注意：
- 可以输出多个 operation，批量执行
- 用户描述模糊时（如"删除讲不要催复的那条"），根据上述完整列表的 summary/title 匹配到准确 ID
- 只输出 JSON，不要其他内容
- content/summary/detail 必须包含完整可直接写入的内容
- 不用关注 profile ，该文件会由脚本会自动返回指导意见
- action 必须严格使用上面列出的值，不要用其他值
`;

  return callLLMJson<EditPlan>(planPrompt, {
    system: "你是一个精准的记忆操作规划助手。只输出 JSON，不输出任何其他内容。",
    temperature: 0.2,
  });
}

// ---------- 主流程 ----------

async function main() {
  const { mode, instruction } = parseArgs();

  if (mode === "list") {
    console.log(listMemoryStructure());
    return;
  }

  console.error(`[memory-edit] 操作需求: ${instruction}`);

  const snapshot = buildMemorySnapshot();
  const snapshotText = snapshotToText(snapshot);
  console.error("[memory-edit] 已加载记忆快照");

  // 第一轮：生成计划并执行
  let plan = await generatePlan(instruction, snapshotText);
  console.error(`[memory-edit] 生成 ${plan.operations.length} 个操作`);

  let results = await executeOperations(plan.operations);

  // 操作层重试：如果有失败，尝试纠错重试（最多1轮）
  const failedResults = results.filter((r) => !r.success);
  if (failedResults.length > 0) {
    const failDetails = failedResults.map((r) => {
      const code = r.error || "UNKNOWN";
      return `${r.op.operation}/${r.op.action}(target=${r.op.target}): [${code}] ${r.result.slice(0, 100)}`;
    }).join("; ");
    console.error(`[memory-edit] ${failedResults.length} 个操作失败，尝试纠错重试... 失败详情: ${failDetails}`);
    const correctedPlan = await retryWithCorrection(failedResults, instruction, snapshotText, plan);

    if (correctedPlan && correctedPlan.operations.length > 0) {
      console.error(`[memory-edit] 纠错后生成 ${correctedPlan.operations.length} 个操作`);
      const retryResults = await executeOperations(correctedPlan.operations);

      // 合并结果：用重试结果替换原始失败项（无论重试成功还是失败）
      for (const retryResult of retryResults) {
        const originalIndex = results.findIndex(
          (r) => !r.success && r.op.operation === retryResult.op.operation && r.op.target === retryResult.op.target
        );
        if (originalIndex >= 0) {
          results[originalIndex] = retryResult;
        } else {
          results.push(retryResult);
        }
      }
    } else {
      console.error("[memory-edit] 纠错重试未能生成有效计划");
    }
  }

  // 输出最终结果
  const hasProfileOps = results.some((r) => r.op.operation.toLowerCase().startsWith("profile:"));
  console.log(formatResults(results, hasProfileOps));
}

main().catch((err) => {
  console.error("[memory-edit] Error:", err);
  process.exit(1);
});
