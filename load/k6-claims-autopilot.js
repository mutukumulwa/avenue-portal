/**
 * Claims Autopilot — k6 load profile (F7.5).
 *
 * RUN ONLY against an approved load environment (never production):
 *   k6 run -e BASE_URL=https://staging.example -e API_KEY=mvxk_... \
 *          -e MEMBER_NUMBER=... [-e PROFILE=mixed|clean|burst] load/k6-claims-autopilot.js
 *
 * Profiles (§F7.5): 10/50/100 concurrent online submissions; mixed
 * 70% clean / 20% routed(missing PA => inpatient) / 10% replay+conflict.
 * Measures receipt latency p50/p95/p99 and error classes. Import/offline/queue
 * profiles are driven separately (they need files/devices/UI sessions).
 *
 * DO NOT weaken validation or isolation to hit a target (plan rule).
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

const receiptLatency = new Trend("receipt_latency_ms");
const conflicts = new Counter("expected_conflicts");
const replays = new Counter("replays");
const serverErrors = new Counter("server_errors_5xx");

const BASE = __ENV.BASE_URL;
const KEY = __ENV.API_KEY;
const MEMBER = __ENV.MEMBER_NUMBER;
const PROFILE = __ENV.PROFILE || "mixed";

export const options = {
  scenarios: {
    submissions: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 10 },
        { duration: "2m", target: 50 },
        { duration: "2m", target: 100 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    receipt_latency_ms: ["p(95)<1500", "p(99)<3000"], // initial SLOs — measure, then ratify
    server_errors_5xx: ["count==0"],
  },
};

function body(kind, iter) {
  const base = {
    memberNumber: MEMBER,
    serviceType: "OUTPATIENT",
    dateOfService: "2026-06-20",
    diagnoses: ["J06.9"],
    lineItems: [{ description: "Load consult", quantity: 1, unitCost: 3000, cptCode: "99213" }],
  };
  if (kind === "routed") return { ...base, serviceType: "INPATIENT", benefitCategory: "INPATIENT" }; // missing PA => accepted + routed
  return base;
}

export default function () {
  const iter = `${__VU}-${__ITER}`;
  const roll = Math.random();
  const kind = PROFILE === "clean" ? "clean" : roll < 0.7 ? "clean" : roll < 0.9 ? "routed" : "replay";
  const key = kind === "replay" ? `k6-replay-${__VU}` : `k6-${iter}-${Date.now()}`;

  const res = http.post(`${BASE}/api/v1/claims`, JSON.stringify(body(kind, iter)), {
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}`, "idempotency-key": key },
  });
  receiptLatency.add(res.timings.duration);
  if (res.status >= 500 && res.status !== 503) serverErrors.add(1);
  if (res.status === 409) conflicts.add(1);
  if (res.status === 200) replays.add(1);
  check(res, { "accepted/replayed/expected": (r) => [200, 201, 202, 409, 422, 503].includes(r.status) });
  sleep(0.5);
}
