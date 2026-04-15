import { homedir } from "os";
import { join } from "path";

const PROMA_DIR = join(homedir(), ".proma");

export const PATHS = {
  // Proma 数据目录
  proma: PROMA_DIR,
  agentSessions: join(PROMA_DIR, "agent-sessions.json"),
  agentSessionLogs: join(PROMA_DIR, "agent-sessions"),
  conversations: join(PROMA_DIR, "conversations.json"),
  conversationLogs: join(PROMA_DIR, "conversations"),
  workspaces: join(PROMA_DIR, "agent-workspaces.json"),
  workspacesDir: join(PROMA_DIR, "agent-workspaces"),

  // Memory 存储目录
  memory: join(PROMA_DIR, "memory"),
  profile: join(PROMA_DIR, "memory", "profile.md"),
  preferencesActive: join(PROMA_DIR, "memory", "preferences", "active.json"),
  preferencesArchive: join(PROMA_DIR, "memory", "preferences", "archive.jsonl"),
  sopCandidates: join(PROMA_DIR, "memory", "sop-candidates"),
  sopIndex: join(PROMA_DIR, "memory", "sop-candidates", "index.json"),
  journal: join(PROMA_DIR, "memory", "memory_log"),
  diary: join(PROMA_DIR, "memory", "diary"),
  state: join(PROMA_DIR, "memory", "state.json"),
  correctionsActive: join(PROMA_DIR, "memory", "corrections", "active.json"),
  correctionsArchive: join(PROMA_DIR, "memory", "corrections", "archive.jsonl"),
};
