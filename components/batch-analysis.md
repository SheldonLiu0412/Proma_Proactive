## 分批分析与记忆构建

**目标**：按预先计算好的批次方案，通过 SubAgent 顺序处理构建初始记忆。

### 读取批次方案

此前的终端输出（来自执行 plan-batches.ts ）已打印批次概况，记下 `totalBatches` 即可。**不要用 Read 工具读取生成的批次文件**，批次详情由 SubAgent 自己读取。

### SubAgent 任务模板

为每个批次创建 SubAgent ，提供以下 prompt：

---

**批次 1（创建批）的 SubAgent prompt：**

```
你是 Proma Memory Agent，正在执行 Memory 初始化的第 1 批（共 M 批）。

首先用 Read 工具完整读取 `/Users/jay/Documents/GitHub/Proma_Proactive/docs/memory-agent-guide.md`，严格遵守其中的全部规范。

## 步骤

1. 读取 `/tmp/memory-init-batches.json` 中 `batches[0].sessionIds`，获取本批会话 ID 列表
2. 读取每个会话的摘要文件：`/tmp/memory-init-digests/<sessionId>.md`
3. 分析摘要，提取用户画像、SOP 候选、纠正与偏好（各类规范详见工作指南）
4. 用 Write 工具创建 `~/.proma/memory/profile.md`
5. SOP、corrections、偏好等结构化记忆**必须通过脚本写入**（`sop:create`、`correction:add`），严禁直接 Write/Edit 这些文件
6. 标记完成（见工作指南）

以上全部执行完成以后简要文字汇报即可（不需要额外创建汇报文档），并输出：✅ BATCH_1_COMPLETE
```

---

**批次 N（迭代批）的 SubAgent prompt：**

```
你是 Proma Memory Agent，正在执行 Memory 初始化的第 N 批（共 M 批）。

首先用 Read 工具完整读取 `/Users/jay/Documents/GitHub/Proma_Proactive/docs/memory-agent-guide.md`，严格遵守其中的全部规范。

## 步骤

1. 读取 `/tmp/memory-init-batches.json` 中 `batches[N-1].sessionIds`
2. 读取当前记忆状态：`~/.proma/memory/profile.md`、`corrections/active.json`、`sop:list`
3. 读取每个会话的摘要文件：`/tmp/memory-init-digests/<sessionId>.md`
4. 对比已有记忆，执行迭代更新（规范见工作指南）
5. 标记完成（见工作指南）

以上全部执行完成以后简要文字汇报即可（不需要额外创建汇报文档），并输出：✅ BATCH_N_COMPLETE
```

---

**执行最后一批时，主 Agent 需要额外向 SubAgent prompt 追加指令：**

```
在完成本批核心记忆更新后，还需要继续执行以下收尾工作：

1. 撰写变更日志到 `~/.proma/memory/memory_log/YYYY-MM-DD.md`
   - 内容：本批次处理概况、记忆变更记录
2. 撰写日记到 `~/.proma/memory/diary/YYYY-MM-DD.md`（写法见工作指南）
3. 标记所有会话完成：`state:complete`
```

### 执行顺序

**重要：SubAgent 必须按顺序执行，不能并行。** 后续批次需要在前一批的记忆基础上迭代。

按 `totalBatches` 循环，由主 Agent 自己判断当前是不是最后一批，然后再组装 prompt：
- 第 1 批：使用创建批模板
- 第 2 批起：使用迭代批模板
- 若当前批次 `N === totalBatches`，则在上述模板后**额外追加**“最后一批时，主 Agent 需要额外追加到 SubAgent prompt 的指令”
- 收到 `✅ BATCH_N_COMPLETE` 后再发起下一批

每批完成后在回复中简要记录产出，不写入任何文件。
