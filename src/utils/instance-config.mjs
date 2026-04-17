import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PATHS } from "./paths.mjs";

const CONFIG_DIR = join(PATHS.projectRoot, "config");
const CONFIG_TEMPLATE_PATH = join(CONFIG_DIR, "memory-instance.template.json");
const CONFIG_LOCAL_PATH = join(CONFIG_DIR, "memory-instance.local.json");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function getConfigPaths() {
  return {
    dir: CONFIG_DIR,
    template: CONFIG_TEMPLATE_PATH,
    local: CONFIG_LOCAL_PATH,
  };
}

function loadPromaWorkspaces() {
  if (!existsSync(PATHS.workspaces)) return [];
  const data = loadJson(PATHS.workspaces);
  return Array.isArray(data?.workspaces) ? data.workspaces : [];
}

function resolveWorkspaceRef(ref, workspaces = loadPromaWorkspaces()) {
  return workspaces.find(
    (ws) => ws.id === ref || ws.slug === ref || ws.name === ref
  ) || null;
}

function loadMemoryInstanceConfig(options = {}) {
  const { allowMissing = false } = options;
  if (!existsSync(CONFIG_LOCAL_PATH)) {
    if (allowMissing) return null;
    throw new Error(
      `Memory instance config not found: ${CONFIG_LOCAL_PATH}\n` +
      "请先运行 memory-setup / install-memory-instance.ts 完成配置。"
    );
  }

  const raw = loadJson(CONFIG_LOCAL_PATH);
  const memoryWorkspace = raw?.memoryWorkspace;

  if (!memoryWorkspace?.id || !memoryWorkspace?.slug || !memoryWorkspace?.name) {
    throw new Error(
      `Invalid memory instance config: ${CONFIG_LOCAL_PATH}\n` +
      "缺少 memoryWorkspace.id / slug / name。"
    );
  }

  const promaRepoRoot =
    typeof raw?.promaRepoRoot === "string" && raw.promaRepoRoot.trim().length > 0
      ? raw.promaRepoRoot
      : null;

  return {
    ...raw,
    projectRoot: PATHS.projectRoot,
    memoryRoot: PATHS.memory,
    configPath: CONFIG_LOCAL_PATH,
    configTemplatePath: CONFIG_TEMPLATE_PATH,
    promaRepoRoot,
    memoryWorkspace,
    memoryWorkspaceDir: join(PATHS.workspacesDir, memoryWorkspace.slug),
    memorySkillsDir: join(PATHS.workspacesDir, memoryWorkspace.slug, "skills"),
    sdkCliPath: promaRepoRoot
      ? join(promaRepoRoot, "node_modules", "@anthropic-ai", "claude-agent-sdk", "cli.js")
      : null,
    sdkModulePath: promaRepoRoot
      ? join(promaRepoRoot, "node_modules", "@anthropic-ai", "claude-agent-sdk", "sdk.mjs")
      : null,
  };
}

export {
  getConfigPaths,
  loadMemoryInstanceConfig,
  loadPromaWorkspaces,
  resolveWorkspaceRef,
};
