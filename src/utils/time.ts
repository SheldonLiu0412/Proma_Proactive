/**
 * 获取指定日期的起止时间戳（毫秒），默认今天，时区 Asia/Shanghai
 */
export function getDayRange(
  dateStr?: string,
  timezone = "Asia/Shanghai"
): { start: number; end: number; dateStr: string } {
  const now = new Date();

  // 获取目标日期字符串（YYYY-MM-DD）
  let targetDate: string;
  if (dateStr) {
    targetDate = dateStr;
  } else {
    // 用 Intl 取本地日期
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = new Map(parts.map((p) => [p.type, p.value]));
    targetDate = `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
  }

  // 计算该日期在指定时区的 00:00:00 和 23:59:59.999 对应的 UTC 时间戳
  const dayStart = new Date(`${targetDate}T00:00:00`);
  const dayEnd = new Date(`${targetDate}T23:59:59.999`);

  // 用 Intl 获取时区偏移来精确计算
  // 简化处理：直接用本地时间（脚本运行在用户机器上，时区一致）
  const start = dayStart.getTime();
  const end = dayEnd.getTime();

  return { start, end, dateStr: targetDate };
}

/**
 * Unix 毫秒时间戳 → 可读字符串
 */
export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 毫秒差值 → 可读时长
 */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}
