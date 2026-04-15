## 验证与收尾

所有批次任务完成后：

### 验证记忆完整性

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/memory-ops.ts pref:list
npx tsx src/scripts/memory-ops.ts sop:list
npx tsx src/scripts/memory-ops.ts state:show
```

读取 `~/.proma/memory/profile.md`，检查确认内容合理且符合要求。

### 输出初始化报告

- 总处理会话数
- 最终记忆状态：画像摘要、偏好数量和列表、SOP 数量和列表等（不一定是这些，按照任务需求来）
- 耗时和批次数

### 输出完成标志

```
✅ MEMORY_INIT_COMPLETE
```
