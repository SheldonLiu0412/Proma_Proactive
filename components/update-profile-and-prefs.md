## 更新用户画像和偏好

**目标**：将洞察结果写入记忆存储。

### 更新用户画像

直接用 Read + Edit 工具操作 `~/.proma/memory/profile.md`，局部修改即可。

**画像写作规范**：
- 视角：以 Proma（"我"）的口吻，第三人称（"TA"）书写（得知用户昵称后用昵称）
- 结构：用编号标题（`1` `1.1` `1.1.1`）做内容分级，**基本信息和行为模式放最上面**
- 风格：像人物期刊——温暖、有情感色彩、鲜活。**从事件中读人，而非记事件**
- 最后章节：固定为"Agent 需知"——记录操作性知识（环境事实、项目约定、工具特性）
  - 这部分切记只记录对用户长期有用、完全可信（得到用户明确认可的信息），不要做任何自以为是的推测或是盲目添加

- **不堆叠增加**：更新前必须先判断新信息是否已被现有内容覆盖或可合并。**默认不加**——只有当信息明显缺失且长期有价值时才写入
- **不留元信息**：画像正文中不出现"由 Dream 生成"、"最后更新于"等系统信息

### 更新偏好

使用 `memory-ops.ts` 执行偏好操作：

```bash
# 新增偏好（四个内容字段全部必填）
npx tsx src/scripts/memory-ops.ts pref:add --category <coding|design|general> --subcategory <git|workflow|ui|code-change|interaction> --summary "<一句话核心观察>" --detail "<具体行为证据>" --source <sessionId>

# 修改偏好
npx tsx src/scripts/memory-ops.ts pref:edit --id <id> --summary "<s>" --detail "<d>" --reason "<r>" --source <sessionId>

# 删除偏好
npx tsx src/scripts/memory-ops.ts pref:delete --id <id> --reason "<r>"

# 标记加强（偏好被再次验证）
npx tsx src/scripts/memory-ops.ts pref:touch --id <id> --source <sessionId>
```

**偏好质量标准**：
- **宁缺毋滥**：需多次出现或用户明确表达；单次行为不记录
- **通用化**：偏好描述应跨场景可复用，不要绑定具体项目/任务
- **场景准确**：category/subcategory 要真实反映使用场景
- **字段完整**：pref:add 的四个内容字段全部必填，任何字段为空都不应提交
