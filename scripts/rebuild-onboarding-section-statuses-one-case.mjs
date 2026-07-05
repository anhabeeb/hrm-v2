const caseId = process.env.HRM_REPAIR_CASE_ID || "";
const confirm = process.env.HRM_REPAIR_CONFIRM || "";
const apiUrl = (process.env.HRM_REPAIR_API_URL || process.env.HRM_PROD_API_URL || "").replace(/\/+$/, "");
const token = process.env.HRM_REPAIR_TOKEN || process.env.HRM_LIVE_AUTH_TOKEN || "";

if (!caseId) {
  console.error("Set HRM_REPAIR_CASE_ID to the single onboarding case to rebuild.");
  process.exit(1);
}

if (confirm !== "YES") {
  console.error("Set HRM_REPAIR_CONFIRM=YES to rebuild one onboarding case section-status readiness.");
  process.exit(1);
}

if (!apiUrl || !token) {
  console.error("Set HRM_REPAIR_API_URL and HRM_REPAIR_TOKEN to call the authenticated one-case rebuild endpoint.");
  process.exit(1);
}

const response = await fetch(`${apiUrl}/api/v1/onboarding/cases/${encodeURIComponent(caseId)}/section-statuses/rebuild`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "X-Request-Id": `repair_section_status_${Date.now()}`
  }
});

let payload = null;
try {
  payload = await response.json();
} catch {
  payload = null;
}

if (!response.ok) {
  console.error(`One-case section status rebuild failed with HTTP ${response.status}.`);
  if (payload?.error?.code) console.error(`Code: ${payload.error.code}`);
  if (payload?.error?.message) console.error(`Message: ${payload.error.message}`);
  process.exit(1);
}

console.log(JSON.stringify({
  case_id: caseId,
  rebuilt_count: payload?.rebuilt_count ?? payload?.data?.rebuilt_count ?? null,
  failed_count: payload?.failed_count ?? payload?.data?.failed_count ?? null,
  readiness_status: payload?.readiness?.status ?? payload?.data?.readiness?.status ?? null,
  activation_requires_final_verification: true
}, null, 2));
