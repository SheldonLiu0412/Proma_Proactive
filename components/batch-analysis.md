## 分批分析与记忆构建

**目标**：按预先计算好的批次方案，通过 SubAgent 顺序处理构建初始记忆。

### 读取批次方案

终端输出（来自 gather-all 阶段的 plan-batches.ts）已打印批次概况，记下 `totalBatches` 即可。**不要用 Read 工具读取批次文件**，批次详情由 SubAgent 自己读取。

### SubAgent 任务模板

为每个批次创建 SubAgent（Agent 工具），提供以下 prompt：

---

**批次 1（创建批）的 SubAgent prompt：**

```
你是 Proma Memory Agent，正在执行 Memory 初始化的第 1 批（共 M 批）。

首先用 Read 工具完整读取 `~/.proma/memory/memory-agent-guide.md`，严格遵守其中的全部规范。

## 步骤

1. 读取 `/tmp/memory-init-batches.json` 中 `batches[0].sessionIds`，获取本批会话 ID 列表
2. 读取每个会话的摘要文件：`/tmp/memory-init-digests/<sessionId>.md`
3. 分析摘要，提取用户画像、SOP 候选、纠正与偏好（各类规范见工作指南）
4. 创建 profile.md，执行记忆写入（规范见工作指南）
5. 标记完成（见工作指南）

以上全部执行完成以后简要文字汇报即可（不需要额外创建汇报文档），然后输出：✅ BATCH_1_COMPLETE
```

---

**批次 N（迭代批）的 SubAgent prompt：**

```
你是 Proma Memory Agent，正在执行 Memory 初始化的第 N 批（共 M 批）。

首先用 Read 工具完整读取 `~/.proma/memory/memory-agent-guide.md`，严格遵守其中的全部规范。

## 步骤

1. 读取 `/tmp/memory-init-batches.json` 中 `batches[N-1].sessionIds` 及 `batches[N-1].isLast`
2. 读取当前记忆状态：`~/.proma/memory/profile.md`、`corrections/active.json`、`sop:list`
3. 读取每个会话的摘要文件：`/tmp/memory-init-digests/<sessionId>.md`
4. 对比已有记忆，执行迭代更新（规范见工作指南）
5. 若 `isLast: true`，额外执行最后一批流程（见下方）
6. 标记完成（见工作指南）

以上全部执行完成以后简要文字汇报即可（不需要额外创建汇报文档），然后输出：✅ BATCH_N_COMPLETE
```

---

**最后一批额外流程（`isLast: true` 时执行）：**

```
## 额外要求（isLast: true）

完成核心记忆迭代后，还需要：

1. 撰写变更日志到 `~/.proma/memory/memory_log/YYYY-MM-DD.md`（用最近一天的日期）
   - 覆盖**整个初始化过程**的成果，而非仅最后一批
   - 内容：处理概况（总会话数、批次数）、最终记忆状态、关键洞察
2. 撰写初识日记到 `~/.proma/memory/diary/YYYY-MM-DD.md`（写法见工作指南）
3. 标记所有会话完成：`state:complete`
```

### 执行顺序

**重要：SubAgent 必须按顺序执行，不能并行。** 后续批次需要在前一批的记忆基础上迭代。

按 `totalBatches` 循环，每次只需在 prompt 中告知 SubAgent 当前批次序号（N），SubAgent 会自己从批次文件中读取对应的 `sessionIds` 和 `isLast`：
- 第 1 批：使用创建批模板
- 第 2 批起：使用迭代批模板
- 收到 `✅ BATCH_N_COMPLETE` 后再发起下一批

每批完成后在回复中简要记录产出，不写入任何文件。
