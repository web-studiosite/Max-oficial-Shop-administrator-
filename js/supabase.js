/* ============================================
   SUPABASE CONFIGURATION & HELPERS
   Official Shop Administration ERP
   ============================================ */

// ── Configuration ─────────────────────────
const SUPABASE_URL = 'https://xkckgzxtsiwoqqvopnkn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_juqKcXrT73-MdSf0qERjyQ_g1GHZoGQ';

// ── Supabase Client ────────────────────────
let supabase = null;

function initSupabase() {
  if (!supabase && typeof createClient !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    });
  }
  return supabase;
}

function getSupabase() {
  if (!supabase) initSupabase();
  return supabase;
}

// ── Auth Helpers ───────────────────────────
async function signIn(email, password) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signUp(email, password, userData) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: userData }
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  const sb = getSupabase();
  await sb.auth.signOut();
  localStorage.removeItem('currentUser');
  sessionStorage.removeItem('cashierOpen');
  window.location.href = 'index.html';
}

async function getCurrentUser() {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb.from('users').select('*').eq('id', user.id).single();
  if (profile) {
    localStorage.setItem('currentUser', JSON.stringify(profile));
    return profile;
  }
  return { id: user.id, email: user.email, name: user.email, role: 'cashier' };
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('currentUser'));
  } catch { return null; }
}

function hasRole(role) {
  const user = getStoredUser();
  return user && user.role === role;
}

function requireAuth() {
  const user = getStoredUser();
  if (!user) {
    window.location.href = 'index.html';
    return false;
  }
  return user;
}

function requireAdmin() {
  const user = requireAuth();
  if (!user) return false;
  if (user.role !== 'admin' && user.role !== 'junior_admin') {
    window.location.href = 'index.html';
    return false;
  }
  return user;
}

function requireCashier() {
  const user = requireAuth();
  if (!user) return false;
  if (user.role !== 'cashier' && user.role !== 'admin' && user.role !== 'junior_admin') {
    window.location.href = 'index.html';
    return false;
  }
  return user;
}

// ── Generic CRUD ───────────────────────────
async function fetchAll(table, options = {}) {
  const sb = getSupabase();
  let query = sb.from(table).select(options.select || '*');
  if (options.eq) query = query.eq(options.eq.column, options.eq.value);
  if (options.order) query = query.order(options.order.column, { ascending: options.order.ascending ?? false });
  if (options.limit) query = query.limit(options.limit);
  if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchById(table, id) {
  const sb = getSupabase();
  const { data, error } = await sb.from(table).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function insertRecord(table, record) {
  const sb = getSupabase();
  const { data, error } = await sb.from(table).insert(record).select().single();
  if (error) throw error;
  return data;
}

async function updateRecord(table, id, record) {
  const sb = getSupabase();
  const { data, error } = await sb.from(table).update(record).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteRecord(table, id) {
  const sb = getSupabase();
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
}

// ── Realtime Subscriptions ─────────────────
function subscribeToTable(table, callback) {
  const sb = getSupabase();
  return sb.channel(`${table}_changes`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
}

// ── Audit Log ──────────────────────────────
async function logAudit(action, tableName, beforeData, afterData) {
  const user = getStoredUser();
  try {
    await insertRecord('audit_logs', {
      user_id: user?.id || null,
      action,
      table_name: tableName,
      before_data: beforeData ? JSON.stringify(beforeData) : null,
      after_data: afterData ? JSON.stringify(afterData) : null
    });
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// ── Offline Queue ──────────────────────────
const OFFLINE_QUEUE_KEY = 'offline_queue';

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)) || [];
  } catch { return []; }
}

function addToOfflineQueue(operation) {
  const queue = getOfflineQueue();
  queue.push({ ...operation, timestamp: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async function syncOfflineQueue() {
  const queue = getOfflineQueue();
  if (!queue.length) return;
  const sb = getSupabase();
  for (const op of queue) {
    try {
      if (op.type === 'insert') {
        await sb.from(op.table).insert(op.record);
      } else if (op.type === 'update') {
        await sb.from(op.table).update(op.record).eq('id', op.id);
      } else if (op.type === 'delete') {
        await sb.from(op.table).delete().eq('id', op.id);
      }
    } catch (e) {
      console.error('Sync error:', e);
    }
  }
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
  showToast('info', `${queue.length} operações sincronizadas`);
}

function isOnline() {
  return navigator.onLine;
}

// ── Export ─────────────────────────────────
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_KEY = SUPABASE_KEY;
window.initSupabase = initSupabase;
window.getSupabase = getSupabase;
window.signIn = signIn;
window.signUp = signUp;
window.signOut = signOut;
window.getCurrentUser = getCurrentUser;
window.getStoredUser = getStoredUser;
window.hasRole = hasRole;
window.requireAuth = requireAuth;
window.requireAdmin = requireAdmin;
window.requireCashier = requireCashier;
window.fetchAll = fetchAll;
window.fetchById = fetchById;
window.insertRecord = insertRecord;
window.updateRecord = updateRecord;
window.deleteRecord = deleteRecord;
window.subscribeToTable = subscribeToTable;
window.logAudit = logAudit;
window.getOfflineQueue = getOfflineQueue;
window.addToOfflineQueue = addToOfflineQueue;
window.syncOfflineQueue = syncOfflineQueue;
window.isOnline = isOnline;
