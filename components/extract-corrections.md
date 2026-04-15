## 识别并记录 Agent 纠正与用户偏好

**目标**：从会话摘要中提取有长期通用价值的 Agent 行为纠正和用户偏好，写入纠正记录。

若已读取会话摘要，可以直接复用（已经在上下文中时无需重新读文件）。

### 识别准则

对每个会话，观察其是否包含以下信号：

**① 明确陈述**
用户说出"以后应该…"、"不要再…"、"下次用…"等带通用性指示的句子，且指向的是 Agent 的**行为模式**或**交付风格**（不是当前任务的具体产物）。

**② 错误纠偏模式**
Agent 在同一会话中反复用同一方式执行 → 报错或被用户指出 → 用户给出正确方式，且正确方式具有跨任务通用性。

**③ 负向行为信号**
用户撤销、删除或要求恢复 Agent 的某个行动，且该行动在未来有可能再次出现（具有通用性）。

**④ 用户偏好信号**
用户表达了对交付结果的明确风格倾向（如"简洁一点"、"不要加注释"、"用表格对比"），且该倾向在多个会话中稳定出现或被用户主动强调（单次出现的风格要求不记录）。

### 过滤器（列出的类型应避免记录）

- 仅针对当前任务具体产物的修改（"把颜色改成红色"）
- 只在特定上下文成立、无法泛化到其他会话的操作
- 属于不可控客观因素造成的问题（例如遇到软件 Bug）
- 单次出现的风格要求（偏好需要多次验证才记录）

### 类型判断

三种类型，发生层不同：

- **skill-update**：错误根源在某个 Skill 内容本身（路径错误、命令错误、步骤描述不清）。Skill 修正后问题可消除。
- **agent-behavior**：Agent 的通用行为模式出了问题（工具选择、输出习惯、文件操作方式等），与具体 Skill 无关，属于可被系统提示词调控的范畴。
- **user-preference**：Agent **没有做错**，但用户有稳定的交付风格偏好。区别于 `agent-behavior` 的核心在于：前者是 Agent 行为有问题需要纠偏，后者是用户的个人偏好需要主动迎合。

> **`agent-behavior` vs `user-preference` 举例**
> - `agent-behavior`："用 AskUserQuestion 工具提问，不要在回复文字中直接列出问题" → Agent 行为模式需要改正
> - `user-preference`："代码修改后不需要解释每一行做了什么，直接给结果" → Agent 没错，但用户倾向于简洁交付

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
# agent-behavior
npx tsx src/scripts/memory-ops.ts correction:add \
  --type "agent-behavior" \
  --target "global" \
  --summary "<一句话标签>" \
  --detail "<简洁描述，避免过度命令式语气>" \
  --source <sessionId>

# skill-update
npx tsx src/scripts/memory-ops.ts correction:add \
  --type "skill-update" \
  --target "skill:memory-daily" \
  --summary "<问题标签>" \
  --detail "<错误事实 + 具体更新建议>" \
  --source <sessionId>

# user-preference
npx tsx src/scripts/memory-ops.ts correction:add \
  --type "user-preference" \
  --target "global" \
  --summary "<偏好标签>" \
  --detail "<描述用户稳定偏好的具体表现>" \
  --source <sessionId>
```

### detail 写作要求

- **agent-behavior**：描述性语气，简洁（一两句话），通用表述，不出现具体会话/批次元信息。例："向用户反问澄清时，使用 AskUserQuestion 工具呈现选项，避免在回复文字中直接列出问题"
- **skill-update**：说明错误事实 + 应该怎么改。例："gather-today Step 1 的 --output 参数应补全 .json 扩展名，否则后续读取失败"
- **user-preference**：描述用户偏好的具体表现和适用场景，不要写成"用户要求Agent做X"的命令句，而是"用户倾向于…"的观察句。例："代码交付后用户倾向于不需要逐行解释，直接给出结果即可；多次在收到详细注释后要求删除"
- **注意**：不写"必须"、"严禁"等过强命令式措辞；不超过三句话
- **禁止创建额外文件**：所有纠正数据通过 `correction:add` 写入 `corrections/active.json`，不要创建任何临时/汇总文件
