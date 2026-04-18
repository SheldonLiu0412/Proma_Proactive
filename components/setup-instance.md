## 执行安装

根据第二步的结果，分两条路径：

---

### 路径 A：配置文件已存在（无需用户操作）

直接用已有配置重新构建 skills 并同步，agent 自行完成，不需要询问用户：

```bash
cd {{PROJECT_ROOT}}
npx tsx src/scripts/install-memory-instance.ts --workspace "<已有工作区名称>"
```

安装脚本会自动用已有配置重建，跳过所有需要用户确认的步骤。

---

### 路径 B：配置文件不存在（需要用户确认工作区）

1. 列出当前 Proma 工作区：

```bash
cd {{PROJECT_ROOT}}
npx tsx src/scripts/install-memory-instance.ts --list-workspaces
```

2. 根据用户刚才创建的工作区名称，执行安装：

```bash
cd {{PROJECT_ROOT}}
npx tsx src/scripts/install-memory-instance.ts --workspace "<用户刚才创建的工作区名称>"
```

3. 安装脚本会自动完成：写入配置 → 重建所有 skills → 同步到目标工作区（无需你手动再做）
