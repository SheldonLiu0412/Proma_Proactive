## Windows 环境检查与执行约定

当前 Skill 在 Windows 环境中构建，后续所有命令都按 Windows 方式执行。

- 在 Proma 的 Windows 环境下，优先使用 Git Bash 或 WSL，不要假设纯 PowerShell 能完整覆盖 Agent 运行需求
- 仍然先 `cd {{PROJECT_ROOT}}`，再执行后续 `npx tsx src/scripts/...` 命令
- 临时文件不要写到 `/tmp/...`，统一改放到项目内 `.tmp/` 目录，例如：
  - `{{PROJECT_ROOT}}/.tmp/memory-gather.json`
  - `{{PROJECT_ROOT}}/.tmp/memory-daily-digests`
  - `{{PROJECT_ROOT}}/.tmp/memory-init-batches.json`
- 如果示例里出现 `$HOME/.proma/...`、`~/.proma/...`，在 Windows 中按用户主目录下的 Proma 配置目录理解；Proma 开发环境也可能使用 `.proma-dev`
- 如果某条旧示例命令包含 Unix 专属写法，以 Windows 等价操作为准，必要时拆成多步执行
