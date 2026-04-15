## 识别并记录 Agent 行为纠正

**目标**：从会话摘要中提取有长期通用价值的 Agent 行为纠正，写入纠正记录。

若已读取会话摘要，可以直接复用（已经在上下文中时无需重新读文件）。

### 识别准则

对每个会话，观察其是否包含以下三类信号：

**① 明确陈述**
用户说出"以后应该…"、"不要再…"、"下次用…"等带通用性指示的句子，且指向的是 Agent 的**行为模式**（不是当前任务的具体产物）。

**② 错误纠偏模式**
Agent 在同一会话中反复用同一方式执行 → 报错或被用户指出 → 用户给出正确方式，且正确方式具有跨任务通用性。

**③ 负向行为信号**
用户撤销、删除或要求恢复 Agent 的某个行动，且该行动在未来有可能再次出现（具有通用性）。

### 过滤器（列出的类型应避免记录）

- 仅针对当前任务具体产物的修改（"把颜色改成红色"）
- 语气、风格类调整；属于不可控客观因素造成的问题（例如遇到软件BUG）
- 只在特定上下文成立、无法泛化到其他会话的操作

### 纠正类型判断

- **skill-update**：错误发生在某个 Skill 指导的工作期间，且错误根源与 Skill 内容直接相关（如路径错误、命令错误、步骤描述不清）
- **agent-behavior**：与特定 Skill 无关的通用 Agent 行为模式（会话中的工具选择、输出习惯、调用的文件操作行为等）（应记录属于可被提示词调控的范畴内的问题，例如遇到软件本身设计不符合预期，那不属于可控问题）

### target 取值规则

- `"global"` — 适用于所有工作区的通用行为
- `"workspace:<名称>"` — 仅适用于特定工作区（如 `workspace:Dream`）
- `"skill:<名称>"` — 特定 Skill 的更新建议（如 `skill:memory-daily`）

### 写入流程

1. 用 Read 工具读取 `~/.proma/memory/corrections/active.json`
2. 对每条识别出的纠正，先检查是否已有 target + summary 高度相似的条目 → 有则跳过
3. 新条目用 `correction:add` 写入：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/memory-ops.ts correction:add \
  --type "agent-behavior" \
  --target "global" \
  --summary "<一句话标签>" \
  --detail "<简洁描述，避免过度命令式语气>" \
  --source <sessionId>
```

```bash
npx tsx src/scripts/memory-ops.ts correction:add \
  --type "skill-update" \
  --target "skill:memory-daily" \
  --summary "<问题标签>" \
  --detail "<错误事实 + 具体更新建议>" \
  --source <sessionId>
```

### detail 写作要求

- **agent-behavior**：描述性语气，简洁（一两句话），不要出现batch/会话号等具体元信息，应是一种通用表述，例："向用户反问澄清时，使用 AskUserQuestion 工具呈现选项，避免在回复文字中直接列出问题"
- **skill-update**：说明错误事实 + 应该怎么改。例："gather-today SKILL：其中 Step 1 的 --output 参数应补全 .json 扩展名，否则Agent常常会读取失败，额外造成Agent自行纠错和探索的成本"
- **注意**：不写"必须"、"严禁"等过强命令式措辞；不超过三句话
- **禁止创建额外文件**：所有纠正数据通过 `correction:add` 写入 `corrections/active.json`，不要创建任何临时/汇总文件
