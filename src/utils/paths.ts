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

  // Dream 存储目录
  dream: join(PROMA_DIR, "dream"),
  profile: join(PROMA_DIR, "dream", "profile.md"),
  preferencesActive: join(PROMA_DIR, "dream", "preferences", "active.json"),
  preferencesArchive: join(PROMA_DIR, "dream", "preferences", "archive.jsonl"),
  sopCandidates: join(PROMA_DIR, "dream", "sop-candidates"),
  sopIndex: join(PROMA_DIR, "dream", "sop-candidates", "index.json"),
  journal: join(PROMA_DIR, "dream", "dream_log"),
  diary: join(PROMA_DIR, "dream", "diary"),
  state: join(PROMA_DIR, "dream", "state.json"),
};
