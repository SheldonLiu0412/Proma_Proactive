## 收集今日活跃会话

**目标**：找到今天需要处理的会话，生成可读摘要。

### Step 1：收集今日活跃会话

```bash
npx tsx src/scripts/gather-sessions.ts --output /tmp/dream-gather.json
```

读取输出文件，了解今天有多少新会话和增量会话。**只关注关键字段（会话 ID、标题、类型、工作区），不需要完整打印或重复引用 JSON 内容。**

### Step 2：逐个提取会话摘要

对每个会话运行摘要提取：

**新会话**（全量提取）：
```bash
npx tsx src/scripts/extract-session-digest.ts --id <sessionId> --type <agent|chat> --title "<title>" --workspace "<workspaceName>" --output /tmp/dream-digest-<sessionId>.md
```

**增量会话**（从上次处理点开始）：
```bash
npx tsx src/scripts/extract-session-digest.ts --id <sessionId> --type <agent|chat> --title "<title>" --from <incrementalFrom> --output /tmp/dream-digest-<sessionId>.md
```

### Step 3：读取所有摘要

- 当摘要文件数量小于16时，依次读取每个生成的摘要文件，准备进入洞察阶段。**摘要文件较长时只读取核心段落，不需要逐字复述到回复中。**
- 当摘要文件数量大于16时，为避免上下文窗口不足，通过创建 SubAgent 分批洞察（一个读 10 条）。**每个 SubAgent 的 prompt 中必须要求其第一步读取 `~/.proma/dream/dream-agent-guide.md`。**
