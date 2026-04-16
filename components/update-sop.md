## 更新 SOP 候选

**目标**：识别和固化通用且重复的工作流程。

### 识别标准

必须**同时满足**：
- 有价值：相同任务重复做，需要靠SKILL才能完成跨会话迁移，且用户在未来大概率会继续做相同任务；
- 适于固化：步骤相对固定，具备适中的复杂度，能够固化为持久使用的SKILL；
- 能够归入通用场景：例如发现用户制作了一张SVG格式的XXX主题-LOGO，这是一个具体任务；而真正关注的应该是用户在制作SVG-格式的LOGO，这是一个通用场景。

**核心判断**：这是一个通用的场景还是只是一次具体的任务？用户还会多次面对这个通用场景吗？如果用户下次再做同类事情，步骤是否基本一致？

### 判断是否已有 Skill 覆盖

在决定创建 SOP 之前，先运行以下命令获取当前全部 Skill 列表：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/list-skills.ts
```

对比输出中的 Skill 名称和描述，判断该工作流是否已被某个 Skill 覆盖。若已有对应 Skill，跳过创建。

### 执行 SOP 操作

```bash
# 创建 SOP（content 必须通过文件传入）
# 1. 先用 Write 工具把 SOP 内容写入临时文件
# 2. 再用 --content-file 传给脚本
npx tsx src/scripts/memory-ops.ts sop:create --title "<标题>" --source <sessionId> --content-file /tmp/sop_draft.md

# 更新 SOP
npx tsx src/scripts/memory-ops.ts sop:update --id <id> --status <candidate|validated|promoted> --source <sessionId> [--content-file /tmp/sop_draft.md]
```

**禁止创建额外文件**：SOP 内容通过上述命令写入 `sop-candidates/`，不要额外创建 `sop-and-corrections.md` 或其他任何临时/汇总文件。`/tmp/sop_draft.md` 仅用于传参，用完即弃。
