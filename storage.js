import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.js";

export const STORAGE_KEY = "codPerfumesErp.v1";
const DB_NAME = "codPerfumesErp";
const DB_VERSION = 1;
const STORE_NAME = "appState";
const STATE_ID = "current";
const CLOUD_TABLE = "erp_user_states";
const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

let supabaseClientPromise;

export const emptyState = {
  _meta: {
    revision: 0,
    updatedAt: "",
  },
  _deleted: {
    products: {},
    people: {},
    sales: {},
    ledger: {},
    stockTransfers: {},
    stockEntries: {},
    campaigns: {},
    inbox: {},
  },
  products: [],
  people: [],
  sales: [],
  ledger: [],
  stockTransfers: [],
  stockEntries: [],
  campaigns: [],
  inbox: [],
  audit: [],
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB indisponivel"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readFromDatabase(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(STATE_ID);
    request.onsuccess = () => resolve(request.result?.data || null);
    request.onerror = () => reject(request.error);
  });
}

function writeToDatabase(db, state) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      id: STATE_ID,
      data: normalizeState(state),
      updatedAt: new Date().toISOString(),
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function loadLegacyState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function isCloudConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function supabaseClient() {
  if (!isCloudConfigured()) return null;
  if (!supabaseClientPromise) {
    supabaseClientPromise = import(SUPABASE_JS_URL).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    );
  }
  return supabaseClientPromise;
}

export async function currentUser() {
  try {
    const client = await supabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getUser();
    return data.user || null;
  } catch {
    return null;
  }
}

