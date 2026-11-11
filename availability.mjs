import { readFileSync, existsSync } from "node:fs";
export function availabilitySummary(file, now = Date.now()) {
  const rows = existsSync(file)
    ? readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];
  const checks = rows.filter((x) => x.event === "health");
  const healthy = checks.filter((x) => x.ok).length;
  let longestGap = 0;
  for (let i = 1; i < checks.length; i++)
    longestGap = Math.max(longestGap, checks[i].time - checks[i - 1].time);
  const first = checks[0]?.time,
    last = checks.at(-1)?.time;
  return {
    targetMonthlyPercent: 99,
    monthlyStatus: "not_yet_verified",
    reason:
      "A short local run and recovery test cannot establish a complete calendar month of availability.",
    observations: checks.length,
    healthyObservations: healthy,
    observedSamplePercent: checks.length
      ? Math.round((healthy / checks.length) * 10000) / 100
      : null,
    firstObservation: first ? new Date(first).toISOString() : null,
    lastObservation: last ? new Date(last).toISOString() : null,
    observedSpanSeconds: first && last ? Math.round((last - first) / 1000) : 0,
    longestGapSeconds: Math.round(longestGap / 1000),
    lastObservationAgeSeconds: last ? Math.round((now - last) / 1000) : null,
    restarts: rows.filter((x) => x.event === "restart").length,
    scope:
      "Sample-based local observations only. Gaps while the monitor or computer is off are not counted as successful uptime.",
  };
}
