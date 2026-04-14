## 识别并记录 Agent 行为纠正

**目标**：从会话摘要中提取有长期通用价值的 Agent 行为纠正，写入纠正记录。

复用上一阶段已读取的会话摘要（无需重新读文件）。

### 识别标准

对每个会话，过一遍以下三类信号，逐条判断是否值得记录：

**① 明确陈述**
用户说出"以后应该…"、"不要再…"、"下次用…"等带通用性指示的句子，且指向的是 Agent 的**行为模式**（不是当前任务的具体产物）。

**② 错误纠偏模式**
Agent 在同一会话中反复用同一方式执行 → 报错或被用户指出 → 用户给出正确方式，且正确方式具有跨任务通用性。

**③ 负向行为信号**
用户撤销、删除或要求恢复 Agent 的某个行动，且该行动在未来有可能再次出现（具有通用性）。

### 过滤器（有任意一条则不记录）

- 仅针对当前任务具体产物的修改（"把颜色改成红色"）
- 语气、风格类调整
- 只在特定上下文成立、无法泛化到其他会话的操作

### 纠正类型判断

- **skill-update**：错误发生在某个 Skill 执行期间，且错误根源与 Skill 内容直接相关（路径错误、命令错误、步骤描述不清）
- **agent-behavior**：与特定 Skill 无关的通用 Agent 行为模式（工具选择、输出习惯、文件操作行为等）

### target 取值规则

- `"global"` — 适用于所有工作区的通用行为
- `"workspace:<名称>"` — 仅适用于特定工作区（如 `workspace:Dream`）
- `"skill:<名称>"` — 特定 Skill 的更新建议（如 `skill:dream-daily`）

### 写入流程

1. 用 Read 工具读取 `~/.proma/dream/corrections/active.json`（不存在则初始化为 `[]`）
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
  --target "skill:dream-daily" \
  --summary "<问题标签>" \
  --detail "<错误事实 + 具体更新建议>" \
  --source <sessionId>
```

### detail 写作要求

- **agent-behavior**：描述性语气，简洁，一两句话。例："向用户反问澄清时，使用 AskUserQuestion 工具呈现选项，避免在回复文字中直接列出问题"
- **skill-update**：说明错误事实 + 应该怎么改。例："gather-today Step 1 的 --output 参数应补全 .json 扩展名，否则后续读取失败"
- **禁忌**：不写"必须"、"严禁"等过强命令式措辞；不超过三句话
