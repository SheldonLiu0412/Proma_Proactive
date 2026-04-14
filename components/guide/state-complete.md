## 5. 标记完成

每批处理完毕后，将本批所有会话 ID 标记为已处理：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/memory-ops.ts state:complete \
  --sessions '["session-id-1","session-id-2","session-id-3"]'
```
