#!/usr/bin/env npx tsx

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { execSync } from "child_process";
import { PATHS } from "../utils/paths.js";
import {
  getConfigPaths,
  loadMemoryInstanceConfig,
  loadPromaWorkspaces,
  resolveWorkspaceRef,
} from "../utils/instance-config.mjs";

interface WorkspaceMeta {
  id: string;
  name: string;
  slug: string;
}

function parseArgs(argv: string[]) {
  const opts: Record<string, string> = {};
  const flags = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      opts[arg.slice(2)] = argv[++i];
    } else {
      flags.add(arg.slice(2));
    }
  }

  return { opts, flags };
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function guessPromaRepoRoot(): string | null {
  const candidates = [
    process.env.PROMA_REPO_ROOT,
    join(PATHS.projectRoot, "..", "Proma"),
    join(PATHS.projectRoot, "..", "..", "Proma"),
    join(PATHS.projectRoot, "..", "..", "..", "Proma"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    const sdkPath = join(
      resolved,
      "node_modules",
      "@anthropic-ai",
      "claude-agent-sdk",
      "sdk.mjs"
    );
    if (existsSync(sdkPath)) return resolved;
  }

  return null;
}

function saveConfig(workspace: WorkspaceMeta, promaRepoRoot: string | null) {
  const { dir, local } = getConfigPaths();
  ensureDir(dir);
  const data = {
    promaRepoRoot,
    memoryWorkspace: {
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
    },
  };
  writeFileSync(local, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function syncBuiltSkills(targetDir: string) {
  const skillsRoot = join(PATHS.projectRoot, "skills");
  ensureDir(targetDir);

  for (const skillName of readdirSync(skillsRoot)) {
    if (skillName.startsWith(".")) continue;
    const from = join(skillsRoot, skillName, "SKILL.md");
    if (!existsSync(from)) continue;
    const to = join(targetDir, skillName, "SKILL.md");
    ensureDir(dirname(to));
    copyFileSync(from, to);
  }
}

function listWorkspaces(workspaces: WorkspaceMeta[]) {
  if (workspaces.length === 0) {
    console.log("No Proma workspaces found.");
    return;
  }
  for (const ws of workspaces) {
    console.log(`- ${ws.name} | slug=${ws.slug} | id=${ws.id}`);
  }
}

function main() {
  const { opts, flags } = parseArgs(process.argv.slice(2));
  const workspaces = loadPromaWorkspaces() as WorkspaceMeta[];

  if (flags.has("list-workspaces")) {
    listWorkspaces(workspaces);
    return;
  }

  if (flags.has("check-config")) {
    const { local } = getConfigPaths();
    if (existsSync(local)) {
      try {
        const config = loadMemoryInstanceConfig({ allowMissing: false });
        console.log(`✅ 已配置：${config.memoryWorkspace.name} (${config.memoryWorkspace.slug})`);
        console.log(`   Config: ${local}`);
      } catch {
        console.log("⚠️  配置文件存在但格式不完整，请删除后重新配置：");
        console.log(`   rm ${local}`);
      }
    } else {
      console.log("❌ 未配置，需要进行初始安装");
    }
    return;
  }

  const workspaceRef = opts.workspace;
  if (!workspaceRef) {
    console.error("Usage: install-memory-instance.ts --workspace <id|slug|name> [--proma-repo <path>] [--skip-sync]");
    console.error("Tip: run with --list-workspaces first.");
    process.exit(1);
  }

  const workspace = resolveWorkspaceRef(workspaceRef, workspaces) as WorkspaceMeta | null;
  if (!workspace) {
    console.error(`Workspace not found: ${workspaceRef}`);
    console.error("Available workspaces:");
    listWorkspaces(workspaces);
    process.exit(1);
  }

  const promaRepoRoot = opts["proma-repo"] ? resolve(opts["proma-repo"]) : guessPromaRepoRoot();

  if (!promaRepoRoot) {
    console.warn("⚠️  Proma repo root not found. memory-runner.mjs will not work until you re-run with --proma-repo <path>.");
    console.warn("   Example: npx tsx src/scripts/install-memory-instance.ts --workspace <name> --proma-repo /path/to/Proma");
  }

  saveConfig(workspace, promaRepoRoot);

  execSync("node build.mjs", {
    cwd: PATHS.projectRoot,
    stdio: "inherit",
  });

  if (!flags.has("skip-sync")) {
    const config = loadMemoryInstanceConfig();
    syncBuiltSkills(config.memorySkillsDir);
  }

  console.log(`Memory instance configured for workspace: ${workspace.name} (${workspace.slug})`);
  console.log(`Config: ${getConfigPaths().local}`);
  console.log(`Proma repo: ${promaRepoRoot || "(not set)"}`);
}

main();
