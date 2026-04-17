## 初始化记忆目录

本步骤仅用于**全量初始化 / 全量重建**。

在加载或写入任何记忆之前，先显式初始化运行时目录与基础文件：

```bash
cd /Users/jay/Documents/GitHub/Proma_Proactive
npx tsx src/scripts/memory-bootstrap.ts --wipe
```

- 这一步负责重建 `~/.proma/memory/` 的目录结构与基础文件
- 会同步部署运行时副本：`README.md`、`profile-template.md`
- `--wipe` 表示先清空旧记忆再从零开始，避免沿用旧的 `state`、SOP、corrections 等残留
