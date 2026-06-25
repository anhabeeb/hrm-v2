import { clearCacheByModule, clearSensitiveIndexedDbCaches, clearUserScopedCaches, markCacheEntryStale } from "./indexedDbCache";
import { employee360CacheKey, moduleCacheKey } from "./cacheKeys";

export interface SyncChangedEntity {
  module?: string;
  module_key?: string;
  entityType?: string;
  entity_type?: string;
  table?: string;
  table_name?: string;
  id?: string;
  row_id?: string;
  employee_id?: string | null;
  action?: string;
  version?: string | number;
  updatedAt?: string;
  updated_at?: string;
}

export interface CacheInvalidationHint {
  cacheKey?: string;
  cache_key?: string;
  module?: string;
  module_key?: string;
  employee_id?: string;
  reason?: string;
}

export async function invalidateCacheForChange(userId: string, change: SyncChangedEntity) {
  const moduleKey = change.module_key ?? change.module;
  const employeeId = change.employee_id;
  if (employeeId) await invalidateEmployeeCaches(userId, employeeId);
  if (moduleKey) await clearCacheByModule(moduleKey, userId);
}

export async function invalidateEmployeeCaches(userId: string, employeeId: string) {
  await markCacheEntryStale(employee360CacheKey(userId, employeeId));
  await markCacheEntryStale(moduleCacheKey(userId, "employees"));
  await markCacheEntryStale(moduleCacheKey(userId, "dashboard"));
}

export async function invalidateModuleCaches(userId: string, moduleKey: string) {
  await clearCacheByModule(moduleKey, userId);
}

export async function invalidateSelfServiceCaches(userId: string) {
  await markCacheEntryStale(moduleCacheKey(userId, "self_service"));
}

export async function clearCachesForPermissionChange(userId: string) {
  await clearUserScopedCaches(userId);
}

export async function clearSensitiveCachesOnLogout() {
  await clearSensitiveIndexedDbCaches();
}

export async function applyInvalidationHints(userId: string, hints: CacheInvalidationHint[] = []) {
  for (const hint of hints) {
    const key = hint.cache_key ?? hint.cacheKey;
    const moduleKey = hint.module_key ?? hint.module;
    if (key) await markCacheEntryStale(key);
    if (hint.employee_id) await invalidateEmployeeCaches(userId, hint.employee_id);
    if (moduleKey) await invalidateModuleCaches(userId, moduleKey);
  }
}
