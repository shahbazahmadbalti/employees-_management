import {
    state, bus, $, on, avatar, isAdmin, api, showToast, closeModal, showSection, updateNotifications
} from './core.js';
import { initAuth, initAuthUI, applyRole } from './auth.js';
import { watchTables } from './tables.js';
import { fetchSchedule, initSchedule } from './schedule.js';
import {
    initEmployees, renderEmployees, renderDepartments, renderUsers, updateDropdowns,
    viewEmployee, editEmployee, deleteEmployee, editDepartment, deleteDepartment
} from './employees.js';
import { initAttendance, closeLogModal } from './attendance.js';
import { initLeave, renderLeave, approveLeave, rejectLeave } from './leave.js';
import { initPerformance, renderPerformance } from './performance.js';
import { initPayroll, renderPayroll, viewPayslip, processPayment } from './payroll.js';
import { initDashboard, renderDashboard } from './dashboard.js';
import { initReports, generateReport } from './reports.js';

// ---------- Functions used by inline onclick="..." in index.html ----------
Object.assign(window, {
    showSection, closeModal, closeLogModal,
    viewEmployee, editEmployee, deleteEmployee, editDepartment, deleteDepartment,
    approveLeave, rejectLeave, viewPayslip, processPayment, generateReport
});

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

function setupShell() {
    document.querySelectorAll('.menu li').forEach(item => {
        item.addEventListener('click', e => { e.preventDefault(); showSection(item.dataset.section); });
    });
    on('menuToggle', 'click', () => document.querySelector('.sidebar').classList.toggle('active'));
    document.addEventListener('click', e => {
        const sb = document.querySelector('.sidebar');
        if (sb.classList.contains('active') && !e.target.closest('.sidebar') && !e.target.closest('#menuToggle')) sb.classList.remove('active');
    });

    on('notifications', 'click', () => {
        if (isAdmin()) showSection(state.alerts.replies > 0 ? 'attendance' : 'leave');
        else showSection('myday');
    });

    const closeAny = modal => (modal.id === 'logModal' ? closeLogModal() : modal.classList.remove('active'));
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeAny(m); }));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') document.querySelectorAll('.modal.active').forEach(closeAny);
    });
}

function startApp() {
    localStorage.removeItem('duna_user');   // leftovers from the old login
    const u = state.currentUser;
    $('currentUserEmail').textContent = u.name;
    $('headerAvatar').src = avatar(u.name);
    applyRole();

    initAuthUI();
    setupShell();
    initEmployees();
    initSchedule();
    initAttendance();      // must come before showSection so its section hook is registered
    initLeave();
    initPerformance();
    initPayroll();
    initDashboard();
    initReports();
    watchTables();

    initializeData();
    showSection(isAdmin() ? 'dashboard' : 'myday');
}

initAuth(startApp);
