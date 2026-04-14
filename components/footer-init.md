## 验证与收尾

所有批次完成后：

### 验证记忆完整性

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/memory-ops.ts pref:list
npx tsx src/scripts/memory-ops.ts sop:list
npx tsx src/scripts/memory-ops.ts state:show
```

读取 `~/.proma/dream/profile.md`，确认内容合理。

### 输出初始化报告

- 总处理会话数
- 最终记忆状态：画像摘要、偏好数量和列表、SOP 数量和列表
- 耗时和批次数

### 输出完成标志

```
✅ DREAM_INIT_COMPLETE
```
