import {
    state, bus, db, ref, get, onValue, $, on, avatar, isAdmin, api, closeModal, showSection,
    updateNotifications, applyRoles, enableFeature, auditLog
} from './core.js';
import { initAuth, initAuthUI } from './auth.js';
import { watchTables } from './tables.js';
import { fetchSchedule, initSchedule } from './schedule.js';
import {
    initEmployees, renderEmployees, renderDepartments, renderUsers, updateDropdowns,
    viewEmployee, editEmployee, deleteEmployee, editDepartment, deleteDepartment
} from './employees.js';
import { initAttendance, closeLogModal } from './attendance.js';
import { initChat } from './chat.js';
import { initLeave, renderLeave, approveLeave, rejectLeave } from './leave.js';
import { initPerformance, renderPerformance } from './performance.js';
import { initPayroll, renderPayroll, viewPayslip, processPayment } from './payroll.js';
import { initDashboard, renderDashboard } from './dashboard.js';
import { initReports, generateReport } from './reports.js';
import { initNotifications } from './notifications.js';

// ---------- Functions used by inline onclick="..." in index.html ----------
Object.assign(window, {
    showSection, closeModal, closeLogModal,
    viewEmployee, editEmployee, deleteEmployee, editDepartment, deleteDepartment,
    approveLeave, rejectLeave, viewPayslip, processPayment, generateReport
});

// ---------- Optional feature modules ----------
// Each file may export:  features = ['name', ...]   (data-feature values to switch on)
//                        async init(ctx) -> { windowApi? }   (functions for inline onclick handlers)
// Files that do not exist yet are skipped silently.
const FEATURE_MODULES = ['./notices.js', './leaders.js', './audit.js', './admin.js', './prefs.js'];
const MISSING = /Failed to fetch|Importing a module script failed|error loading dynamically|Load failed/i;

async function loadFeatureModules() {
    for (const file of FEATURE_MODULES) {
        try {
            const mod = await import(file);
            if (typeof mod.init === 'function') {
                const result = await mod.init({ reloadData: initializeData });
                if (result && result.windowApi) Object.assign(window, result.windowApi);
            }
            (mod.features || []).forEach(enableFeature);
        } catch (err) {
            if (!MISSING.test(String(err && err.message))) console.warn(`Feature module ${file} failed:`, err);
        }
    }
}

// ---------- Installable app ----------
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window.__installPrompt = e;
    bus.emit('install:available');
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- Roles ----------
// auth.js only knows admin / employee. Read the raw role so leaders are recognised.
async function upgradeRole() {
    const u = state.currentUser;
    try {
        const p = (await get(ref(db, `users/${u.uid}`))).val() || {};
        u.rawRole = String(p.role || 'USER').toUpperCase();
        const groups = p.leaderGroups ? String(p.leaderGroups).split(',') : Object.keys(p.groups || {});
        u.leaderGroups = groups.map(s => s.trim()).filter(Boolean);
        if (u.rawRole === 'LEADER') u.role = 'leader';
    } catch (err) { console.warn('Could not read the raw role', err); }
}

// ---------- Profile photos ----------
// Loaded before anything is drawn, so lists show photos from the first paint; later changes arrive live.
const toPhotoMap = raw => Object.fromEntries(
    Object.entries(raw || {}).map(([key, v]) => [key, v && v.image]).filter(([, image]) => image)
);

async function loadPhotos() {
    try { state.photos = toPhotoMap((await get(ref(db, 'publicAvatars'))).val()); }
    catch (err) { console.warn('Could not load profile photos', err); }

    let first = true;
    onValue(ref(db, 'publicAvatars'), snap => {
        state.photos = toPhotoMap(snap.val());
        if (first) { first = false; return; }               // the initial callback repeats what we just loaded
        const header = $('headerAvatar');
        if (header) header.src = avatar(state.currentUser.name);
        bus.emit('photos:changed');
        bus.emit('data:changed');                           // redraw lists with the new photos
    }, err => console.warn('publicAvatars', err));
}

// ---------- Data ----------
async function initializeData() {
    const load = async name => {
        try { return await api(`/${name}`); }
        catch (err) { console.error(`Failed to load ${name}:`, err); return []; }
    };
    const loadOwnEmployee = async () => {
        if (!state.currentUser.employeeKey) return [];
        try { return [await api(`/employees/${state.currentUser.employeeKey}`)]; }
        catch (err) { console.error('Failed to load own employee record:', err); return []; }
    };
    const admin = isAdmin();
    const [employees, departments, performance, payroll, leave, profiles] = await Promise.all([
        admin ? load('employees') : loadOwnEmployee(),
        load('departments'),
        admin ? load('performance') : [],
        admin ? load('payroll') : [],
        load('leave'),
        admin ? load('profile_extensions') : []
    ]);
    Object.assign(state, { employees, departments, performance, payroll, leave, profiles });

    updateDropdowns();
    renderLeave();
    if (admin) { renderDashboard(); renderEmployees(); renderDepartments(); renderPerformance(); renderPayroll(); renderUsers(); }
    updateNotifications();
    bus.emit('data:changed');
    fetchSchedule();
}

// ---------- Shell (menu, drawer, modals). The bell is handled by notifications.js ----------
function setupShell() {
    document.querySelectorAll('.menu li').forEach(item => {
        item.addEventListener('click', e => { e.preventDefault(); showSection(item.dataset.section); });
    });
    on('menuToggle', 'click', () => document.querySelector('.sidebar').classList.toggle('active'));
    document.addEventListener('click', e => {
        const sb = document.querySelector('.sidebar');
        if (sb.classList.contains('active') && !e.target.closest('.sidebar') && !e.target.closest('#menuToggle')) sb.classList.remove('active');
    });

    const closeAny = modal => (modal.id === 'logModal' ? closeLogModal() : modal.classList.remove('active'));
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeAny(m); }));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') document.querySelectorAll('.modal.active').forEach(closeAny);
    });
}

// ---------- Start ----------
async function startApp() {
    localStorage.removeItem('duna_user');           // leftovers from the old login
    await upgradeRole();
    await loadPhotos();                             // before any avatar is drawn
    const u = state.currentUser;
    $('currentUserEmail').textContent = u.name;
    $('headerAvatar').src = avatar(u.name);
    applyRoles();

    initAuthUI();
    setupShell();
    initEmployees();
    initSchedule();
    initAttendance();       // must come before showSection so its section hook is registered
    initChat();
    initLeave();
    initPerformance();
    initPayroll();
    initDashboard();
    initReports();
    initNotifications();    // after chat / leave / attendance, it reads what they publish in state
    watchTables();

    initializeData();
    showSection(isAdmin() ? 'dashboard' : 'myday');

    await loadFeatureModules();

    if (!sessionStorage.getItem('ems_signed_in')) {
        sessionStorage.setItem('ems_signed_in', '1');
        auditLog('Signed in', `${u.rawRole} on ${navigator.userAgent.slice(0, 80)}`);
    }
}

initAuth(startApp);
