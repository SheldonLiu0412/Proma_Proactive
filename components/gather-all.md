## 收集全量历史会话

**目标**：收集所有历史会话用于初始化，自动拆分为 part1/part2。

### Step 1：收集全量会话并提取摘要

一条命令完成会话收集和摘要提取：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/gather-all-sessions.ts --min-turns 2 --limit 80 --output /tmp/memory-init-sessions.json --with-digests /tmp/memory-init-digests
```

这会：
1. 收集所有有效会话（已过滤 Memory 运行的工作区、空Chat会话&少于 2 轮的 Agent 会话）
2. 如果超过 80 条，优先保留 Agent 类型会话，再优先保留最近的
3. 按 createdAt 升序排列，**自动拆分为两个文件**：`memory-init-sessions-part1.json` 和 `memory-init-sessions-part2.json`（避免单文件过长 Read 读取失败）
4. 自动为每个会话调用 extract-session-digest.ts，将摘要保存到 `/tmp/memory-init-digests/<sessionId>.md`

### Step 2：计算分批方案

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/plan-batches.ts \
  --mode init \
  --input /tmp/memory-init-sessions-part1.json \
  --input2 /tmp/memory-init-sessions-part2.json \
  --output /tmp/memory-init-batches.json
```

终端输出会打印批次概况（总会话数、总批次数、每批会话数）。批次详情（每批的 sessionIds）存入 `/tmp/memory-init-batches.json`，**暂不读取**，在布置 SubAgent 时按需读取对应批次即可。
