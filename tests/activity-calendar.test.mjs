import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function api() {
  const s = fs
    .readFileSync(
      new URL("../utils/activity-calendar.js", import.meta.url),
      "utf8",
    )
    .replace(/export\s*\{[\s\S]*?\};?/g, "");
  const c = vm.createContext({ Date, Math, Map, Number, Error });
  vm.runInContext(s + "\nthis.api={buildActivityCalendar,activityLevel};", c);
  return c.api;
}
test("answer volume maps monotonically into five contribution shades", () => {
  const { activityLevel: f } = api();
  assert.deepEqual(
    [0, 1, 4, 5, 9, 10, 19, 20, 300].map(f),
    [0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
});
test("calendar aligns Monday through Sunday and fills real missing days with zero", () => {
  const r = api().buildActivityCalendar({
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    history_start_date: "2026-10-26",
    days: [
      { date: "2026-10-27", count: 2 },
      { date: "2026-11-01", count: 10 },
    ],
  });
  assert.equal(r.weeks.length, 1);
  assert.equal(r.weeks[0].days[0].date, "2026-10-26");
  assert.equal(r.weeks[0].days[6].date, "2026-11-01");
  assert.equal(r.total_count, 12);
  assert.equal(r.active_days, 2);
  assert.equal(r.weeks[0].days[0].count, 0);
});
test("partial weeks have non-clickable padding and no made-up contributions", () => {
  const r = api().buildActivityCalendar({
    start_date: "2026-11-01",
    end_date: "2026-11-03",
    days: [],
  });
  const cells = r.weeks.flatMap((w) => w.days);
  assert.equal(r.weeks.length, 2);
  assert.equal(cells.filter((d) => d.in_range).length, 3);
  assert.equal(cells.filter((d) => !d.in_range).length, 11);
  assert.equal(r.total_count, 0);
});
test("dates before the tracking epoch are marked unknown rather than empty recorded days", () => {
  const r = api().buildActivityCalendar({
    start_date: "2026-10-30",
    end_date: "2026-11-02",
    history_start_date: "2026-11-01",
    days: [{ date: "2026-11-01", count: 1 }],
  });
  const cells = r.weeks.flatMap((w) => w.days);
  assert.equal(cells.find((d) => d.date === "2026-10-31").tracked, false);
  assert.equal(cells.find((d) => d.date === "2026-11-01").tracked, true);
  assert.equal(r.total_count, 1);
});
test("bad ranges and counts cannot silently become a misleading activity graph", () => {
  const f = api().buildActivityCalendar;
  for (const input of [
    { start_date: "2026-02-31", end_date: "2026-03-01" },
    { start_date: "2026-11-03", end_date: "2026-11-01" },
    { start_date: "2020-01-01", end_date: "2026-11-01" },
    {
      start_date: "2026-11-01",
      end_date: "2026-11-01",
      days: [{ date: "2026-11-01", count: -1 }],
    },
  ])
    assert.throws(() => f(input));
});
