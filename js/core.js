import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getDatabase, ref, get, set, push, update, remove, child, onValue, query,
    orderByKey, orderByChild, startAt, endAt, endBefore, equalTo, limitToLast, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
export {
    ref, get, set, push, update, remove, child, onValue, query,
    orderByKey, orderByChild, startAt, endAt, endBefore, equalTo, limitToLast, runTransaction, serverTimestamp
};

export const firebaseConfig = {
    apiKey: "AIzaSyBFUcSv1olo8r-dglXvij5Sz4aHAgLWBBA",
    authDomain: "new-dashboard-d8b3a.firebaseapp.com",
    databaseURL: "https://new-dashboard-d8b3a-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "new-dashboard-d8b3a",
    storageBucket: "new-dashboard-d8b3a.firebasestorage.app",
    messagingSenderId: "58505489089",
    appId: "1:58505489089:web:bdb7dd49ac84b49c820240"
};
export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// ---------- Config ----------
export const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyfxRkhKOqjNWr1kl1nO3IE6uJ6rfTOWfxxabS5okAQtPxPvk0dwRlB30Og_ez_jqKm/exec";
export const AUTH_EMAIL_DOMAIN = 'dunanetworks.com';      // must match login.html
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const WORK_TZ = 'Europe/Budapest';
export const CURRENCY = 'USD';
export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const LEAVE_ALLOWANCE = { sick: 12, casual: 12, annual: 30 };
export const PAYROLL_RULES = { allowanceRate: 0.10, deductionRate: 0.08 };
export const MOBILE_QUERY = '(max-width: 768px)';
export const PAGE_TITLES = {
    dashboard: 'Dashboard', myday: 'My Day', schedule: 'Schedule', messages: 'Messages', notices: 'Notices',
    employees: 'Employees', departments: 'Departments', attendance: 'Attendance', performance: 'Performance',
    payroll: 'Payroll', leave: 'Leave Management', reports: 'Reports', audit: 'Audit Log', settings: 'Settings'
};

// ---------- Shared state ----------
// role: 'admin' | 'leader' | 'employee'   (main.js upgrades to 'leader' after reading users/<uid>)
// photos: { <photoKey(name)>: dataUrl }   filled by main.js from publicAvatars
export const state = {
    employees: [], departments: [], performance: [], payroll: [], leave: [], profiles: [],
    schedule: {}, masterEmployees: [], employeeLocations: {}, photos: {},
    alerts: { notes: 0, replies: 0, notices: 0 }, noteAlertDates: [], replyAlertMap: {},
    currentUser: { uid: null, name: 'User', role: 'employee', rawRole: 'USER', employeeId: null, employeeKey: null, logType: 'Logs', leaderGroups: [] }
};
export const ui = { searchQuery: '' };
export const charts = {};

// ---------- Tiny event bus (modules talk through it, so there are no circular imports) ----------
const handlers = {};
export const bus = {
    on: (evt, fn) => { (handlers[evt] = handlers[evt] || []).push(fn); },
    emit: (evt, payload) => (handlers[evt] || []).forEach(fn => { try { fn(payload); } catch (e) { console.error(`bus handler for "${evt}" failed`, e); } })
};
bus.on('alerts:changed', () => updateNotifications());

// ---------- Helpers ----------
export const $ = id => document.getElementById(id);
export const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const profileKey = name => encodeURIComponent(name).replace(/\./g, '%2E');
export const photoKey = name => profileKey(String(name || '').trim());

// A person's photo when they have one, otherwise a letter avatar
export const avatar = (name, bg = '4F46E5') =>
    state.photos[photoKey(name)] || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=${bg}&color=fff`;

export const isAdmin = () => state.currentUser.role === 'admin';
export const isLeader = () => state.currentUser.role === 'leader';
export const isManager = () => isAdmin() || isLeader();
export const fullNameOf = e => `${e.firstName || ''} ${e.lastName || ''}`.trim();
export const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
export const findEmployee = id => state.employees.find(e => String(e.id) === String(id));
export const emailFor = id => `${String(id).trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
export const closeModal = id => { const m = $(id); if (m) m.classList.remove('active'); };

// Sets the body class and hides admin-only items. (manager-only items are handled by CSS.)
export function applyRoles() {
    document.body.className = `role-${state.currentUser.role}`;
    document.querySelectorAll('.admin-only').forEach(el => { el.style.display = isAdmin() ? '' : 'none'; });
}

// Turns on hidden UI that belongs to a feature: <el class="soon" data-feature="name">
export function enableFeature(name) {
    document.querySelectorAll(`.soon[data-feature="${name}"]`).forEach(el => el.classList.remove('soon'));
}

// ---------- Preferences (per browser) ----------
const PREF_KEY = 'ems_prefs';
export function getPref(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(PREF_KEY) || '{}')[key]; return v === undefined ? fallback : v; }
    catch (e) { return fallback; }
}
export function setPref(key, value) {
    try { const o = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); o[key] = value; localStorage.setItem(PREF_KEY, JSON.stringify(o)); }
    catch (e) { /* storage not available */ }
}
export function beep() {
    if (!getPref('sound', true)) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880; gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch (e) { /* audio not available */ }
}

