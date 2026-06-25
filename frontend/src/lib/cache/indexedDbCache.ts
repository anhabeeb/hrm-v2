import { APP_CACHE_VERSION, CACHE_SCHEMA_VERSION, HRM_CACHE_DB_NAME, HRM_CACHE_METADATA_STORE, HRM_CACHE_STORE, type HrmCacheModule } from "./cacheKeys";

export interface HrmCacheEntry<T = unknown> {
  cache_key: string;
  module_key: HrmCacheModule;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string;
  permission_hash: string;
  scope_hash: string;
  server_version: string | number | null;
  fetched_at: string;
  expires_at: string;
  sensitive: boolean;
  stale: boolean;
  data: T;
}

interface CacheMetadata {
  key: string;
  value: unknown;
  updated_at: string;
}

function isIndexedDbAvailable() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function isoNow() {
  return new Date().toISOString();
}

function openDatabase() {
  if (!isIndexedDbAvailable()) return Promise.resolve<IDBDatabase | null>(null);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(HRM_CACHE_DB_NAME, CACHE_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HRM_CACHE_STORE)) {
        const cacheStore = db.createObjectStore(HRM_CACHE_STORE, { keyPath: "cache_key" });
        cacheStore.createIndex("module_key", "module_key", { unique: false });
        cacheStore.createIndex("user_id", "user_id", { unique: false });
        cacheStore.createIndex("sensitive", "sensitive", { unique: false });
        cacheStore.createIndex("expires_at", "expires_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(HRM_CACHE_METADATA_STORE)) {
        db.createObjectStore(HRM_CACHE_METADATA_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open HRM cache."));
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T> | void) {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    let result: T | null = null;
    if (request) {
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    }
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB transaction failed."));
    };
  });
}

async function getAllEntries() {
  return (await withStore<HrmCacheEntry[]>(HRM_CACHE_STORE, "readonly", (store) => store.getAll())) ?? [];
}

async function replaceEntries(entries: HrmCacheEntry[]) {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HRM_CACHE_STORE, "readwrite");
    const store = tx.objectStore(HRM_CACHE_STORE);
    store.clear();
    for (const entry of entries) store.put(entry);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Unable to replace cache entries."));
    };
  });
}

export async function initializeHrmCache() {
  const db = await openDatabase();
  if (!db) return;
  db.close();
  await setCacheMetadata("cache_schema_version", CACHE_SCHEMA_VERSION);
  await setCacheMetadata("app_cache_version", APP_CACHE_VERSION);
}

export async function setCacheEntry<T>(entry: HrmCacheEntry<T>) {
  await initializeHrmCache();
  await withStore(HRM_CACHE_STORE, "readwrite", (store) => store.put({ ...entry, fetched_at: entry.fetched_at || isoNow() }));
}

export async function getCacheEntry<T = unknown>(cacheKey: string) {
  const entry = await withStore<HrmCacheEntry<T>>(HRM_CACHE_STORE, "readonly", (store) => store.get(cacheKey));
  if (!entry) return null;
  if (new Date(entry.expires_at).getTime() <= Date.now()) {
    return { ...entry, stale: true };
  }
  return entry;
}

export async function markCacheEntryStale(cacheKey: string) {
  const entry = await getCacheEntry(cacheKey);
  if (!entry) return;
  await setCacheEntry({ ...entry, stale: true });
}

export async function clearAllIndexedDbCaches() {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([HRM_CACHE_STORE, HRM_CACHE_METADATA_STORE], "readwrite");
    tx.objectStore(HRM_CACHE_STORE).clear();
    tx.objectStore(HRM_CACHE_METADATA_STORE).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Unable to clear HRM cache."));
    };
  });
}

export async function clearSensitiveIndexedDbCaches() {
  const entries = await getAllEntries();
  await replaceEntries(entries.filter((entry) => !entry.sensitive));
  await setCacheMetadata("last_sensitive_cache_clear_at", isoNow());
}

export async function clearUserScopedCaches(userId: string) {
  const entries = await getAllEntries();
  await replaceEntries(entries.filter((entry) => entry.user_id !== userId));
}

export async function clearCacheByModule(moduleKey: string, userId?: string) {
  const entries = await getAllEntries();
  await replaceEntries(entries.filter((entry) => entry.module_key !== moduleKey || (userId ? entry.user_id !== userId : false)));
}

export async function clearCacheOnPermissionChange(userId: string) {
  await clearUserScopedCaches(userId);
  await setCacheMetadata("last_permission_scope_cache_clear_at", isoNow());
}

export async function setCacheMetadata(key: string, value: unknown) {
  const metadata: CacheMetadata = { key, value, updated_at: isoNow() };
  await withStore(HRM_CACHE_METADATA_STORE, "readwrite", (store) => store.put(metadata));
}

export async function getCacheMetadata<T = unknown>(key: string) {
  const metadata = await withStore<CacheMetadata>(HRM_CACHE_METADATA_STORE, "readonly", (store) => store.get(key));
  return (metadata?.value ?? null) as T | null;
}

export async function getFrontendCacheDiagnostics() {
  const entries = await getAllEntries();
  const modules = Array.from(new Set(entries.map((entry) => String(entry.module_key)))).sort();
  const sensitiveEntries = entries.filter((entry) => entry.sensitive);
  const expiredEntries = entries.filter((entry) => new Date(entry.expires_at).getTime() <= Date.now());
  return {
    cache_schema_version: CACHE_SCHEMA_VERSION,
    app_cache_version: APP_CACHE_VERSION,
    database_name: HRM_CACHE_DB_NAME,
    modules_using_cache: modules,
    total_entries: entries.length,
    sensitive_entries: sensitiveEntries.length,
    expired_entries: expiredEntries.length,
    last_bootstrap_time: await getCacheMetadata<string>("last_bootstrap_time"),
    last_cache_clear_time: await getCacheMetadata<string>("last_sensitive_cache_clear_at"),
    sync_cursor: await getCacheMetadata<string | number>("sync_cursor"),
    note: "Browser IndexedDB is a secondary read cache only. Server APIs remain authoritative."
  };
}
