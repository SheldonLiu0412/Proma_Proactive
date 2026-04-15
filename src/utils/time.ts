/**
 * 获取指定时区相对 UTC 的偏移毫秒数（UTC + offsetMs = 本地时间）。
 * 通过构造一个已知 UTC 时间点，再用 Intl 读出它在目标时区的各字段，
 * 反推偏移量，避免依赖运行时系统时区。
 */
function getTimezoneOffsetMs(timezone: string, referenceDate: Date): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(referenceDate);
  const v = new Map(parts.map((p) => [p.type, p.value]));
  // 重建"本地时间"的 UTC 解释（用 Date.UTC 避免本地时区干扰）
  const localAsUtc = Date.UTC(
    parseInt(v.get("year")!, 10),
    parseInt(v.get("month")!, 10) - 1,
    parseInt(v.get("day")!, 10),
    parseInt(v.get("hour")!, 10),
    parseInt(v.get("minute")!, 10),
    parseInt(v.get("second")!, 10)
  );
  // 偏移 = 本地时间 - UTC
  return localAsUtc - referenceDate.getTime();
}

/**
 * 获取指定日期的起止时间戳（毫秒），默认今天，时区 Asia/Shanghai。
 * start / end 都是 UTC 毫秒，对应目标时区该日期的 00:00:00.000 ~ 23:59:59.999。
 */
export function getDayRange(
  dateStr?: string,
  timezone = "Asia/Shanghai"
): { start: number; end: number; dateStr: string } {
  const now = new Date();

  // 获取目标日期字符串（YYYY-MM-DD），以指定时区为准
  let targetDate: string;
  if (dateStr) {
    targetDate = dateStr;
  } else {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = new Map(parts.map((p) => [p.type, p.value]));
    targetDate = `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
  }

  // 将 "YYYY-MM-DD" 解析为 UTC midnight（用 Date.UTC，避免本地时区解析歧义）
  const [y, mo, d] = targetDate.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, mo - 1, d));

  // 计算目标时区在该时刻的偏移，得到该时区 00:00:00 对应的 UTC 时间戳
  const offsetMs = getTimezoneOffsetMs(timezone, utcMidnight);
  const start = utcMidnight.getTime() - offsetMs;
  const end = start + 24 * 60 * 60 * 1000 - 1;

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
