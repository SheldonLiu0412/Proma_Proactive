## 验证与收尾

所有批次任务完成后：

### 自审查

创建 SubAgent，提供以下 prompt：

```
请执行 memory-init-review 流程，对本次初始化生成的所有记忆文件进行审查和修正。

任务描述：从用户全量历史会话中构建初始记忆，生成了 profile.md、corrections、SOP 候选、memory_log、diary。

审查规范参考：/Users/jay/Documents/GitHub/Proma_Proactive/skills/memory-init-review/SKILL.md
```

等待 SubAgent 输出 `✅ MEMORY_REVIEW_COMPLETE`。

### 输出完成标志

```
✅ MEMORY_INIT_COMPLETE
```