export async function signInWithEmail(email, password) {
  const client = await supabaseClient();
  if (!client) throw new Error("Supabase nao configurado");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(email, password) {
  const client = await supabaseClient();
  if (!client) throw new Error("Supabase nao configurado");
  const { error } = await client.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOutCloud() {
  const client = await supabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function onCloudAuthChange(callback) {
  const client = await supabaseClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange(() => callback());
  return () => data.subscription.unsubscribe();
}

async function loadCloudState(user) {
  const client = await supabaseClient();
  if (!client || !user) return null;
  const { data, error } = await client.from(CLOUD_TABLE).select("data").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data?.data ? normalizeState(data.data) : null;
}

async function saveLocalState(state) {
  const normalized = normalizeState(state);
  try {
    const db = await openDatabase();
    await writeToDatabase(db, normalized);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
}

async function saveCloudState(user, state) {
  const client = await supabaseClient();
  if (!client || !user) return false;
  const { error } = await client.from(CLOUD_TABLE).upsert({
    user_id: user.id,
    data: normalizeState(state),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return true;
}

export async function loadState() {
  const legacyState = loadLegacyState();
  const localState = await loadLocalState(legacyState);

  if (isCloudConfigured()) {
    try {
      const user = await currentUser();
      if (user) {
        const cloudState = await loadCloudState(user);
        const mergedState = mergeStates(cloudState, localState);
        await saveLocalState(mergedState);
        if (!sameState(cloudState, mergedState)) await saveCloudState(user, mergedState);
        return normalizeState(mergedState);
      }
    } catch {
      return localState;
    }
  }

  return localState;
}

async function loadLocalState(legacyState = loadLegacyState()) {
  try {
    const db = await openDatabase();
    const savedState = await readFromDatabase(db);

    if (savedState) return normalizeState(savedState);
    if (legacyState) {
      await writeToDatabase(db, legacyState);
      return normalizeState(legacyState);
    }
  } catch {
    return legacyState || structuredClone(emptyState);
  }

  return structuredClone(emptyState);
}

export function normalizeState(nextState) {
  const source = nextState || {};
  const meta = {
    revision: Number(source._meta?.revision || 0),
    updatedAt: source._meta?.updatedAt || "",
  };
  const deleted = normalizeDeleted(source._deleted);
  return {
    ...structuredClone(emptyState),
    ...source,
    _meta: meta,
    _deleted: deleted,
    products: removeDeletedRows(source.products || [], deleted.products),
    people: removeDeletedRows(source.people || [], deleted.people),
    sales: removeDeletedRows(source.sales || [], deleted.sales),
    ledger: removeDeletedRows(source.ledger || [], deleted.ledger),
    stockTransfers: removeDeletedRows(source.stockTransfers || [], deleted.stockTransfers),
    stockEntries: removeDeletedRows(source.stockEntries || [], deleted.stockEntries),
    campaigns: removeDeletedRows(source.campaigns || [], deleted.campaigns),
    inbox: removeDeletedRows(source.inbox || [], deleted.inbox),
    audit: source.audit || [],
  };
}

export function mergeStates(primaryState, secondaryState) {
  const primary = primaryState ? normalizeState(primaryState) : structuredClone(emptyState);
  const secondary = secondaryState ? normalizeState(secondaryState) : structuredClone(emptyState);
  const deleted = mergeDeleted(primary._deleted, secondary._deleted);
  const merged = normalizeState({
    ...primary,
    ...secondary,
    _deleted: deleted,
    products: mergeById(primary.products, secondary.products, deleted.products),
    people: mergeById(primary.people, secondary.people, deleted.people),
    sales: mergeById(primary.sales, secondary.sales, deleted.sales),
    ledger: mergeById(primary.ledger, secondary.ledger, deleted.ledger),
    stockTransfers: mergeById(primary.stockTransfers, secondary.stockTransfers, deleted.stockTransfers),
    stockEntries: mergeById(primary.stockEntries, secondary.stockEntries, deleted.stockEntries),
    campaigns: mergeById(primary.campaigns, secondary.campaigns, deleted.campaigns),
    inbox: mergeById(primary.inbox, secondary.inbox, deleted.inbox),
    audit: [...(primary.audit || []), ...(secondary.audit || [])].slice(-200),
  });

  merged._meta = {
    revision: Math.max(Number(primary._meta?.revision || 0), Number(secondary._meta?.revision || 0)),
    updatedAt: latestDate(primary._meta?.updatedAt, secondary._meta?.updatedAt),
  };

  return merged;
}

function normalizeDeleted(deleted = {}) {
  const emptyDeleted = structuredClone(emptyState._deleted);
  return Object.keys(emptyDeleted).reduce((result, key) => {
    result[key] = { ...(deleted?.[key] || {}) };
    return result;
  }, emptyDeleted);
}

function mergeDeleted(primaryDeleted = {}, secondaryDeleted = {}) {
  const base = normalizeDeleted(primaryDeleted);
  const extra = normalizeDeleted(secondaryDeleted);
  return Object.keys(base).reduce((result, key) => {
    result[key] = { ...base[key], ...extra[key] };
    return result;
  }, normalizeDeleted());
}

function removeDeletedRows(rows = [], deletedIds = {}) {
  return rows.filter((row) => row?.id && !deletedIds[row.id]);
}

function mergeById(primaryRows = [], secondaryRows = [], deletedIds = {}) {
  const rows = new Map();
  primaryRows.forEach((row) => row?.id && rows.set(row.id, row));
  secondaryRows.forEach((row) => {
    if (!row?.id) return;
    rows.set(row.id, { ...rows.get(row.id), ...row });
  });
  return [...rows.values()].filter((row) => !deletedIds[row.id]);
}

function latestDate(first = "", second = "") {
  return first > second ? first : second;
}

function sameState(first, second) {
  return JSON.stringify(normalizeState(first)) === JSON.stringify(normalizeState(second));
}

function prepareStateForSave(state) {
  const nextState = normalizeState(state);
  nextState._meta = {
    revision: Number(nextState._meta?.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  return nextState;
}

export async function saveStateData(state, options = {}) {
  const nextState = prepareStateForSave(state);
  Object.assign(state, nextState);

  if (isCloudConfigured() && !options.localOnly) {
    try {
      const user = await currentUser();
      if (user) {
        if (options.force) {
          await saveCloudState(user, nextState);
          await saveLocalState(nextState);
          return;
        }
        const cloudState = await loadCloudState(user);
        const mergedState = mergeStates(cloudState, nextState);
        mergedState._meta = {
          revision: Math.max(Number(cloudState?._meta?.revision || 0), Number(nextState._meta?.revision || 0)) + 1,
          updatedAt: new Date().toISOString(),
        };
        Object.assign(state, mergedState);
        await saveCloudState(user, mergedState);
        await saveLocalState(mergedState);
        return;
      }
    } catch {
      // Fallback local para nao perder lancamentos se a nuvem estiver indisponivel.
    }
  }

  await saveLocalState(nextState);
}

export async function storageSummary() {
  if (isCloudConfigured()) {
    const user = await currentUser();
    return user ? "Nuvem Supabase conectada" : "Nuvem configurada: entre na conta";
  }

  if (!navigator.storage?.estimate) return "Banco local ampliado";

  try {
    const estimate = await navigator.storage.estimate();
    const quotaMb = estimate.quota ? Math.round(estimate.quota / 1024 / 1024) : null;
    return quotaMb ? `Banco local ampliado: ate ${quotaMb} MB` : "Banco local ampliado";
  } catch {
    return "Banco local ampliado";
  }
}
