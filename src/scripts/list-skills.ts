/**
 * list-skills.ts
 *
 * 列出当前所有工作区的 Skill（去重合并），输出 name + description。
 * 用途：供 SOP 提炼组件在判断某个工作流是否已有对应 Skill 时参考。
 *
 * 用法：
 *   npx tsx src/scripts/list-skills.ts
 *   npx tsx src/scripts/list-skills.ts --format json   # JSON 输出
 *   npx tsx src/scripts/list-skills.ts --workspace <slug>  # 只看单个工作区
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PROMA_DIR = join(homedir(), ".proma");
const WORKSPACES_DIR = join(PROMA_DIR, "agent-workspaces");

interface SkillEntry {
  name: string;
  description: string;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    // 去掉引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function collectSkills(options: { workspace?: string } = {}): SkillEntry[] {
  const seen = new Set<string>();
  const skills: SkillEntry[] = [];

  if (!existsSync(WORKSPACES_DIR)) {
    return skills;
  }

  const workspaceSlugs = options.workspace
    ? [options.workspace]
    : readdirSync(WORKSPACES_DIR);

  for (const wsSlug of workspaceSlugs) {
    const skillsDir = join(WORKSPACES_DIR, wsSlug, "skills");
    if (!existsSync(skillsDir)) continue;

    for (const skillName of readdirSync(skillsDir)) {
      const skillMd = join(skillsDir, skillName, "SKILL.md");
      if (!existsSync(skillMd)) continue;

      const content = readFileSync(skillMd, "utf-8");
      const fm = parseFrontmatter(content);

      const name = fm.name || skillName;
      const description = fm.description || "";

      // 按 name 去重
      if (seen.has(name)) continue;
      seen.add(name);

      skills.push({ name, description });
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function parseArgs(argv: string[]): { format: "text" | "json"; workspace?: string } {
  const out: { format: "text" | "json"; workspace?: string } = { format: "text" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--format" && argv[i + 1] === "json") {
      out.format = "json";
      i++;
    } else if (argv[i] === "--workspace" && argv[i + 1]) {
      out.workspace = argv[++i];
    }
  }
  return out;
}

const { format, workspace } = parseArgs(process.argv.slice(2));

const skills = collectSkills({ workspace });

if (format === "json") {
  console.log(JSON.stringify(skills, null, 2));
} else {
  if (skills.length === 0) {
    console.log("（未找到任何 Skill）");
  } else {
    for (const s of skills) {
      console.log(`- **${s.name}**：${s.description || "（无描述）"}`);
    }
  }
}
