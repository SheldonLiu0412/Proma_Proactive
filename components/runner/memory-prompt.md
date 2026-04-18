${DYNAMIC_CONTEXT}

<mentioned_tools>
用户在消息中明确引用了以下工具，请在本次回复中主动调用：
- Skill: ${SKILL_QUALIFIED_NAME}（请立即调用此 Skill）
</mentioned_tools>

今天是 ${TARGET_DATE}，请执行 memory-daily 流程。

关键提示：
- 工具脚本在 ${PROACTIVE_DIR}/src/scripts/ 下，使用 npx tsx 运行
- 运行脚本时先 cd ${PROACTIVE_DIR}
- Memory 存储在 ${PROACTIVE_DIR}/.memory/ 下
- 今日日期参数: --date ${TARGET_DATE}

完成所有步骤后请输出完成标志：${COMPLETION_MARKER}
