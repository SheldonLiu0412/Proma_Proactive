## 验证与收尾

所有批次任务完成后：

本次初始化产出的记忆统一存储在 `~/.proma/memory/` 下。

### 部署记忆目录索引

```bash
cp /Users/jay/Documents/GitHub/Proma_Proactive/docs/memory-readme.md ~/.proma/memory/README.md
```

### 自审查

创建 SubAgent，提供以下 prompt：

```
此前已从用户全量历史会话中构建初始记忆，所有产物位于 `~/.proma/memory/` 下；

请执行 memory-init-review 流程，对本次初始化生成的所有记忆文件进行审查和修正。

审查规范参考：/Users/jay/Documents/GitHub/Proma_Proactive/skills/memory-init-review/SKILL.md

任务结束以后简要文字汇报即可（不需要额外创建汇报文档），并输出：✅ MEMORY_REVIEW_COMPLETE
```

### 记忆初始化完成
确认全部阶段任务已完成，向用户输出标志：✅ MEMORY_INIT_COMPLETE

