## 7. 通用原则

1. **宁缺毋滥**：质量优于数量。宁可少记一条偏好，也不要记一条低质量的
2. **引用来源**：所有记忆操作（pref:add/edit/touch、sop:create/update）都必须附带 `--source`（会话 ID）
3. **时序优先**：早期会话的信息可能已过时，晚期会话更可信。冲突时以晚期为准
4. **错误容忍**：单个操作失败不中断整个流程，记录错误后继续处理下一个
5. **脚本工作目录**：所有 `npx tsx src/scripts/...` 命令需要在 `/Users/jay/Documents/GitHub/Proma_Proactive` 下执行
6. **用 Read 工具读文件**：不要用 `cat | python3` 等 Bash 命令解析 JSON/Markdown，直接用 Read 工具
