/**
 * Outpatient HTTP load profile (Outstanding-Conditions Ticket 8 / §D3).
 *
 * Sustained-concurrency smoke of the core outpatient journey. Read the safety
 * notes in loadtest/README.md FIRST — do not point this at production without an
 * approved window. Steps whose endpoints are left as `null` below are skipped
 * with a warning, so the harness can be adopted incrementally per environment.
 *
 * Run: BASE_URL=... LOGIN_EMAIL=... LOGIN_PASSWORD=... k6 run loadtest/outpatient.k6.js
 */
import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const LOGIN_EMAIL = __ENV.LOGIN_EMAIL || "";
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD || "";

const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || "1m";
const RAMP = __ENV.RAMP || "20s";

// Centralised endpoint map — adjust to the deployed routes under test. A null
// value marks a step as "not yet wired" so it's skipped, not failed.
const ROUTES = {
  login: "/api/auth/callback/credentials",
  eligibilitySearch: "/api/provider/eligibility",
  claimIntake: null, // e.g. "/api/provider/claims"
  claimsQueue: "/claims",
  claimDecision: null, // server action — drive via UI/Playwright layer
  settlementCreate: null,
  providerStatement: "/provider/statements",
  memberDashboard: "/member",
  reportsExport: null, // e.g. "/api/reports/claims.csv"
};

const errorRate = new Rate("app_errors");
const stepDuration = new Trend("app_step_duration", true);

export const options = {
  scenarios: {
    outpatient: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP, target: VUS },
        { duration: DURATION, target: VUS },
        { duration: RAMP, target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // < 1% failed requests
    http_req_duration: ["p(95)<3000"], // 95th percentile under 3s
    app_errors: ["rate<0.01"],
  },
};

function hit(name, path, params = {}) {
  if (!path) {
    // eslint-disable-next-line no-console
    console.warn(`[skip] ${name} — endpoint not configured`);
    return null;
  }
  const res = http.get(`${BASE_URL}${path}`, params);
  stepDuration.add(res.timings.duration, { step: name });
  const ok = check(res, { [`${name} status < 400`]: (r) => r.status > 0 && r.status < 400 });
  errorRate.add(!ok);
  return res;
}

export function setup() {
  if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
    // eslint-disable-next-line no-console
    console.warn("[setup] LOGIN_EMAIL/LOGIN_PASSWORD unset — running unauthenticated smoke only.");
    return { cookies: null };
  }
  const res = http.post(`${BASE_URL}${ROUTES.login}`, {
    email: LOGIN_EMAIL,
    password: LOGIN_PASSWORD,
  });
  return { cookies: res.cookies };
}

export default function (data) {
  const params = data?.cookies ? { cookies: data.cookies } : {};

  group("provider", () => {
    hit("eligibilitySearch", ROUTES.eligibilitySearch, params);
    hit("claimIntake", ROUTES.claimIntake, params);
    hit("providerStatement", ROUTES.providerStatement, params);
  });

  group("claims-officer", () => {
    hit("claimsQueue", ROUTES.claimsQueue, params);
    hit("claimDecision", ROUTES.claimDecision, params);
    hit("settlementCreate", ROUTES.settlementCreate, params);
  });

  group("member", () => {
    hit("memberDashboard", ROUTES.memberDashboard, params);
  });

  group("reports", () => {
    hit("reportsExport", ROUTES.reportsExport, params);
  });

  sleep(1);
}
