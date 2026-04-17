## 识别并写入实例配置

1. 检查 `{{PROJECT_ROOT}}/config/memory-instance.local.json` 是否已存在。
2. 如果已存在：
   - 读取其中的 `memoryWorkspace.id / slug / name`
   - 对照刚才列出的 Proma 工作区，确认该工作区仍存在
   - 若仍存在，直接重新执行安装脚本以刷新构建和同步
3. 如果不存在：
   - 优先选择用户明确指定的专用 Memory 工作区
   - 若用户未指定，但列表里只有一个明显用于 Memory 的专用工作区，可直接使用
   - 若未找到合适工作区，要求用户先去 Proma 手动创建，然后等待用户回复
   - 若候选不唯一，先向用户确认，不要擅自选择

安装命令：

```bash
cd {{PROJECT_ROOT}}
npx tsx src/scripts/install-memory-instance.ts --workspace "<工作区 slug、id 或名称>"
```

安装脚本会自动完成这些动作：
- 写入本地实例配置
- 重建所有 skills
- 同步 skills 到目标工作区

安装完成后，告诉用户：
- 当前绑定的 Memory 工作区名称、slug、id
- 本地配置文件路径
- 后续可直接在对话中说“帮我初始化”来运行 `memory-init`
