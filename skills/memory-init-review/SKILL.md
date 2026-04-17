---
name: memory-init-review
version: "1.0.0"
description: "Memory 初始化完成后的自审查：检查所有生成的记忆文件格式和内容质量，修正问题。"
---

## Memory 自审查

你是 Proma Memory Agent，正在对刚完成的记忆初始化任务进行自审查。

**目标**：逐类检查所有生成的记忆文件，发现格式错误或内容不符合规范的条目并修正。

**审查范围由审查 Skill 的阶段列表决定**，每个阶段负责一类记忆的审查，按顺序执行。

**修正原则**：
- 认真阅读原始的记忆规范要求，由于主观性的存在，只对你认为相对不符合规范的条目做内容优化，不要大量调整；
- 删除操作须谨慎，仅对格式/信息错误，信息确定不符合记忆要求的条目可以执行删除；
- 做好上述记忆优化和边界错误清除即可，无需额外创建新记忆。

## 阶段 1：审查用户画像

先读取规范文件，了解 profile.md 的写作要求：

```
/Users/jay/Documents/GitHub/Proma_Proactive/components/profile-rules.md
```

再读取 `~/.proma/memory/profile.md`，对照规范逐项检查，发现不符合要求的内容用 Edit 工具直接修改。

## 阶段 2：审查纠正与偏好记录

先读取规范文件，了解 corrections 的写作要求和字段规范：

```
/Users/jay/Documents/GitHub/Proma_Proactive/components/corrections-extract.md
```

再读取当前记录：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
cat ~/.proma/memory/corrections/active.json
```

对照规范逐条检查，发现格式错误或内容不符合要求的条目：

```bash
npx tsx src/scripts/memory-ops.ts correction:edit --id <id> --summary "<s>" --detail "<d>" --type "<t>" --target "<tgt>"
npx tsx src/scripts/memory-ops.ts correction:delete --id <id>
```

## 阶段 3：审查 SOP 候选

先读取规范文件，了解 SOP 的提炼标准和字段要求：

```
/Users/jay/Documents/GitHub/Proma_Proactive/components/sop-update.md
```

再列出当前所有 SOP：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/memory-ops.ts sop:list
```

对照规范逐条检查，发现问题时：

```bash
# 修改标题或内容
npx tsx src/scripts/memory-ops.ts sop:update --id <id> --title "<新标题>" --content "<新内容>"

# 删除不合格的 SOP
npx tsx src/scripts/memory-ops.ts sop:delete --id <id>
```

## 阶段 4：审查日记

先读取规范文件，了解 diary 的写作要求：

```
/Users/jay/Documents/GitHub/Proma_Proactive/components/diary-write.md
```

再读取最新的 `~/.proma/memory/diary/YYYY-MM-DD.md`，对照规范检查，发现问题时用 Edit 工具直接修改对应文件。

## 阶段 5：审查变更日志

先读取规范文件，了解 memory_log 的写作要求：

```
/Users/jay/Documents/GitHub/Proma_Proactive/components/memory-log-write.md
```

读取最新的 `~/.proma/memory/memory_log/YYYY-MM-DD.md`，对照规范检查。若本次审查对记忆内容有修正，在日志文件末尾**追加**一条记录，说明审查发现的问题及修改内容；若无任何修正，不修改日志。

---

## 审查完成

所有类型记忆审查完毕。在回复中输出一段审查报告（不要写入任何文件）：
- 各类记忆的审查结论（通过 / 发现 N 处问题已修正）
- 若有删除操作，列出删除条目的 ID 和原因

然后输出：
✅ MEMORY_REVIEW_COMPLETE
