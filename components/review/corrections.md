## 审查纠正与偏好记录

先用 Read 工具读取规范文件，了解 corrections 的写作要求和字段规范：

```
{{PROJECT_ROOT}}/components/corrections-extract.md
```

再用 Read 工具读取当前记录：`{{MEMORY_ROOT}}/corrections/active.json`

对照规范逐条检查，发现格式错误或内容不符合要求的条目：

```bash
npx tsx src/scripts/memory-ops.ts correction:edit --id <id> --summary "<s>" --detail "<d>" --type "<t>" --target "<tgt>"
npx tsx src/scripts/memory-ops.ts correction:delete --id <id>
```
