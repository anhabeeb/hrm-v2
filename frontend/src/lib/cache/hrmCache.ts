import { api } from "../api";
import { APP_BRANDING } from "../../config/branding";
import { APP_CACHE_VERSION, CACHE_SCHEMA_VERSION, moduleCacheKey, userScopedCacheKey, type HrmCacheModule } from "./cacheKeys";
import {
  clearAllIndexedDbCaches,
  clearCacheOnPermissionChange,
  clearSensitiveIndexedDbCaches,
  clearUserScopedCaches,
  getCacheEntry,
  getFrontendCacheDiagnostics,
  initializeHrmCache,
  setCacheEntry,
  setCacheMetadata
} from "./indexedDbCache";
import {
  applyInvalidationHints,
  clearCachesForPermissionChange,
  clearSensitiveCachesOnLogout,
  invalidateCacheForChange,
  invalidateEmployeeCaches,
  invalidateModuleCaches,
  invalidateSelfServiceCaches
} from "./cacheInvalidation";

export {
  APP_CACHE_VERSION,
  CACHE_SCHEMA_VERSION,
  applyInvalidationHints,
  clearAllIndexedDbCaches,
  clearCacheOnPermissionChange,
  clearCachesForPermissionChange,
  clearSensitiveCachesOnLogout,
  clearSensitiveIndexedDbCaches,
  clearUserScopedCaches,
  getFrontendCacheDiagnostics,
  initializeHrmCache,
  invalidateCacheForChange,
  invalidateEmployeeCaches,
  invalidateModuleCaches,
  invalidateSelfServiceCaches
};

export const SERVER_AUTHORITATIVE_CACHE_RULE =
  `${APP_BRANDING.appName} frontend cache is server-authoritative and IndexedDB-assisted. Cloudflare Worker API plus D1 remains the source of truth.`;

const SAFE_TTL_MS = 5 * 60 * 1000;
const SENSITIVE_TTL_MS = 60 * 1000;

export function permissionScopeHash(input: { permissions?: string[]; roles?: string[]; employeeId?: string | null }) {
  return JSON.stringify({
    permissions: [...(input.permissions ?? [])].sort(),
    roles: [...(input.roles ?? [])].sort(),
    employee_id: input.employeeId ?? null
  });
}

function expiresAt(sensitive: boolean) {
  return new Date(Date.now() + (sensitive ? SENSITIVE_TTL_MS : SAFE_TTL_MS)).toISOString();
}

export async function getBootstrapPayload(token: string) {
  const payload = await api.getSyncBootstrap(token);
  await setCacheMetadata("last_bootstrap_time", new Date().toISOString());
  await setCacheMetadata("sync_cursor", payload.current_version);
  return payload;
}

export async function getModuleScopedData(token: string, moduleKey: HrmCacheModule) {
  return api.getSyncModule(token, moduleKey);
}

export async function hydratePageCache(input: {
  userId: string;
  moduleKey: HrmCacheModule;
  data: unknown;
  permissionHash: string;
  scopeHash?: string;
  sensitive?: boolean;
  serverVersion?: string | number | null;
}) {
  const cacheKey = moduleCacheKey(input.userId, input.moduleKey);
  await setCacheEntry({
    cache_key: cacheKey,
    module_key: input.moduleKey,
    entity_type: "module",
    entity_id: null,
    user_id: input.userId,
    permission_hash: input.permissionHash,
    scope_hash: input.scopeHash ?? "",
    server_version: input.serverVersion ?? null,
    fetched_at: new Date().toISOString(),
    expires_at: expiresAt(Boolean(input.sensitive)),
    sensitive: Boolean(input.sensitive),
    stale: false,
    data: input.data
  });
  return cacheKey;
}

export async function refreshModuleCache(token: string, userId: string, moduleKey: HrmCacheModule, permissionHash = "") {
  const data = await getModuleScopedData(token, moduleKey);
  await hydratePageCache({ userId, moduleKey, data, permissionHash, serverVersion: data.current_version ?? null });
  return data;
}

export async function refreshEntityCache(token: string, input: {
  userId: string;
  entityType: string;
  entityId: string;
  moduleKey: HrmCacheModule;
  permissionHash?: string;
  sensitive?: boolean;
}) {
  const data = await api.getSyncEntity(token, input.entityType, input.entityId);
  const cacheKey = userScopedCacheKey({ userId: input.userId, moduleKey: input.moduleKey, entityType: input.entityType, entityId: input.entityId });
  await setCacheEntry({
    cache_key: cacheKey,
    module_key: input.moduleKey,
    entity_type: input.entityType,
    entity_id: input.entityId,
    user_id: input.userId,
    permission_hash: input.permissionHash ?? "",
    scope_hash: "",
    server_version: data.current_version ?? null,
    fetched_at: new Date().toISOString(),
    expires_at: expiresAt(Boolean(input.sensitive)),
    sensitive: Boolean(input.sensitive),
    stale: false,
    data
  });
  return data;
}

export async function clearAllHrmCache() {
  await clearAllIndexedDbCaches();
}

export async function clearSensitiveHrmCache() {
  await clearSensitiveIndexedDbCaches();
}

export function preserveSafeUiPreferences() {
  return {
    preserved_keys: ["hrm-v2-sidebar-groups", "hrm_v2_table_density", "hrm_v2_page_size"],
    note: "Safe UI preferences remain in localStorage when sensitive IndexedDB caches are cleared."
  };
}

export async function clearCurrentBrowserCache() {
  await clearAllHrmCache();
}

export async function refreshCurrentModuleCache(token: string, userId: string, moduleKey: HrmCacheModule) {
  return refreshModuleCache(token, userId, moduleKey);
}

export async function getCachedModuleData<T = unknown>(userId: string, moduleKey: HrmCacheModule) {
  return getCacheEntry<T>(moduleCacheKey(userId, moduleKey));
}
