# Dependency Security Audit

## Summary

Date: 2026-06-29

The recurring `npm ci` audit warning was caused by development and build tooling, not HRM runtime business code. The vulnerable chain was:

`wrangler@4.56.0 -> miniflare@4.20251217.0 -> undici@7.14.0 / ws@8.18.0`

The fix upgrades Wrangler in both the root workspace and Worker workspace to the current same-major release:

`wrangler@4.105.0 -> miniflare@4.20260625.0 -> undici@7.28.0 / ws@8.21.0`

## Before Fix

`npm ci` reported:

- 4 vulnerabilities total
- 1 moderate
- 3 high

`npm audit` reported vulnerable transitive packages:

- `undici` through `miniflare`
- `ws` through `miniflare`
- `miniflare` through `wrangler`
- direct `wrangler` advisory affecting older 4.x releases

Wrangler also printed a deprecation warning for `4.56.0`.

## Fix Applied

Updated:

- Root `devDependencies.wrangler`: `^4.56.0` to `^4.105.0`
- Worker `devDependencies.wrangler`: `^4.20.3` to `^4.105.0`
- `package-lock.json` to resolve the safe transitive tooling versions

No app runtime dependencies, frontend React dependencies, Worker code, schema, bindings, or business logic were changed.

## After Fix

`npm audit --json` reports:

- 0 vulnerabilities
- 0 moderate
- 0 high
- 0 critical

Resolved build tooling versions:

- `wrangler`: `4.105.0`
- `miniflare`: `4.20260625.0`
- `undici`: `7.28.0`
- `ws`: `8.21.0`

React remains a single compatible dependency tree:

- `react`: `18.3.1`
- `react-dom`: `18.3.1`

## Production Impact Assessment

The vulnerable packages were part of local development/build tooling used by Wrangler and Miniflare. They are not bundled as HRM frontend runtime code and are not part of the deployed Worker application logic. Upgrading Wrangler removes the warnings while preserving the Cloudflare Worker dry-run build path.

## Commands Used

- `npm ci`
- `npm audit`
- `npm audit --json`
- `npm ls wrangler miniflare undici ws`
- `npm ls react react-dom`
- `npm install -D wrangler@^4.105.0 -W`
- `npm install -D wrangler@^4.105.0 -w worker`
- `npm run typecheck`
- `npm run build`
- `npm run verify`
- `npm run verify:dependency-security-cleanup`

## Verification Results

Verification confirmed:

- `npm audit` no longer reports vulnerabilities.
- The Worker dry-run build still passes.
- The frontend production build still passes.
- React and React DOM remain single-version and compatible.
- D1 and R2 bindings remain unchanged.
- PBKDF2 remains capped at `100000`.
- The professional loader, global popup alert, form/action validation, employee-user linking, import/export, button color, static asset, frontend bundle, filter/search/date, and Command Center verifiers remain present and passing.

## Next Review Recommendation

Run `npm audit` and `npm outdated wrangler @cloudflare/workers-types` during each production release cycle, and upgrade Wrangler within the same major line unless Cloudflare release notes identify a breaking change for Worker dry-run deploys or local D1 tooling.
