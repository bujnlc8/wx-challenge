const DAY_MS = 24 * 60 * 60 * 1000;
function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("答题记录日期异常");
  const result = Date.parse(value + "T00:00:00Z");
  if (
    !Number.isFinite(result) ||
    new Date(result).toISOString().slice(0, 10) !== value
  )
    throw new Error("答题记录日期异常");
  return result;
}
function activityLevel(count) {
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error("答题记录数量异常");
  return count === 0 ? 0 : count < 5 ? 1 : count < 10 ? 2 : count < 20 ? 3 : 4;
}
function buildActivityCalendar(input) {
  const start = dateValue(input.start_date);
  const end = dateValue(input.end_date);
  const span = Math.round((end - start) / DAY_MS) + 1;
  if (span < 1 || span > 366) throw new Error("答题记录范围异常");
  const history = input.history_start_date || input.start_date;
  dateValue(history);
  const counts = new Map();
  for (const day of input.days || []) {
    dateValue(day.date);
    activityLevel(day.count);
    if (counts.has(day.date)) throw new Error("答题记录日期重复");
    counts.set(day.date, day.count);
  }
  const offset = (new Date(start).getUTCDay() + 6) % 7;
  const first = start - offset * DAY_MS;
  const weeks = [];
  const months = [];
  let total = 0,
    active = 0;
  for (let index = 0; index < Math.ceil((span + offset) / 7); index++) {
    const days = [];
    for (let row = 0; row < 7; row++) {
      const current = first + (index * 7 + row) * DAY_MS;
      const date = new Date(current).toISOString().slice(0, 10);
      const inRange = current >= start && current <= end;
      const tracked = inRange && date >= history;
      const count = tracked ? counts.get(date) || 0 : 0;
      if (tracked) {
        total += count;
        if (count > 0) active++;
      }
      days.push({
        date,
        count,
        in_range: inRange,
        tracked,
        level: activityLevel(count),
        today: date === input.end_date,
      });
    }
    const tick =
      days.find((day) => day.in_range && day.date.slice(8) === "01") ||
      (index === 0 ? days.find((day) => day.in_range) : null);
    if (tick)
      months.push({
        label: Number(tick.date.slice(5, 7)) + "月",
        left: index * 13,
      });
    weeks.push({ key: String(index), days });
  }
  const today = weeks.flatMap((week) => week.days).find((day) => day.today);
  return {
    start_date: input.start_date,
    end_date: input.end_date,
    history_start_date: history,
    weeks,
    months,
    width: weeks.length * 13,
    total_count: total,
    active_days: active,
    today,
  };
}
export { activityLevel, buildActivityCalendar };
