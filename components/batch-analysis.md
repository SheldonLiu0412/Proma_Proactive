## 分批分析与记忆构建

**目标**：将全量历史会话按时间顺序分批，通过 SubAgent 顺序处理构建初始记忆。

### 分批规则

1. 按 sessions 数组顺序（已按 createdAt 升序），每 10 个一批
2. **最后一天的会话单独成一批**（即使不满 10 个），作为最后一个批次
3. 如果最后一天的会话原本就在最后一批中且总数 ≤ 10，不需要额外拆分，直接作为单独一批

### SubAgent 任务模板

为每个批次创建 SubAgent（Agent 工具），提供以下 prompt：

---

**批次 1（创建批）的 SubAgent prompt：**

```
你是 Proma Memory Agent，正在执行 Memory 初始化的第 1 批（共 M 批）。

首先用 Read 工具完整读取 `~/.proma/memory/memory-agent-guide.md`，严格遵守其中的全部规范。

## 会话列表

[粘贴本批次的会话 JSON 数组]

## 步骤

1. 读取每个会话的摘要文件：`/tmp/memory-init-digests/<sessionId>.md`
2. 分析摘要，提取记忆（详细需求及各类规范见工作指南）
3. 创建 profile.md，执行记忆写入（规范见工作指南）
4. 标记完成（见工作指南）

在最终回复中输出一段总结（不要额外写入任何文件），然后输出：✅ BATCH_1_COMPLETE
```

---

**批次 N（迭代批）的 SubAgent prompt：**

```
你是 Proma Memory Agent，正在执行 Memory 初始化的第 N 批（共 M 批）。

首先用 Read 工具完整读取 `~/.proma/memory/memory-agent-guide.md`，严格遵守其中的全部规范。

## 会话列表

[粘贴本批次的会话 JSON 数组]

## 步骤

1. 读取当前记忆状态：`~/.proma/memory/profile.md`、`corrections/active.json`、`sop:list`
2. 读取每个会话的摘要文件：`/tmp/memory-init-digests/<sessionId>.md`
3. 对比已有记忆，进行迭代更新（规范见工作指南）
4. 标记完成（见工作指南）

在回复中输出一段总结（不要写入任何文件），然后输出：✅ BATCH_N_COMPLETE
```

---

**最后一批（最近一天）的额外要求：**

在迭代批的基础上，附加以下内容：

```
## 额外要求

这是最后一批，包含最近一天的会话。完成核心记忆迭代后，还需要：

1. 撰写变更日志到 `~/.proma/memory/memory_log/YYYY-MM-DD.md`（用最近一天的日期）
   - 覆盖**整个初始化过程**的成果，而非仅最后一批
   - 内容：处理概况（总会话数、批次数）、最终记忆状态、关键洞察
2. 撰写初识日记到 `~/.proma/memory/diary/YYYY-MM-DD.md`（写法见工作指南）
3. 标记所有会话完成：`state:complete`
```

### 执行顺序

**重要：SubAgent 必须按顺序执行，不能并行。** 因为后续批次需要在前一批的记忆基础上迭代。

1. 创建第 1 批 SubAgent（创建批），等待完成
2. 确认 `✅ BATCH_1_COMPLETE` 后，创建第 2 批 SubAgent（迭代批），等待完成
3. 重复直到所有历史批次完成
4. 创建最后一批 SubAgent（最近一天 + 完整流程），等待完成

每个 SubAgent 完成后，通过直接输出的方式简要记录其产出（新增了什么记忆、更新了什么）。
