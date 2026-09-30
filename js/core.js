import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, get, set, push, update, remove, child, onValue, query, orderByKey, startAt, endAt, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
export { ref, get, set, push, update, remove, child, onValue, query, orderByKey, startAt, endAt, serverTimestamp };

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
export const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
export const LEAVE_ALLOWANCE = { sick: 12, casual: 12, annual: 30 };
export const PAYROLL_RULES = { allowanceRate: 0.10, deductionRate: 0.08 };
export const MOBILE_QUERY = '(max-width: 768px)';
export const PAGE_TITLES = {
    dashboard: 'Dashboard', myday: 'My Day', schedule: 'Schedule', employees: 'Employees',
    departments: 'Departments', attendance: 'Attendance', performance: 'Performance',
    payroll: 'Payroll', leave: 'Leave Management', reports: 'Reports', settings: 'Settings'
};

// ---------- Shared state ----------
export const state = {
    employees: [], departments: [], performance: [], payroll: [], leave: [], profiles: [],
    schedule: {}, masterEmployees: [], employeeLocations: {},
    alerts: { notes: 0, replies: 0 }, noteAlertDates: [], replyAlertMap: {},
    currentUser: { uid: null, name: 'User', role: 'employee', employeeId: null, employeeKey: null, logType: 'Logs' }
};
export const ui = { searchQuery: '' };
export const charts = {};

// ---------- Tiny event bus (modules talk through it, so there are no circular imports) ----------
const handlers = {};
export const bus = {
    on: (evt, fn) => { (handlers[evt] = handlers[evt] || []).push(fn); },
    emit: (evt, payload) => (handlers[evt] || []).forEach(fn => fn(payload))
};

// ---------- Helpers ----------
export const $ = id => document.getElementById(id);
export const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const avatar = (name, bg = '4F46E5') => `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=${bg}&color=fff`;
export const isAdmin = () => state.currentUser.role === 'admin';
export const fullNameOf = e => `${e.firstName || ''} ${e.lastName || ''}`.trim();
export const profileKey = name => encodeURIComponent(name).replace(/\./g, '%2E');
export const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
export const findEmployee = id => state.employees.find(e => String(e.id) === String(id));
export const emailFor = id => `${String(id).trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
export const closeModal = id => $(id).classList.remove('active');

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

// ---------- Firebase API wrapper ----------
export async function api(endpoint, method = 'GET', body = null) {
    const [path] = endpoint.split('?');
    const parts = path.split('/').filter(Boolean);
    const collection = parts[0];
    const id = parts[1];
    const dbRef = ref(db);
    const clean = body ? JSON.parse(JSON.stringify(body)) : null;   // strips undefined; null removes a key on update

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
        return { ...clean, id: newRef.key };
    }
    if (method === 'PUT') {
        await update(child(dbRef, `${collection}/${id}`), clean);
        const snap = await get(child(dbRef, `${collection}/${id}`));
        return { ...snap.val(), id };
    }
    if (method === 'DELETE') {
        await remove(child(dbRef, `${collection}/${id}`));
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

export function updateNotifications() {
    const el = $('notifCount');
    if (!el) return;
    const n = isAdmin()
        ? state.leave.filter(l => l.status === 'pending').length + state.alerts.replies
        : state.alerts.notes;
    el.textContent = n;
    el.style.display = n ? '' : 'none';
}

export function showSection(id) {
    const li = document.querySelector(`.menu li[data-section="${id}"]`);
    if (li?.classList.contains('admin-only') && !isAdmin()) {
        showToast('You do not have access to this page', 'error');
        return;
    }
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
