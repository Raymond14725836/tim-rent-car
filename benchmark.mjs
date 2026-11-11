import fs from "node:fs";
const base = process.env.BASE_URL || "http://127.0.0.1:3003";
const login = await fetch(base + "/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "customer@tim.test", password: "Demo1234!" }),
});
if (!login.ok)
  throw Error("Start the demo server before running the benchmark");
const cookie = login.headers.get("set-cookie").split(";")[0];
const workflows = [
  { name: "list-cars", path: "cars" },
  {
    name: "quote",
    path: "quote",
    body: {
      carId: "CAR-001",
      start: "2027-12-20T10:00:00+07:00",
      end: "2027-12-22T10:00:00+07:00",
    },
  },
  { name: "my-bookings", path: "bookings" },
];
const results = [];
for (const w of workflows) {
  const times = [];
  let ok = 0;
  await Promise.all(
    Array.from({ length: 100 }, async () => {
      const start = performance.now();
      const r = await fetch(base + "/api/" + w.path, {
        method: w.body ? "POST" : "GET",
        headers: {
          cookie,
          ...(w.body ? { "Content-Type": "application/json" } : {}),
        },
        body: w.body ? JSON.stringify(w.body) : undefined,
      });
      await r.json();
      times.push(performance.now() - start);
      if (r.ok) ok++;
    }),
  );
  times.sort((a, b) => a - b);
  results.push({
    workflow: w.name,
    concurrentRequests: 100,
    success: ok,
    p95Ms: Math.round(times[94]),
    maxMs: Math.round(times[99]),
    within3Seconds: times.filter((t) => t < 3000).length,
  });
}
const report = {
  testedAt: new Date().toLocaleString("en-CA", { timeZone: "Asia/Bangkok" }),
  timezone: "Asia/Bangkok",
  environment: "Local Node.js " + process.version,
  scope:
    "100 concurrent HTTP requests per workflow. Not a production capacity or monthly availability certification.",
  results,
};
fs.mkdirSync("verification", { recursive: true });
fs.writeFileSync(
  "verification/performance.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
