import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const PROMA_DIR = join(homedir(), ".proma");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");

/**
 * @typedef {Object} ProjectPaths
 * @property {string} projectRoot
 * @property {string} proma
 * @property {string} agentSessions
 * @property {string} agentSessionLogs
 * @property {string} conversations
 * @property {string} conversationLogs
 * @property {string} workspaces
 * @property {string} workspacesDir
 * @property {string} memory
 * @property {string} memoryReadme
 * @property {string} profile
 * @property {string} profileTemplate
 * @property {string} sopCandidates
 * @property {string} sopIndex
 * @property {string} journal
 * @property {string} diary
 * @property {string} dreams
 * @property {string} dreamResidues
 * @property {string} state
 * @property {string} correctionsActive
 * @property {string} correctionsArchive
 */

/** @type {ProjectPaths} */
export const PATHS = {
  projectRoot: PROJECT_ROOT,
  proma: PROMA_DIR,
  agentSessions: join(PROMA_DIR, "agent-sessions.json"),
  agentSessionLogs: join(PROMA_DIR, "agent-sessions"),
  conversations: join(PROMA_DIR, "conversations.json"),
  conversationLogs: join(PROMA_DIR, "conversations"),
  workspaces: join(PROMA_DIR, "agent-workspaces.json"),
  workspacesDir: join(PROMA_DIR, "agent-workspaces"),
  memory: join(PROJECT_ROOT, ".memory"),
  memoryReadme: join(PROJECT_ROOT, ".memory", "README.md"),
  profile: join(PROJECT_ROOT, ".memory", "profile.md"),
  profileTemplate: join(PROJECT_ROOT, ".memory", "profile-template.md"),
  sopCandidates: join(PROJECT_ROOT, ".memory", "sop-candidates"),
  sopIndex: join(PROJECT_ROOT, ".memory", "sop-candidates", "index.json"),
  journal: join(PROJECT_ROOT, ".memory", "memory_log"),
  diary: join(PROJECT_ROOT, ".memory", "diary"),
  dreams: join(PROJECT_ROOT, ".memory", "dreams"),
  dreamResidues: join(PROJECT_ROOT, ".memory", "dreams", "residues.json"),
  state: join(PROJECT_ROOT, ".memory", "state.json"),
  correctionsActive: join(PROJECT_ROOT, ".memory", "corrections", "active.json"),
  correctionsArchive: join(PROJECT_ROOT, ".memory", "corrections", "archive.jsonl"),
};
