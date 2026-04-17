#!/usr/bin/env npx tsx
/**
 * memory-bootstrap.ts
 *
 * 初始化 / 重建 ~/.proma/memory 目录。
 * - 默认只补齐缺失的目录、文件和模板副本
 * - 传入 --wipe 时先清空整个 memory 目录，再从零重建
 *
 * 用法：
 *   npx tsx src/scripts/memory-bootstrap.ts
 *   npx tsx src/scripts/memory-bootstrap.ts --wipe
 */

import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PATHS } from "../utils/paths.js";

interface DreamState {
  lastRunAt: string | null;
  lastProcessedSessions: { new: string[]; updated: string[] };
  processedSessionTimestamps: Record<string, number>;
  totalRuns: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const PROFILE_TEMPLATE_SOURCE = resolve(REPO_ROOT, "docs/profile-template.md");
const MEMORY_README_SOURCE = resolve(REPO_ROOT, "docs/memory-readme.md");

const DEFAULT_STATE: DreamState = {
  lastRunAt: null,
  lastProcessedSessions: { new: [], updated: [] },
  processedSessionTimestamps: {},
  totalRuns: 0,
};

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function ensureJsonFile(path: string, value: unknown) {
  if (existsSync(path)) return;
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function ensureTextFile(path: string, value: string) {
  if (existsSync(path)) return;
  ensureDir(dirname(path));
  writeFileSync(path, value, "utf-8");
}

function ensureCopiedFile(from: string, to: string) {
  if (!existsSync(from)) {
    console.error(`Required source file not found: ${from}`);
    process.exit(1);
  }
  if (existsSync(to)) return;
  ensureDir(dirname(to));
  copyFileSync(from, to);
}

function overwriteCopiedFile(from: string, to: string) {
  if (!existsSync(from)) {
    console.error(`Required source file not found: ${from}`);
    process.exit(1);
  }
  ensureDir(dirname(to));
  copyFileSync(from, to);
}

function main() {
  const wipe = process.argv.includes("--wipe");

  if (wipe && existsSync(PATHS.memory)) {
    rmSync(PATHS.memory, { recursive: true, force: true });
  }

  ensureDir(PATHS.memory);
  ensureDir(PATHS.sopCandidates);
  ensureDir(PATHS.journal);
  ensureDir(PATHS.diary);
  ensureDir(dirname(PATHS.correctionsActive));
  ensureDir(PATHS.dreams);

  ensureJsonFile(PATHS.correctionsActive, []);
  ensureTextFile(PATHS.correctionsArchive, "");
  ensureJsonFile(PATHS.sopIndex, []);
  ensureJsonFile(PATHS.state, DEFAULT_STATE);
  ensureJsonFile(PATHS.dreamResidues, []);

  if (wipe) {
    overwriteCopiedFile(PROFILE_TEMPLATE_SOURCE, PATHS.profileTemplate);
    overwriteCopiedFile(MEMORY_README_SOURCE, PATHS.memoryReadme);
  } else {
    ensureCopiedFile(PROFILE_TEMPLATE_SOURCE, PATHS.profileTemplate);
    ensureCopiedFile(MEMORY_README_SOURCE, PATHS.memoryReadme);
  }

  console.log(`Memory bootstrap complete${wipe ? " (wiped and rebuilt)" : ""}: ${PATHS.memory}`);
}

main();