// ---------- Server time, always in the work time zone (never the phone's clock) ----------
let serverOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => { serverOffset = Number(s.val()) || 0; });
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: WORK_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: WORK_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const nowMs = () => Date.now() + serverOffset;
export const todayStr = () => dateFmt.format(nowMs());          // YYYY-MM-DD
export const timeNow = () => timeFmt.format(nowMs());           // HH:MM
export const addDays = (dateStr, n) => {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
export const fmtDateTime = ts => ts
    ? new Date(ts).toLocaleString('en-GB', { timeZone: WORK_TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : '...';

// ---------- Audit trail (fails quietly if the rules do not allow it) ----------
export function auditLog(action, details = '') {
    const u = state.currentUser;
    return push(ref(db, 'audit_logs'), {
        ts: serverTimestamp(), user: u.name, eid: u.employeeId || '',
        action, details: String(details).slice(0, 300)
    }).catch(() => {});
}

// ---------- Firebase API wrapper (every create / update / delete is audited) ----------
const AUDIT_SKIP = new Set(['profile_extensions', 'users', 'directory']);
const brief = b => !b ? '' : [
    b.firstName && `${b.firstName} ${b.lastName || ''}`.trim(), b.name, b.title, b.employeeId, b.status
].filter(Boolean).join(' · ').slice(0, 120);

export async function api(endpoint, method = 'GET', body = null) {
    const [path] = endpoint.split('?');
    const parts = path.split('/').filter(Boolean);
    const collection = parts[0];
    const id = parts[1];
    const dbRef = ref(db);
    const clean = body ? JSON.parse(JSON.stringify(body)) : null;   // strips undefined; null removes a key on update
    const audit = (verb, detail) => { if (!AUDIT_SKIP.has(collection)) auditLog(`${verb} ${collection}`, detail); };

    if (method === 'GET') {
        if (id) {
            const snap = await get(child(dbRef, `${collection}/${id}`));
            if (!snap.exists()) throw new Error('Not found');
            return { id, ...snap.val() };
        }
        const snap = await get(child(dbRef, collection));
        if (!snap.exists()) return [];
        const data = snap.val();
        return Object.keys(data).map(key => ({ ...data[key], id: key }));
    }
    if (method === 'POST') {
        const newRef = push(child(dbRef, collection));
        await set(newRef, clean);
        audit('Created', brief(clean));
        return { ...clean, id: newRef.key };
    }
    if (method === 'PUT') {
        await update(child(dbRef, `${collection}/${id}`), clean);
        const snap = await get(child(dbRef, `${collection}/${id}`));
        audit('Updated', `${id} ${brief(clean)}`.trim());
        return { ...snap.val(), id };
    }
    if (method === 'DELETE') {
        await remove(child(dbRef, `${collection}/${id}`));
        audit('Deleted', id);
        return { success: true };
    }
}

// ---------- UI helpers ----------
export function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${esc(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}

// Bell badge: admins see pending leave + employee replies + unread notices; others see notes + unread notices
export function updateNotifications() {
    const el = $('notifCount');
    if (!el) return;
    const a = state.alerts;
    const n = (isAdmin() ? state.leave.filter(l => l.status === 'pending').length + a.replies : a.notes) + (a.notices || 0);
    el.textContent = n;
    el.style.display = n ? '' : 'none';
}

export function showSection(id) {
    const li = document.querySelector(`.menu li[data-section="${id}"]`);
    const denied = li && ((li.classList.contains('admin-only') && !isAdmin()) || (li.classList.contains('manager-only') && !isManager()));
    if (denied) { showToast('You do not have access to this page', 'error'); return; }
    if (li?.classList.contains('soon')) { showToast('This feature is not available yet', 'info'); return; }
    const section = $(id);
    if (!section) return;
    document.querySelectorAll('.menu li').forEach(item => item.classList.toggle('active', item.dataset.section === id));
    $('pageTitle').textContent = PAGE_TITLES[id] || 'Dashboard';
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    section.classList.add('active');
    section.scrollTop = 0;
    document.querySelector('.sidebar').classList.remove('active');
    bus.emit('section', id);
}

// ---------- Formatters ----------
export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(amount) || 0);
}
export function formatDate(s) {
    if (!s) return '-';
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
    const d = new Date(dateOnly ? s + 'T12:00:00Z' : s);
    if (isNaN(d)) return esc(s);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: dateOnly ? 'UTC' : undefined });
}
export const formatEmploymentType = t => ({ 'full-time': 'Full Time', 'part-time': 'Part Time', contract: 'Contract', internship: 'Internship' }[t] || t || 'N/A');
export const formatLeaveType = t => ({ sick: 'Sick Leave', casual: 'Casual Leave', annual: 'Annual Leave', maternity: 'Maternity Leave' }[t] || esc(t));
