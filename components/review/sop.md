## 审查 SOP 候选

先用 Read 工具读取规范文件，了解 SOP 的提炼标准和字段要求：

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
