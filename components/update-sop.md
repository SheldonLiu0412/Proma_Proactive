## 更新 SOP 候选

**目标**：识别和固化通用且重复的工作流程。

### 识别标准

必须**同时满足**：
- 跨场景重复出现
- 步骤相对固定
- 复杂度适中
- 固化价值明确

**核心判断**：如果用户下次再做同类事情，步骤是否基本一致？换个项目、换个时间，步骤是否基本一致？

### 不应创建 SOP 的情况

- 该流程已经被固化为 Skill
- 多次出现但每次要求/步骤都不同的任务（创造性工作）
- 与具体项目深度绑定无法迁移的操作
- 过于宽泛的描述（如"开发新功能"）

### 执行 SOP 操作

```bash
# 创建 SOP（content 必须通过文件传入）
# 1. 先用 Write 工具把 SOP 内容写入临时文件
# 2. 再用 --content-file 传给脚本
npx tsx src/scripts/memory-ops.ts sop:create --title "<标题>" --source <sessionId> --content-file /tmp/sop_draft.md

# 更新 SOP
npx tsx src/scripts/memory-ops.ts sop:update --id <id> --status <candidate|validated|promoted> --source <sessionId> [--content-file /tmp/sop_draft.md]
```

详细的 SOP 识别标准和内容要求见 `~/.proma/memory/memory-agent-guide.md`。
