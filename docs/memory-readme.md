# Memory 文件夹说明

> 本文件说明各目录/文件的用途，供 Agent 检索时定位文件使用。
> **除非用户明确要求，不允许自行修改本文件及 memory 文件夹的结构。**

## 文件结构

| 路径 | 说明 |
|------|------|
| `profile.md` | 用户画像。描述用户的能力、风格、习惯等，以 Proma 第一人称视角书写 |
| `corrections/active.json` | 当前有效的纠正与偏好记录（agent-behavior / skill-update / user-preference 三类） |
| `corrections/archive/` | 已归档的历史纠正记录 |
| `sop-candidates/index.json` | SOP 候选索引，记录所有 SOP 条目的元数据 |
| `sop-candidates/*.md` | 各 SOP 候选的详细步骤内容 |
| `memory_log/` | 每日记忆变更日志，文件名格式 `YYYY-MM-DD.md` |
| `diary/` | Proma 每日散文日记，文件名格式 `YYYY-MM-DD.md` |
| `state.json` | 运行状态文件，记录已处理的会话 ID，由脚本维护 |

> 首次创建 `profile.md` 的模板位于仓库 `{{PROJECT_ROOT}}/docs/profile-template.md`，运行时直读，不在本目录内。

## 工作指南

记忆系统的完整规范请参考：
`{{PROJECT_ROOT}}/docs/memory-agent-guide.md`
