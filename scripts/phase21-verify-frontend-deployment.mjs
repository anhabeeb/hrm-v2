import { defaultFrontendUrl, envUrl, joinUrl, phase21Report, reportRowsSection, safeFetchCheck, statusFromRows, writeReport } from "./phase21-utils.mjs";

const frontendUrl = envUrl("HRM_PROD_FRONTEND_URL", "");
const reportPath = "docs/production/phase21-frontend-deployment-report.md";

async function main() {
  const rows = [];
  if (!frontendUrl) {
    writeReport(reportPath, phase21Report("Phase 21 Frontend Deployment Verification", "SOURCE READY / LIVE NOT VERIFIED", [
      `Set \`HRM_PROD_FRONTEND_URL\` to run live frontend checks. Expected production frontend: ${defaultFrontendUrl}. No native mobile app deployment is in scope; responsive web/mobile-browser behavior is verified by route availability.`
    ]));
    console.log("Phase 21 frontend deployment verification skipped: HRM_PROD_FRONTEND_URL was not provided.");
    return;
  }

  rows.push(await safeFetchCheck("Frontend URL loads HTML", frontendUrl, {}, (response, meta) => response.status < 500 && /text\/html/i.test(meta.contentType) && !/immutable/i.test(meta.cache)));
  rows.push(await safeFetchCheck("Login route reload works", joinUrl(frontendUrl, "/login"), {}, (response, meta) => [200, 304].includes(response.status) && /html/i.test(meta.contentType)));
  rows.push(await safeFetchCheck("Direct app route reload works", joinUrl(frontendUrl, "/employees"), {}, (response, meta) => [200, 304].includes(response.status) && /html/i.test(meta.contentType)));
  rows.push(await safeFetchCheck("Favicon loads with correct MIME", joinUrl(frontendUrl, "/favicon.ico"), {}, (response, meta) => response.status < 500 && /image|icon|octet-stream/i.test(meta.contentType)));
  rows.push(await safeFetchCheck("Brand SVG loads with correct MIME", joinUrl(frontendUrl, "/brand/omnicore-favicon.svg"), {}, (response, meta) => response.status < 500 && /svg|image/i.test(meta.contentType)));
  rows.push(await safeFetchCheck("Missing JS asset is not returned as successful HTML", joinUrl(frontendUrl, "/assets/phase21-missing-chunk.js"), {}, (response, meta) => response.status >= 400 && !/text\/html/i.test(meta.contentType)));
  rows.push(await safeFetchCheck("Responsive web/mobile-browser route remains available", joinUrl(frontendUrl, "/self-service"), {}, (response) => [200, 304].includes(response.status)));

  const status = statusFromRows(rows);
  writeReport(reportPath, phase21Report("Phase 21 Frontend Deployment Verification", status, [
    "This verifies Cloudflare Pages/static deployment behavior, asset MIME/cache safety, SPA fallback, and responsive web route availability. No native mobile deployment work is included.",
    reportRowsSection(rows)
  ]));
  console.log(`Phase 21 frontend deployment verification complete: ${status}.`);
}

main().catch((error) => {
  console.error("Phase 21 frontend deployment verification failed unexpectedly.");
  console.error(error.message);
  process.exit(1);
});

