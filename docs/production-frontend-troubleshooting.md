# Production Frontend Troubleshooting

Use this checklist when Cloudflare Pages serves stale HTML, cancels a stylesheet, or returns `text/html` for a static asset.

## Check SPA document routes

Run:

```powershell
Invoke-WebRequest "https://hr.cafeasiana.com.mv/login" -Method Head | Select-Object -ExpandProperty Headers
```

Expected response headers:

```text
Content-Type: text/html; charset=utf-8
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

The same no-cache behavior should apply to other app routes such as `/dashboard`, `/employees`, and `/payroll`.

## Check CSS asset routes

Run this against the current CSS asset referenced by the deployed `index.html`:

```powershell
Invoke-WebRequest "https://hr.cafeasiana.com.mv/assets/<new-css-file>.css" -Method Head | Select-Object -ExpandProperty Headers
```

Expected response headers:

```text
Content-Type: text/css; charset=utf-8
Cache-Control: public, max-age=31536000, immutable
X-Content-Type-Options: nosniff
```

If the stylesheet is shown as `canceled` in the Network tab, enable **Disable cache** in DevTools, hard reload, and confirm the asset URL in `index.html` exists under the deployed `assets/` folder.

## Check favicon

Run:

```powershell
Invoke-WebRequest "https://hr.cafeasiana.com.mv/favicon.ico" -Method Head | Select-Object -ExpandProperty Headers
```

Expected:

```text
Content-Type: image/x-icon
```

It must not return `text/html`. If it returns HTML, confirm `frontend/public/favicon.ico` exists and that `frontend/public/_redirects` contains the favicon rule before the SPA fallback.

## Identify stale memory cache

In Chrome DevTools:

1. Open **Network**.
2. Enable **Disable cache**.
3. Right-click the reload button.
4. Choose **Empty Cache and Hard Reload**.
5. Reload `/login`.
6. Confirm the CSS request shows `200` as a stylesheet, not `canceled`.
7. Confirm the CSS request does not show `text/html` as its MIME type.

If the issue disappears with **Disable cache** enabled, the browser had a stale cached HTML or asset response.

## Clear service worker and cache storage

This app should not depend on a service worker for production navigation. To clear browser-side storage:

1. Open DevTools.
2. Go to **Application**.
3. Check **Service Workers** and unregister any old worker for `hr.cafeasiana.com.mv`.
4. Open **Storage**.
5. Select **Clear site data**.
6. Reload `/login` with **Disable cache** enabled.

## Deployment steps

1. Run `npm run build`.
2. Deploy `frontend/dist` to Cloudflare Pages.
3. Purge Cloudflare cache after the deploy.
4. Open DevTools Network with **Disable cache** enabled.
5. Hard reload `https://hr.cafeasiana.com.mv/login`.
6. Verify `/login` is no-cache.
7. Verify `/assets/*.css` returns `text/css`.
8. Verify `/favicon.ico` does not return `text/html`.

## Repository guards

Run these before deploying frontend static assets:

```bash
npm run build
npm run verify:frontend-bundle-integrity
npm run verify:frontend-static-assets
```

The static asset verifier checks that built `index.html` references only existing CSS/JS files, that `/assets/*` is protected from SPA fallback, and that `favicon.ico` exists as a real icon.
