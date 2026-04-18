#!/usr/bin/env npx tsx
/**
 * memory-search.ts
 *
 * 记忆检索脚本。
 * 接收用户查询，通过 LLM 分析检索范围，精准读取记忆文件，生成回答。
 *
 * 用法：
 *   npx tsx src/scripts/memory-search.ts --query "我之前让你记住我喜欢用什么模型"
 *   npx tsx src/scripts/memory-search.ts --query "最近一周有什么工作相关的新发现"
 *
 * 输出：纯文本回答（直接输出到 stdout）
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { callLLM, callLLMJson } from "../utils/llm-client";
import { PATHS } from "../utils/paths.mjs";
import { todayStr, daysAgoStr } from "../utils/time";

// ---------- 类型定义 ----------

interface FileIndexEntry {
  path: string;
  type: "profile" | "corrections" | "sop" | "diary" | "memory_log" | "dream" | "other";
  date?: string; // YYYY-MM-DD，适用于日记/日志类
  size: number;
  title?: string;
}

interface SearchPlan {
  intent: string;
  targetFiles: string[]; // 文件名或文件类型标识
  timeRange?: {
    from?: string; // YYYY-MM-DD
    to?: string;   // YYYY-MM-DD
  };
  keywords: string[];
  reasoning: string;
}

// ---------- 工具函数 ----------

function parseArgs(): { query: string } {
  const args = process.argv.slice(2);
  let query = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--query" && i + 1 < args.length) {
      query = args[++i];
    }
  }
  if (!query.trim()) {
    console.error("Usage: npx tsx src/scripts/memory-search.ts --query <query>");
    process.exit(1);
  }
  return { query };
}

function today(): string {
  return todayStr();
}

function daysAgo(n: number): string {
  return daysAgoStr(n);
}

function extractDateFromFilename(filename: string): string | undefined {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : undefined;
}

function fileTypeFromPath(filePath: string): FileIndexEntry["type"] {
  const name = basename(filePath);
  if (name === "profile.md") return "profile";
  if (name === "active.json" && filePath.includes("corrections")) return "corrections";
  if (name === "index.json" && filePath.includes("sop-candidates")) return "sop";
  if (filePath.includes("diary/")) return "diary";
  if (filePath.includes("memory_log/")) return "memory_log";
  if (filePath.includes("dreams/")) return "dream";
  return "other";
}

// ---------- 文件索引 ----------

function buildFileIndex(): FileIndexEntry[] {
  const entries: FileIndexEntry[] = [];

  // 1. profile.md
  if (existsSync(PATHS.profile)) {
    const stat = statSync(PATHS.profile);
    entries.push({
      path: PATHS.profile,
      type: "profile",
      size: stat.size,
      title: "用户画像",
    });
  }

  // 2. corrections/active.json
  if (existsSync(PATHS.correctionsActive)) {
    const stat = statSync(PATHS.correctionsActive);
    entries.push({
      path: PATHS.correctionsActive,
      type: "corrections",
      size: stat.size,
      title: "行为纠偏记录",
    });
  }

  // 3. SOP candidates
  if (existsSync(PATHS.sopCandidates)) {
    const files = readdirSync(PATHS.sopCandidates);
    for (const f of files) {
      if (f === "index.json") {
        entries.push({
          path: PATHS.sopIndex,
          type: "sop",
          size: statSync(PATHS.sopIndex).size,
          title: "SOP 候选索引",
        });
      } else if (f.endsWith(".md")) {
        const p = join(PATHS.sopCandidates, f);
        entries.push({
          path: p,
          type: "sop",
          size: statSync(p).size,
          title: f.replace(/\.md$/, ""),
        });
      }
    }
  }

  // 4. diary/
  if (existsSync(PATHS.diary)) {
    const files = readdirSync(PATHS.diary).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const p = join(PATHS.diary, f);
      const date = extractDateFromFilename(f);
      entries.push({
        path: p,
        type: "diary",
        date,
        size: statSync(p).size,
        title: `日记 ${date || f}`,
      });
    }
  }

  // 5. memory_log/
  if (existsSync(PATHS.journal)) {
    const files = readdirSync(PATHS.journal).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const p = join(PATHS.journal, f);
      const date = extractDateFromFilename(f);
      entries.push({
        path: p,
        type: "memory_log",
        date,
        size: statSync(p).size,
        title: `记忆日志 ${date || f}`,
      });
    }
  }

  // 6. dreams/
  if (existsSync(PATHS.dreams)) {
    const files = readdirSync(PATHS.dreams).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const p = join(PATHS.dreams, f);
      const date = extractDateFromFilename(f);
      entries.push({
        path: p,
        type: "dream",
        date,
        size: statSync(p).size,
        title: `梦境 ${date || f}`,
      });
    }
  }

  // 按时间倒序排列（有日期的在前）
  return entries.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });
}

function summarizeIndex(entries: FileIndexEntry[]): string {
  return entries
    .map((e) => {
      const dateStr = e.date ? ` [${e.date}]` : "";
      const sizeStr = e.size < 1024 ? `${e.size}B` : `${(e.size / 1024).toFixed(1)}KB`;
      return `- ${e.type}: ${e.title}${dateStr} (${sizeStr})`;
    })
    .join("\n");
}

// ---------- 读取文件内容 ----------

function readFileContent(path: string, maxChars: number = 8000): string {
  if (!existsSync(path)) return "(文件不存在)";
  try {
    const content = readFileSync(path, "utf-8");
    if (content.length > maxChars) {
      return content.slice(0, maxChars) + `\n\n... [截断，共 ${content.length} 字符]`;
    }
    return content;
  } catch (err) {
    return `(读取失败: ${err})`;
  }
}

// ---------- 检索执行 ----------

async function main() {
  const { query } = parseArgs();

  console.error(`[memory-search] 查询: ${query}`);

  // 1. 构建文件索引
  const index = buildFileIndex();
  if (index.length === 0) {
    console.log("记忆库为空，没有可检索的内容。请先运行 memory-init 或 memory-daily 建立记忆。");
    return;
  }

  console.error(`[memory-search] 发现 ${index.length} 个记忆文件`);

  // 2. LLM 分析查询 → 生成检索计划
  const indexSummary = summarizeIndex(index);
  const todayStr = today();
  const weekAgo = daysAgo(7);

  const planPrompt = `你是记忆检索规划助手。请分析用户的检索需求，决定应该从哪些记忆文件中查找信息。

当前日期: ${todayStr}
可用记忆文件如下：
${indexSummary}

用户查询: "${query}"

请输出 JSON 格式的检索计划，包含以下字段：
- intent: 检索意图简述
- targetFiles: 应该读取的文件路径数组（从上面的列表中选择最相关的，不超过5个）
- timeRange: 可选，时间范围筛选 {from: "YYYY-MM-DD", to: "YYYY-MM-DD"}
- keywords: 用于快速文本匹配的关健词数组（3-8个）
- reasoning: 为什么选择这些文件的简要理由

注意：
- profile.md 包含用户画像，关于用户偏好、习惯、角色等优先查这个
- corrections/active.json 包含用户纠正和偏好记录
- sop-candidates/ 包含工作流程模板
- diary/ 是按日期的散文日记
- memory_log/ 是按日期的结构化变更记录
- 如果查询涉及"最近"，默认查最近7天（${weekAgo} 到 ${todayStr}）
- 不要选择不相关的文件，宁缺毋滥`;

  const plan = await callLLMJson<SearchPlan>(planPrompt, {
    system: "你是一个精准的记忆检索规划助手。只输出 JSON，不输出任何其他内容。",
    temperature: 0.2,
  });

  console.error(`[memory-search] 检索计划: ${plan.intent}`);
  console.error(`[memory-search] 目标文件: ${plan.targetFiles.join(", ")}`);

  // 3. 根据计划读取文件内容
  let contextParts: string[] = [];

  for (const targetPath of plan.targetFiles) {
    // 尝试精确匹配路径
    let matched = index.find((e) => e.path === targetPath);

    // 如果没匹配到，尝试匹配文件名
    if (!matched) {
      matched = index.find((e) => basename(e.path) === targetPath || e.title === targetPath);
    }

    // 如果还是没匹配到，尝试按类型匹配
    if (!matched) {
      const typeMatch = index.filter((e) => e.type === targetPath);
      if (typeMatch.length > 0) {
        // 时间过滤
        const filtered = typeMatch.filter((e) => {
          if (!plan.timeRange || !e.date) return true;
          if (plan.timeRange.from && e.date < plan.timeRange.from) return false;
          if (plan.timeRange.to && e.date > plan.timeRange.to) return false;
          return true;
        });
        // 取最新的几个
        const selected = filtered.slice(0, 3);
        for (const s of selected) {
          const content = readFileContent(s.path);
          contextParts.push(`--- ${s.title} (${s.path}) ---\n${content}`);
        }
        continue;
      }
    }

    if (matched) {
      const content = readFileContent(matched.path);
      contextParts.push(`--- ${matched.title} (${matched.path}) ---\n${content}`);
    }
  }

  if (contextParts.length === 0) {
    console.log("没有找到相关的记忆内容。");
    return;
  }

  console.error(`[memory-search] 读取了 ${contextParts.length} 个文件的内容`);

  // 4. LLM 基于上下文生成回答
  const context = contextParts.join("\n\n");
  const answerPrompt = `基于以下记忆内容，回答用户的问题。请直接给出答案，不要提及检索过程。

用户问题: "${query}"

相关记忆内容:
${context}

回答要求:
- 直接回答用户的问题
- 如果记忆中没有相关信息，明确说明"没有找到相关记忆"
- 不要编造记忆中没有的信息
- 保持简洁，只输出最终答案`;

  const answer = await callLLM(answerPrompt, {
    system: "你是用户的长期记忆助手。基于提供的记忆内容回答用户问题。",
    temperature: 0.3,
  });

  console.log(answer);
}

main().catch((err) => {
  console.error("[memory-search] Error:", err);
  process.exit(1);
});
