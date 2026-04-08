# Proma Dream

> Proma 的长期记忆与主动智能系统 — 让 AI 助手真正"认识"你

## 这是什么

Dream 是 [Proma](https://github.com/ErlichLiu/Proma) 桌面 AI 助手的前瞻性子系统。它的核心理念是：**AI 助手不应该每次对话都从零开始**。

Dream 通过分析用户的日常对话，逐步构建起对用户的长期理解——工作习惯、技术偏好、重复性工作流程、甚至协作风格。这些记忆不是冷冰冰的数据库条目，而是一套有温度的、持续演化的认知模型。

## 当前状态

🚧 **原型阶段** — 尚未集成进 Proma 产品，作为独立的工作区 + Skill 运行。

### 已实现：每日 Dream（记忆整合）

每天运行一次，从当日所有对话中提取长期记忆：

- **用户画像** — 以观察者视角书写的人物认知（`profile.md`）
- **偏好与习惯** — 二级分类的行为模式记录（`preferences/`）
- **SOP 候选** — 从重复性工作中提炼的流程模板（`sop-candidates/`）
- **变更日志** — 结构化的每日记忆变更记录（`dream_log/`）
- **日记** — Proma 第一人称视角的散文日记（`diary/`）

工作流分三阶段执行：**收集**（Gather）→ **洞察**（Insight）→ **整合**（Consolidate），通过 TypeScript 工具脚本 + Proma Agent Skill 协作完成。

## 规划中的能力

| 模块 | 说明 | 状态 |
|------|------|------|
| 每日 Dream 汇报 | 向用户推送今日记忆变更摘要，支持确认/修正 | 📋 规划中 |
| 周回顾与校正 | 每周回顾记忆质量，清理过时条目，校正偏差 | 📋 规划中 |
| SOP → Skill 自动转化 | 当 SOP 候选被多次验证后，自动生成可执行的 Skill | 📋 规划中 |
| 基于记忆的深度对话 | 在日常对话中按需装载相关记忆，实现"认识你"的交互体验 | 📋 规划中 |
| 可自定义的记忆装载 | 用户可选择哪些记忆维度参与当前对话 | 📋 规划中 |

## 项目结构

```
src/
├── scripts/
│   ├── gather-sessions.ts      # 收集今日活跃会话
│   ├── extract-session-digest.ts  # 提取会话摘要
│   └── memory-ops.ts           # 记忆存储 CRUD 操作
├── utils/
│   ├── paths.ts                # 路径常量
│   └── time.ts                 # 时间工具
└── dream-runner.mjs            # 启动脚本（实验性）

skills/
└── dream-daily/
    └── SKILL.md                # 每日 Dream 工作流 Skill 定义
```

### 运行时数据（存储在 `~/.proma/dream/`）

```
~/.proma/dream/
├── profile.md                  # 用户画像
├── preferences/
│   ├── active.json             # 当前生效的偏好
│   └── archive.jsonl           # 偏好变更历史
├── sop-candidates/
│   ├── index.json              # SOP 索引
│   └── *.md                    # 各 SOP 详情
├── dream_log/
│   └── YYYY-MM-DD.md           # 每日变更日志
├── diary/
│   └── YYYY-MM-DD.md           # 每日散文日记
└── state.json                  # 运行状态与增量检测
```

## 技术依赖

- **运行环境**: [Proma](https://github.com/ErlichLiu/Proma) 桌面应用（Electron）
- **Agent 引擎**: `@anthropic-ai/claude-agent-sdk`
- **脚本执行**: `npx tsx`（TypeScript 直接运行）
- **数据源**: Proma 的会话存储（`agent-sessions.json` / `conversations.json` + JSONL 日志）

## 许可

ISC
