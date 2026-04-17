# Proma Memory

> Proma 的长期记忆与主动智能系统插件 — 帮助 Proma 更好地"看见"你，成为更懂你的 Agent 助手

## 这是什么

Proma Memory 是为 [Proma](https://github.com/ErlichLiu/Proma) 桌面 AI 助手提供的长期记忆与主动智能系统插件。它的核心理念是：**更敏锐地看到用户，更主动地帮助用户。**

AI 助手不该只是被动地等待指令。Memory 通过持续观察用户的日常对话，逐步理解用户是谁、在做什么、怎样工作；然后在合适的时机，主动提供更贴合的帮助。这些记忆不是冷冰冰的数据库条目，而是一套有温度的、持续演化的认知模型。

## 当前状态

🚧 **原型阶段** — 该插件当前仅为 Demo 阶段，还有非常多的功能未做，也还没经过足够的测试，以帮助其效果迭代和演化；暂时的计划是在后续跟随 Proma 插件系统一起上线，当前仅能够通过独立的工作区 + Skill 运行体验。

## 接入方式

这个仓库支持作为外置插件接入其他用户的 Proma 环境，与 Proma 项目环境完全隔离，装载和卸载无任何影响。

### 第一步：在任意 Proma Agent 模式工作区发送以下 prompt

把下面这段 prompt **完整复制**，在 Proma Agent 模式的任意工作区新建会话后发送给 Agent：

```
任务：帮我接入 Proma Memory 插件。

步骤如下，请依次执行：
1. 把仓库 clone 到本地合适的位置：
   git clone https://github.com/SheldonLiu0412/Proma_Proactive.git
2. 进入项目目录，检查依赖：
   cd Proma_Proactive
   node --version && npx tsx --version
   如果 tsx 不可用，执行 npm install
3. 构建所有 skills：
   node build.mjs
4. 把 memory-setup skill 复制到当前工作区的 skills 目录（你需要先告诉我当前工作区的 slug，或者帮我查一下）：
   mkdir -p ~/.proma/agent-workspaces/<当前工作区slug>/skills/memory-setup
   cp skills/memory-setup/SKILL.md ~/.proma/agent-workspaces/<当前工作区slug>/skills/memory-setup/SKILL.md
5. 完成后告诉我，询问是否开始 memory-setup 流程。
```

> Agent 会自动完成 clone、构建、复制，并在需要时询问你工作区名称。

### 第二步：发送 `memory-setup` 开始正式配置

上一步完成后，确认 memory-setup Skill已正常装载，可以在**同一个会话**里发送：

```
memory-setup
```

Agent 会引导你绑定专属 Memory 工作区，完成后会告知后续如何初始化和使用。

### 已实现

**Memory Init（全量初始化）** — 首次引入 Memory 时，从用户全部历史会话中构建初始记忆：

- 批量收集历史会话，按时间顺序分批处理，支持全量重建
- 通过 SubAgent 协作完成大规模会话分析

**Memory Init Review（初始化自审查）** — Init 完成后自动触发，对生成的记忆文件进行质量审查与修正：

- 逐类检查画像、纠偏、SOP、日记、变更日志的格式与内容
- 发现问题直接修正，输出审查报告

**Memory Daily（每日记忆整合）** — 每天运行一次，从当日对话中提取长期记忆：

- **用户画像** — 以 Proma 视角书写的人物认知，wiki 式分级结构（`profile.md`）
- **行为纠偏** — 从用户对 Agent 的纠正中提炼可复用的行为改进（`corrections/`）
- **SOP 候选** — 从重复性工作中提炼的流程模板（`sop-candidates/`）
- **变更日志** — 结构化的每日记忆变更记录（`memory_log/`）
- **日记** — Proma 第一人称视角的散文日记（`diary/`）

工作流分阶段执行：**收集**（Gather）→ **分析**（Analyze）→ **整合**（Consolidate），通过 TypeScript 工具脚本 + Proma Agent Skill 协作完成。

## 规划中的能力

| 模块 | 说明 | 状态 |
|------|------|------|
| 每日 Memory 汇报 | 向用户推送今日记忆变更摘要，支持确认/修正 | 📋 规划中 |
| 纠偏 → Skill 更新 | corrections 中通过的条目自动触发 Skill 内容更新任务 | 📋 规划中 |
| 周回顾与校正 | 每周回顾记忆质量，清理过时条目，校正偏差 | 📋 规划中 |
| SOP → Skill 自动转化 | 当 SOP 候选被多次验证后，自动生成可执行的 Skill | 📋 规划中 |
| 主动记忆装载 | 在日常对话中智能装载相关记忆，让助手的回应自然地体现"认识你" | 📋 规划中 |
| 可自定义的记忆维度 | 用户可选择哪些记忆维度参与当前对话 | 📋 规划中 |

## 项目结构

```
components/              # 可复用 Skill 组件（markdown 片段）
├── head.md              # 通用头部
├── sessions-gather-today.md  # 收集今日会话
├── sessions-gather-all.md    # 收集全量历史会话
├── memory-load.md            # 加载当前记忆
├── sessions-analyze.md       # 分析会话
├── corrections-extract.md    # 提取行为纠偏
├── sop-update.md             # 更新 SOP 候选
├── memory-log-write.md       # 写入变更日志
├── diary-write.md            # 写入散文日记
├── memory-bootstrap.md       # 初始化/重建记忆目录
├── profile-create.md    # 首次创建画像
├── profile-update.md    # 增量更新画像
├── profile-rules.md     # 画像统一写作规范
├── dream.md             # 生成梦境（保留原名）
├── init-batch-analysis.md    # 批量分析（init 用）
├── daily-complete.md         # Daily 结束标志
├── init-complete.md          # Init 结束标志
├── guide/               # 指南专用组件
│   ├── head.md
│   ├── principles.md
│   └── state-complete.md
└── review/              # Init Review 专用组件
    ├── head.md
    ├── profile.md
    ├── corrections.md
    ├── sop.md
    ├── diary.md
    ├── memory-log.md
    └── footer.md

skill-configs/           # Skill 组装配置（JSON）
├── memory-setup.json
├── memory-daily.json
├── memory-init.json
├── memory-init-review.json
└── memory-agent-guide.json

config/
├── memory-instance.template.json  # 实例配置模板
└── memory-instance.local.json     # 本机实例配置（git ignore）

skills/                  # 组装输出目录
├── memory-setup/
│   └── SKILL.md
├── memory-daily/
│   └── SKILL.md
├── memory-init/
│   └── SKILL.md
└── memory-init-review/
    └── SKILL.md

docs/
└── memory-agent-guide.md   # SubAgent 完整工作规范

src/
├── scripts/
│   ├── gather-sessions.ts        # 收集今日活跃会话
│   ├── gather-all-sessions.ts    # 收集全量历史会话（初始化用）
│   ├── extract-session-digest.ts # 提取会话摘要
│   ├── plan-batches.ts           # 计算 init 分批方案
│   ├── list-skills.ts            # 列出当前全部 Skill
│   ├── memory-bootstrap.ts       # 初始化/重建记忆目录
│   └── memory-ops.ts             # 记忆存储 CRUD 操作
├── utils/
│   ├── paths.ts                  # 路径常量
│   └── time.ts                   # 时间工具
└── memory-runner.mjs             # 启动脚本（实验性）

build.mjs                # Skill 组装脚本
```

### 运行时数据（存储在项目根目录的 `./.memory/`）

```
./.memory/
├── profile.md                  # 用户画像
├── README.md                   # Memory 文件夹索引说明
├── profile-template.md         # 用户画像初始化模版（运行时副本）
├── corrections/
│   ├── active.json             # 待处理的行为纠偏建议
│   └── archive.jsonl           # 已处理的历史记录
├── sop-candidates/
│   ├── index.json              # SOP 索引
│   └── *.md                    # 各 SOP 详情
├── memory_log/
│   └── YYYY-MM-DD.md           # 每日变更日志
├── diary/
│   └── YYYY-MM-DD.md           # 每日散文日记
├── dreams/
│   ├── residues.json           # 滚动累积的潜意识残留池
│   └── YYYY-MM-DD.md           # 每日梦境（含分镜）
└── state.json                  # 运行状态与增量检测
```

## 组件化构建

Skills 通过 `build.mjs` 从组件文件组装生成：

```bash
node build.mjs              # 构建所有 Skill
node build.mjs memory-daily # 只构建指定配置
```

每个 JSON 配置声明组件列表，`build.mjs` 按顺序拼接 markdown 文件并自动编号阶段（`numbered: true` 时）。

## 技术依赖

- **运行环境**: [Proma](https://github.com/ErlichLiu/Proma) 桌面应用（Electron）
- **Agent 引擎**: `@anthropic-ai/claude-agent-sdk`
- **脚本执行**: `npx tsx`（TypeScript 直接运行）
- **数据源**: Proma 的会话存储（`agent-sessions.json` / `conversations.json` + JSONL 日志）

## 许可

ISC
