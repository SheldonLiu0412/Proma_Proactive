## 分批分析与记忆构建（NeedsBatching 模式）

**仅当 `NeedsBatching: true` 时执行本阶段。** 若为 false，跳过本阶段，直接进入后续分析阶段。

### 读取批次方案

此前终端输出已打印批次概况，记下 `totalBatches` 即可。**不要用 Read 工具读取批次文件**，批次详情由 SubAgent 自己读取。

### SubAgent 任务模板

为每个批次创建 SubAgent，提供以下 prompt：

---

**批次 1（创建批）的 SubAgent prompt：**

```
你是 Proma Memory Agent，正在执行 Memory 每日整合的第 1 批（共 M 批）。

首先用 Read 工具完整读取 `{{PROJECT_ROOT}}/docs/memory-agent-guide.md`，严格遵守其中的全部规范。

## 步骤

1. 读取 `/tmp/memory-daily-batches.json` 中 `batches[0].sessionIds`，获取本批会话 ID 列表
2. 读取当前记忆状态：`{{MEMORY_ROOT}}/profile.md`、`{{MEMORY_ROOT}}/corrections/active.json`，并执行 `cd {{PROJECT_ROOT}} && npx tsx src/scripts/memory-ops.ts sop:list`
3. 读取每个会话的摘要文件：`/tmp/memory-daily-digests/<sessionId>.md`
4. 分析摘要，按 memory-agent-guide.md 规范提取：用户画像更新、SOP 候选、纠正与偏好
5. SOP、corrections 等结构化记忆**必须通过脚本写入**（`sop:create`、`correction:add`），严禁直接 Write/Edit
6. 标记完成（见工作指南）

以上全部执行完成以后简要文字汇报即可（不需要额外创建汇报文档），并输出：✅ BATCH_1_COMPLETE
```

---

**批次 N（迭代批）的 SubAgent prompt（若是最终一批则需要额外追加指令）：**

```
你是 Proma Memory Agent，正在执行 Memory 每日整合的第 N 批（共 M 批）。

首先用 Read 工具完整读取 `{{PROJECT_ROOT}}/docs/memory-agent-guide.md`，严格遵守其中的全部规范。

## 步骤

1. 读取 `/tmp/memory-daily-batches.json` 中 `batches[N-1].sessionIds`
2. 读取当前记忆状态：`{{MEMORY_ROOT}}/profile.md`、`{{MEMORY_ROOT}}/corrections/active.json`，并执行 `cd {{PROJECT_ROOT}} && npx tsx src/scripts/memory-ops.ts sop:list`
3. 读取每个会话的摘要文件：`/tmp/memory-daily-digests/<sessionId>.md`
4. 在现有记忆基础上执行增量更新（规范见工作指南）
5. 标记完成（见工作指南）

以上全部执行完成以后简要文字汇报即可（不需要额外创建汇报文档），并输出：✅ BATCH_N_COMPLETE
```

---

**执行最后一批时，主 Agent 需要额外向 SubAgent prompt 追加指令：**

```
在完成本批核心记忆更新后，还需要继续执行以下收尾工作：

1. 用 Read 工具读取 `{{PROJECT_ROOT}}/components/memory-log-write.md`，遵从其规范撰写变更日志到 `{{MEMORY_ROOT}}/memory_log/YYYY-MM-DD.md`
2. 再用 Read 工具读取 `{{PROJECT_ROOT}}/components/diary-write.md`，遵从其规范撰写日记到 `{{MEMORY_ROOT}}/diary/YYYY-MM-DD.md`
3. 标记所有会话完成：`state:complete`
```

### SubAgent 执行顺序

**重要：SubAgent 必须按顺序执行，不能并行。** 后续批次需要在前一批的记忆基础上迭代。

按 `totalBatches` 循环，由主 Agent 判断当前批次：
- 第 1 批：使用创建批模板
- 第 2 批起：使用迭代批模板
- 若当前批次 `N === totalBatches`，在上述模板后**额外追加**最后一批收尾指令
- 收到 `✅ BATCH_N_COMPLETE` 后再发起下一批

**当 NeedsBatching 为 true 时，memory_log、diary、state:complete 均由最后一批 SubAgent 负责完成，主 Agent 的后续阶段（memory-log-write、diary-write、daily-complete）应跳过。**
