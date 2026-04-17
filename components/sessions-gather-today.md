## 收集今日活跃会话

**目标**：找到今天需要处理的会话，生成可读摘要，并计算分批方案。

任务开始后的第一步必须直接执行本组件中的收集脚本；在脚本产物生成之前，禁止额外检查工作区、cwd 或 `~/.proma/` 下的原始会话数据。

### 一步完成收集、摘要提取与分批计算

```bash
cd {{PROJECT_ROOT}}
npx tsx src/scripts/gather-sessions.ts \
  --output /tmp/memory-gather.json \
  --with-digests /tmp/memory-daily-digests \
  --plan-batches /tmp/memory-daily-batches.json
```

终端输出会依次汇报：
1. 新会话数 + 增量会话数
2. 摘要提取结果（成功/失败数）
3. 分批概况：`NeedsBatching: true/false`、总批次数、每批会话数

- **`NeedsBatching: false`**：直接读取所有摘要文件进入下一阶段（无需 SubAgent）
- **`NeedsBatching: true`**：用 Read 工具读取 `{{PROJECT_ROOT}}/components/daily-batch-analysis.md`，按其中的指引通过 SubAgent 分批处理。所有批次完成后，主 Agent 继续执行后续阶段。
