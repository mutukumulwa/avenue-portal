#!/usr/bin/env node

const baseUrl = process.env.AICARE_BASE_URL ?? "http://localhost:3000";
const password = process.env.AICARE_AUDIT_PASSWORD ?? "AvenueAdmin2024!";

const roles = [
  { key: "SUPER_ADMIN", email: "admin@avenue.co.ke", paths: ["/dashboard", "/groups", "/members", "/endorsements", "/packages", "/claims", "/preauth", "/providers", "/billing", "/billing/gl", "/billing/gl/ledger", "/fund/dashboard", "/brokers", "/quotations", "/reports", "/service-requests", "/complaints", "/fraud", "/settings", "/settings/exceptions", "/settings/audit-log", "/settings/approval-matrix"] },
  { key: "CLAIMS_OFFICER", email: "claims@avenue.co.ke", paths: ["/dashboard", "/groups", "/members", "/endorsements", "/claims", "/preauth", "/reports", "/service-requests", "/complaints", "/fraud"] },
  { key: "FINANCE_OFFICER", email: "finance@avenue.co.ke", paths: ["/dashboard", "/billing", "/billing/gl", "/billing/gl/ledger", "/reports"] },
  { key: "UNDERWRITER", email: "underwriter@avenue.co.ke", paths: ["/dashboard", "/groups", "/members", "/endorsements", "/packages", "/quotations", "/reports", "/service-requests", "/complaints", "/fraud"] },
  { key: "CUSTOMER_SERVICE", email: "cs@avenue.co.ke", paths: ["/dashboard", "/groups", "/members", "/endorsements", "/reports", "/service-requests", "/complaints", "/fraud"] },
  { key: "MEDICAL_OFFICER", email: "medical@avenue.co.ke", paths: ["/dashboard", "/groups", "/members", "/endorsements", "/claims", "/preauth", "/reports", "/service-requests", "/complaints", "/fraud"] },
  { key: "FUND_ADMINISTRATOR", email: "fund@avenue.co.ke", paths: ["/fund/dashboard"] },
  { key: "BROKER_USER", email: "broker@kaib.co.ke", paths: ["/broker/dashboard", "/broker/groups", "/broker/submissions", "/broker/quotations", "/broker/commissions", "/broker/renewals", "/broker/support"] },
  { key: "HR_MANAGER", email: "emily.wambui@safaricom.co.ke", paths: ["/hr/dashboard", "/hr/roster", "/hr/endorsements", "/hr/invoices", "/hr/utilization", "/hr/support", "/hr/profile", "/hr/roster/import", "/hr/roster/new", "/hr/support/new"] },
  { key: "MEMBER_USER", email: "member@avenue.co.ke", paths: ["/member/dashboard", "/member/benefits", "/member/dependents", "/member/utilization", "/member/preauth", "/member/facilities", "/member/support", "/member/profile"] },
];

function cookieHeader(cookies) {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function captureCookies(headers, jar) {
  const setCookie = headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) {
    const [pair] = cookie.split(";");
    const [key, value] = pair.split("=");
    if (key && value) jar.set(key, value);
  }
}

async function request(path, jar, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie: cookieHeader(jar),
    },
  });
  captureCookies(response.headers, jar);
  return response;
}

async function login(role) {
  const jar = new Map();
  const csrfRes = await request("/api/auth/csrf", jar);
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({
    csrfToken,
    email: role.email,
    password,
    redirect: "false",
    json: "true",
  });
  await request("/api/auth/callback/credentials", jar, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const session = await request("/api/auth/session", jar);
  const json = await session.json();
  if (json?.user?.role !== role.key) {
    throw new Error(`${role.key}: expected session role ${role.key}, got ${json?.user?.role ?? "none"}`);
  }
  return jar;
}

function badContent(html) {
  return /Access Denied|Sign In|404: This page could not be found|This page could not be found|Application error|PrismaClient|Unhandled Runtime Error/i.test(html);
}

let failures = 0;

for (const role of roles) {
  let jar;
  try {
    jar = await login(role);
  } catch (error) {
    failures += 1;
    console.error(`FAIL login ${role.key}: ${error.message}`);
    continue;
  }

  for (const path of role.paths) {
    const response = await request(path, jar, { redirect: "follow" });
    const html = await response.text();
    if (!response.ok || badContent(html)) {
      failures += 1;
      console.error(`FAIL ${role.key} ${path}: ${response.status} ${response.url}`);
    } else {
      console.log(`OK   ${role.key} ${path}`);
    }
  }
}

if (failures > 0) {
  console.error(`Audit smoke failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("Audit smoke passed.");
