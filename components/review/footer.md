## 审查变更日志

先读取规范文件，了解 memory_log 的写作要求：

```
/Users/jay/Documents/GitHub/Proma_Proactive/components/write-memory-log.md
```

读取最新的 `~/.proma/memory/memory_log/YYYY-MM-DD.md`，对照规范检查。若本次审查对记忆内容有修正，在日志文件末尾**追加**一条记录，说明审查发现的问题及修改内容；若无任何修正，不修改日志。

---

## 审查完成

所有类型记忆审查完毕。在回复中输出一段审查报告（不要写入任何文件）：
- 各类记忆的审查结论（通过 / 发现 N 处问题已修正）
- 若有删除操作，列出删除条目的 ID 和原因

然后输出：
✅ MEMORY_REVIEW_COMPLETE
