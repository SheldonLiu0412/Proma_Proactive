## 验证与收尾

所有批次任务完成后：

本次初始化产出的记忆统一存储在 `{{MEMORY_ROOT}}/` 下。

### 自审查

创建 SubAgent，提供以下 prompt：

```
此前已从用户全量历史会话中构建初始记忆，所有产物位于 `{{MEMORY_ROOT}}/` 下；

请执行 memory-init-review 流程，对本次初始化生成的所有记忆文件进行审查和修正。

审查规范参考：{{PROJECT_ROOT}}/skills/memory-init-review/SKILL.md

任务结束以后简要文字汇报即可（不需要额外创建汇报文档），并输出：✅ MEMORY_REVIEW_COMPLETE
```

### 记忆初始化完成
确认全部阶段任务已完成，向用户输出标志：✅ MEMORY_INIT_COMPLETE
提醒用户初始化流程已完毕，可以在设置-配置中关闭 memory-init 和 memory-init-review skill，若希望重新初始化记忆，可以打开并重新执行
