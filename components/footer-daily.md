## 完成标志

**当所有步骤全部完成后，你必须在最终回复中输出以下标志：**

```
✅ DREAM_COMPLETE
```

如果某个阶段没有需要处理的内容（例如今天没有活跃会话），跳过后续阶段，写好 dream_log 和 diary 后直接输出完成标志。

## 标记会话完成

使用 memory-ops.ts 标记所有处理过的会话：

```bash
npx tsx src/scripts/memory-ops.ts state:complete --sessions '["session-id-1","session-id-2"]'
```
