## 收集今日活跃会话

**目标**：找到今天需要处理的会话，生成可读摘要。

任务开始后的第一步必须直接执行本组件中的收集脚本；在脚本产物生成之前，禁止额外检查工作区、cwd 或 `~/.proma/` 下的原始会话数据。

### Step 1：收集今日活跃会话

```bash
npx tsx src/scripts/gather-sessions.ts --output /tmp/memory-gather.json
```

读取输出文件，了解今天有多少新会话和增量会话。**只关注关键字段（会话 ID、标题、类型、工作区），不需要完整打印或重复引用 JSON 内容。**

### Step 2：逐个提取会话摘要

对每个会话运行摘要提取：

**新会话**（全量提取）：
```bash
npx tsx src/scripts/extract-session-digest.ts --id <sessionId> --type <agent|chat> --title "<title>" --workspace "<workspaceName>" --output /tmp/memory-digest-<sessionId>.md
```

**增量会话**（从上次处理点开始）：
```bash
npx tsx src/scripts/extract-session-digest.ts --id <sessionId> --type <agent|chat> --title "<title>" --from <incrementalFrom> --output /tmp/memory-digest-<sessionId>.md
```

### Step 3：计算分批方案

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/plan-batches.ts \
  --mode daily \
  --input /tmp/memory-gather.json \
  --output /tmp/memory-daily-batches.json
```

终端输出会打印 `NeedsBatching: true/false` 和批次概况：
- **`NeedsBatching: false`**：直接读取所有摘要文件进入下一阶段（无需 SubAgent）
- **`NeedsBatching: true`**：通过 SubAgent 分批处理，批次详情见 `/tmp/memory-daily-batches.json`（布置 SubAgent 时按需读取）
