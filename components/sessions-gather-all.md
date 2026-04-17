## 收集全量历史会话

**目标**：收集所有历史会话用于初始化，自动拆分为 part1/part2。

任务开始后的第一步必须直接执行本组件中的收集脚本；在脚本产物生成之前，禁止额外检查工作区、cwd 或 `~/.proma/` 下的原始会话数据。

### Step 1：收集全量会话并提取摘要

无需多余操作，直接使用以下命令完成会话收集和摘要提取：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/gather-all-sessions.ts --min-turns 2 --limit 80 --output /tmp/memory-init-sessions.json --with-digests /tmp/memory-init-digests
```

执行会自动完成以下工作：
1. 收集并优先保留最近的 Agent 有效会话，不超过 80 条（脚本中已完成相应的会话过滤）
2. 按 createdAt 升序排列，过多时会自动拆分为两个文件：`memory-init-sessions-part1.json` 和 `memory-init-sessions-part2.json`（避免单文件过长 Read 读取失败）
3. 最终摘要保存到 `/tmp/memory-init-digests/<sessionId>.md` 以供使用

### Step 2：计算分批方案

继续使用以下命令完成任务批次拆分：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/plan-batches.ts \
  --mode init \
  --input /tmp/memory-init-sessions-part1.json \
  --input2 /tmp/memory-init-sessions-part2.json \
  --output /tmp/memory-init-batches.json
```

终端输出会打印批次概况（总会话数、总批次数、每批会话数）。批次详情（每批的 sessionIds）存入 `/tmp/memory-init-batches.json`，**暂不读取**，在布置 SubAgent 时按需读取对应批次即可。
