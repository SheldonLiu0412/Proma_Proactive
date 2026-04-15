## 审查纠正与偏好记录

先读取规范文件，了解 corrections 的写作要求和字段规范：

```
/Users/jay/Documents/GitHub/Proma_Proactive/components/extract-corrections.md
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
