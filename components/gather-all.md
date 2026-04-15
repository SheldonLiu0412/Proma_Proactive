## 收集全量历史会话

**目标**：收集所有历史会话用于初始化，自动拆分为 part1/part2。

### Step 1：收集全量会话并提取摘要

一条命令完成会话收集和摘要提取：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/gather-all-sessions.ts --min-turns 2 --limit 80 --output /tmp/memory-init-sessions.json --with-digests /tmp/memory-init-digests
```

这会：
1. 收集所有有效会话（已过滤 Dream 工作区、空会话、少于 2 轮的 Agent 会话）
2. 如果超过 80 条，优先保留 Agent 类型会话，再优先保留最近的
3. 按 createdAt 升序排列，**自动拆分为两个文件**：`memory-init-sessions-part1.json` 和 `memory-init-sessions-part2.json`（避免单文件过长 Read 读不完）
4. 自动为每个会话调用 extract-session-digest.ts，将摘要保存到 `/tmp/memory-init-digests/<sessionId>.md`

### Step 2：读取收集结果

用 **Read 工具**分别读取两个文件（不要用 cat/python3 解析）：
- `/tmp/memory-init-sessions-part1.json`
- `/tmp/memory-init-sessions-part2.json`

从中记下：
- `summary.totalValid`：总有效会话数（两个文件中的 summary 相同，记录的是总数）
- 合并两个文件的 `sessions` 数组，第一个文件的首条 `createdAtStr` 到第二个文件末条的 `createdAtStr`：日期范围
- 脚本的终端输出中有摘要提取成功/失败数量

### Step 3：识别「最后一天」

从 part2 的 `sessions` 数组末尾往前找，找出 `createdAtStr` 日期与最后一条相同的所有会话——这些是「最后一天」的会话，将在最终批次走完整 memory-daily 流程（含 diary + memory_log）。其余批次只提取核心记忆。
