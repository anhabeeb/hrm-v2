# Phase 12 Deployment Config Audit

Generated: 2026-07-03T14:22:20.834Z

Summary: 14 passed, 0 failed.

| Status | Check | Details |
| --- | --- | --- |
| PASS | CORS includes x-request-id |  |
| PASS | CORS includes HRM tenant/company headers |  |
| PASS | CORS allows production frontend origin |  |
| PASS | CORS sets Vary: Origin |  |
| PASS | CORS avoids wildcard credentialed origin |  |
| PASS | authenticated API timing keeps private no-store |  |
| PASS | static root/index are no-cache |  |
| PASS | static assets are immutable |  |
| PASS | brand assets are immutable |  |
| PASS | SPA redirects do not capture assets before static rules |  |
| PASS | health endpoint is safe and no-store |  |
| PASS | D1 binding name unchanged |  |
| PASS | R2 binding name unchanged |  |
| PASS | PBKDF2 remains 100000 |  |

## Production Domains

Frontend: `https://hr.cafeasiana.com.mv`

API: `https://hr.api.cafeasiana.com.mv`

## Notes

This report is generated from source configuration. Remote Cloudflare dashboard settings should be verified during deployment review.
