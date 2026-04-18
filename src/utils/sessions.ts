import { readFileSync, existsSync } from "fs";

/**
 * 共享类型：Proma Agent 会话元数据（与 agent-sessions.json 对齐）
 */
export interface AgentSessionMeta {
  id: string;
  title: string;
  workspaceId?: string;
  channelId?: string;
  sdkSessionId?: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  pinned?: boolean;
}

/**
 * 共享类型：Proma Chat 会话元数据（与 conversations.json 对齐）
 */
export interface ChatSessionMeta {
  id: string;
  title: string;
  modelId?: string;
  channelId?: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
}

/**
 * 共享类型：Proma 工作区元数据
 */
export interface WorkspaceMeta {
  id: string;
  name: string;
  slug: string;
}

/**
 * 统计 JSONL 文件的非空行数。
 */
export function countJsonlLines(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const content = readFileSync(filePath, "utf-8");
  return content.split("\n").filter((line) => line.trim().length > 0).length;
}

/**
 * 统计 JSONL 中用户消息的数量（即对话轮数）。
 * 兼容两种格式：{role: "user"} 或 {type: "user"}。
 */
export function countUserTurns(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  let turns = 0;
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.role === "user" || msg.type === "user") turns++;
    } catch {
      continue;
    }
  }
  return turns;
}

/**
 * 读取 JSONL 文件最后一条消息的 _createdAt 时间戳。
 * 这是判断会话是否有真实新内容的关键——metadata 的 updatedAt 可能因重新打开而变化。
 */
export function getLastMessageTimestamp(filePath: string): number | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const msg = JSON.parse(lines[i]);
      if (msg._createdAt) return msg._createdAt;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 读取 JSON 文件并解析，文件不存在时返回 fallback。
 */
export function loadJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

/**
 * 工作区 id → name 映射。
 */
export function buildWorkspaceMap(workspaces: WorkspaceMeta[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const ws of workspaces) {
    map.set(ws.id, ws.name);
  }
  return map;
}
