import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, get, set, push, update, remove, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
    getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword,
    EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBFUcSv1olo8r-dglXvij5Sz4aHAgLWBBA",
    authDomain: "new-dashboard-d8b3a.firebaseapp.com",
    databaseURL: "https://new-dashboard-d8b3a-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "new-dashboard-d8b3a",
    storageBucket: "new-dashboard-d8b3a.firebasestorage.app",
    messagingSenderId: "58505489089",
    appId: "1:58505489089:web:bdb7dd49ac84b49c820240"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyfxRkhKOqjNWr1kl1nO3IE6uJ6rfTOWfxxabS5okAQtPxPvk0dwRlB30Og_ez_jqKm/exec";

// ==================== Config ====================
const AUTH_EMAIL_DOMAIN = 'employees.duna-networks.app';   // must match login.html
const ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const CURRENCY = 'USD';
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const LEAVE_ALLOWANCE = { sick: 12, casual: 12, annual: 30 };
const PAYROLL_RULES = { allowanceRate: 0.10, deductionRate: 0.08 };
const MOBILE_QUERY = '(max-width: 768px)';
const SCHEDULE_COLORS = {
    FA: ['#bfdbfe', '#1e40af'],
    P2: ['#bbf7d0', '#166534'],
    AD: ['#fed7aa', '#9a3412'],
    DEFAULT: ['#c7d2fe', '#3730a3']
};
const PAGE_TITLES = {
    dashboard: 'Dashboard', schedule: 'Schedule', employees: 'Employees', departments: 'Departments',
    attendance: 'Attendance', performance: 'Performance', payroll: 'Payroll',
    leave: 'Leave Management', reports: 'Reports', settings: 'Settings'
};

const state = {
    employees: [],
    departments: [],
    attendance: [],
    performance: [],
    payroll: [],
    leave: [],
    profiles: [],
    schedule: {},
    masterEmployees: [],
    employeeLocations: {},
    currentUser: { uid: null, name: 'User', role: 'employee', employeeId: null, employeeKey: null }
};
const ui = { searchQuery: '' };
const charts = {};

// ==================== Small helpers ====================
const $ = id => document.getElementById(id);
const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avatar = (name, bg = '4F46E5') => `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=${bg}&color=fff`;
const isAdmin = () => state.currentUser.role === 'admin';
const fullNameOf = e => `${e.firstName || ''} ${e.lastName || ''}`.trim();
const profileKey = name => encodeURIComponent(name).replace(/\./g, '%2E');
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const todayStr = () => new Date().toISOString().slice(0, 10);
const findEmployee = id => state.employees.find(e => String(e.id) === String(id));
const emailFor = id => `${String(id).trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;

// ==================== Firebase API Wrapper ====================
async function api(endpoint, method = 'GET', body = null) {
    const [path] = endpoint.split('?');
    const pathParts = path.split('/').filter(Boolean);
    const collection = pathParts[0];
    const id = pathParts[1];
    const dbRef = ref(db);
    const clean = body ? JSON.parse(JSON.stringify(body)) : null;   // strips undefined; null removes a key on update

    if (method === 'GET') {
        if (id) {
            const snapshot = await get(child(dbRef, `${collection}/${id}`));
            if (!snapshot.exists()) throw new Error('Not found');
            return { id, ...snapshot.val() };
        }
        const snapshot = await get(child(dbRef, collection));
        if (!snapshot.exists()) return [];
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ ...data[key], id: key }));
    }
    if (method === 'POST') {
        const newRef = push(child(dbRef, collection));
        await set(newRef, clean);
        return { ...clean, id: newRef.key };
    }
    if (method === 'PUT') {
        await update(child(dbRef, `${collection}/${id}`), clean);
        const snapshot = await get(child(dbRef, `${collection}/${id}`));
        return { ...snapshot.val(), id };
    }
    if (method === 'DELETE') {
        await remove(child(dbRef, `${collection}/${id}`));
        return { success: true };
    }
}

// ==================== Authentication ====================
let started = false;

async function rejectSession(key) {
    sessionStorage.setItem('duna_login_notice', key);
    try { await signOut(auth); } catch (e) { /* ignore */ }
    window.location.href = 'login.html';
}

onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = 'login.html'; return; }
    if (started) return;
    try {
        const snap = await get(ref(db, `users/${user.uid}`));
        const profile = snap.val();
        if (!profile) { await rejectSession('errNoProfile'); return; }
        if (profile.status && profile.status !== 'active') { await rejectSession('errInactive'); return; }
        started = true;
        startApp(user, profile);
    } catch (err) {
        console.error('Could not load user profile:', err);
        await rejectSession('errFailed');
    }
});

function startApp(user, profile) {
    localStorage.removeItem('duna_user');   // leftovers from the old login

    state.currentUser = {
        uid: user.uid,
        name: profile.name || user.email,
        role: String(profile.role).toUpperCase() === 'ADMIN' ? 'admin' : 'employee',
        employeeId: profile.employeeId || null,
        employeeKey: profile.employeeKey || null
    };

    $('currentUserEmail').textContent = state.currentUser.name;
    $('headerAvatar').src = avatar(state.currentUser.name);
    applyRole();

    on('logoutBtn', 'click', async () => {
        try { await signOut(auth); } catch (e) { /* ignore */ }
        window.location.href = 'login.html';
    });

    const now = new Date();
    $('attendanceDate').value = todayStr();
    $('schedMonth').value = MONTHS[now.getMonth()];
    $('schedYear').value = String(now.getFullYear());

    setupEventListeners();
    watchTables();
    loadSettings();
    initializeData();
}

function applyRole() {
    document.body.className = `role-${state.currentUser.role}`;
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin() ? '' : 'none';
    });
}

// Creates a login for an employee without signing the admin out (uses a second app instance)
let secondaryAuth = null;
function getSecondaryAuth() {
    if (!secondaryAuth) secondaryAuth = getAuth(initializeApp(firebaseConfig, 'secondary'));
    return secondaryAuth;
}
async function createLogin(employeeId, password) {
    const sa = getSecondaryAuth();
    const cred = await createUserWithEmailAndPassword(sa, emailFor(employeeId), password);
    await signOut(sa);
    return cred.user.uid;
}

function authErrorMessage(err) {
    const map = {
        'auth/email-already-in-use': 'A login for this Employee ID already exists. Delete it in Firebase Console > Authentication, or use another Employee ID.',
        'auth/weak-password': 'Password is too weak (minimum 6 characters).',
        'auth/operation-not-allowed': 'Enable Email/Password sign-in in Firebase Authentication.',
        'auth/invalid-credential': 'Current password is incorrect.',
        'auth/wrong-password': 'Current password is incorrect.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/requires-recent-login': 'Please sign out and sign in again, then retry.',
        'auth/network-request-failed': 'Network error. Check your connection.'
    };
    return map[err && err.code] || (err && err.message) || 'Unknown error';
}

// ==================== Data loading ====================
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

    const [employees, departments, attendance, performance, payroll, leave, profiles] = await Promise.all([
        admin ? load('employees') : loadOwnEmployee(),
        load('departments'),
        load('attendance'),
        admin ? load('performance') : [],
        admin ? load('payroll') : [],
        load('leave'),
        admin ? load('profile_extensions') : []
    ]);

    Object.assign(state, { employees, departments, attendance, performance, payroll, leave, profiles });
    renderAll();
    fetchSchedule();
}

function renderAll() {
    updateDropdowns();
    renderAttendance();
    renderLeave();
    if (isAdmin()) {
        renderDashboard();
        renderEmployees();
        renderDepartments();
        renderPerformance();
        renderPayroll();
        renderUsers();
    }
    updateNotifications();
}

// ==================== Mobile tables: labels + tap-to-expand ====================
function watchTables() {
    const PRIMARY_HEADS = ['Status', 'Score', 'Net Salary'];

    const label = () => {
        document.querySelectorAll('.data-table:not(.schedule-grid)').forEach(table => {
            const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
            table.querySelectorAll('tbody tr').forEach(tr => {
                const cells = [...tr.children];
                if (!cells.length || cells[0].hasAttribute('colspan')) return;

                let hasPrimary = false;
                cells.forEach((td, i) => {
                    if (heads[i]) td.dataset.label = heads[i];
                    if (td.querySelector('.user-info') || PRIMARY_HEADS.includes(heads[i])) {
                        td.dataset.primary = '1';
                        hasPrimary = true;
                    } else {
                        delete td.dataset.primary;
                    }
                });
                if (!hasPrimary && cells[1]) cells[1].dataset.primary = '1';
                tr.classList.add('collapsible');
            });
        });
    };

    document.querySelectorAll('.data-table:not(.schedule-grid) tbody').forEach(tb => {
        new MutationObserver(label).observe(tb, { childList: true });
    });
    label();

    document.addEventListener('click', e => {
        if (!window.matchMedia(MOBILE_QUERY).matches) return;
        const tr = e.target.closest('.data-table:not(.schedule-grid) tbody tr.collapsible');
        if (!tr || e.target.closest('button, a, input, select, label')) return;

        const wasOpen = tr.classList.contains('open');
        tr.closest('tbody').querySelectorAll('tr.open').forEach(r => r.classList.remove('open'));
        if (!wasOpen) tr.classList.add('open');
    });
}

// ==================== Schedule (Google Sheets) ====================
async function fetchSchedule() {
    const loading = $('scheduleLoading');
    const table = $('scheduleTable');
    try {
        loading.style.display = 'block';
        loading.textContent = 'Loading schedule data from Google Sheets...';
        table.style.display = 'none';

        const response = await fetch(GOOGLE_SCRIPT_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        state.schedule = data.schedule || {};
        state.masterEmployees = data.employees || [];
        state.employeeLocations = data.employeeLocations || {};

        populateScheduleFilters();
        renderSchedule();
    } catch (err) {
        console.error('Failed to fetch schedule', err);
        loading.style.display = 'block';
        loading.textContent = 'Failed to load schedule. Click "Refresh Schedule" to retry.';
    }
}

function populateScheduleFilters() {
    const locSel = $('schedLocation');
    const empSel = $('schedEmployee');
    const prevLoc = locSel.value || 'All';
    const prevEmp = empSel.value || 'All';

    const locations = [...new Set(Object.values(state.employeeLocations || {}).flat().filter(Boolean))].sort();
    let names = (state.masterEmployees || []).map(e => (typeof e === 'string' ? e : e?.name)).filter(Boolean);
    if (!names.length) names = Object.keys(state.schedule);
    names = [...new Set(names)].sort();
    if (!isAdmin()) names = names.filter(n => sameName(n, state.currentUser.name));

    locSel.innerHTML = '<option value="All">All</option>' + locations.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    empSel.innerHTML = '<option value="All">All</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    locSel.value = locations.includes(prevLoc) ? prevLoc : 'All';
    empSel.value = names.includes(prevEmp) ? prevEmp : 'All';
}

function renderSchedule() {
    $('scheduleLoading').style.display = 'none';
    $('scheduleTable').style.display = 'table';

    const tbody = $('scheduleBody');
    const theadRow = $('scheduleHead').querySelector('tr');
    const selMonth = $('schedMonth').value;
    const selYear = $('schedYear').value;
    const selLoc = $('schedLocation').value;
    const selEmp = $('schedEmployee').value;
    const daysInMonth = new Date(Number(selYear), MONTHS.indexOf(selMonth) + 1, 0).getDate();

    let headers = '<th style="position: sticky; left: 0; background: #f8fafc; z-index: 2; width: 150px; text-align: left;">EMPLOYEE NAME</th>';
    for (let i = 1; i <= daysInMonth; i++) headers += `<th style="text-align: center;">${i}</th>`;
    headers += '<th style="text-align: center; width: 80px;">TOTAL HOURS</th>';
    theadRow.innerHTML = headers;

    let names = Object.keys(state.schedule || {});
    if (!isAdmin()) names = names.filter(n => sameName(n, state.currentUser.name));
    if (selEmp !== 'All') names = names.filter(n => n === selEmp);
    if (selLoc !== 'All') {
        names = names.filter(n => [].concat(state.employeeLocations?.[n] || []).includes(selLoc));
    }

    if (!names.length) {
        tbody.innerHTML = `<tr><td colspan="${daysInMonth + 2}" style="text-align: center; padding: 16px;">No schedule data available</td></tr>`;
        return;
    }

    tbody.innerHTML = names.map(name => {
        let totalHrs = 0;
        let cells = '';
        const empSchedule = state.schedule[name]?.[selYear]?.[selMonth] || {};

        for (let i = 1; i <= daysInMonth; i++) {
            const d = empSchedule[i];
            if (d && d.area) {
                const label = String(d.area);
                const [bg, fg] = label.includes('FA') ? SCHEDULE_COLORS.FA
                    : label.includes('P2') ? SCHEDULE_COLORS.P2
                    : label.includes('AD') ? SCHEDULE_COLORS.AD
                    : SCHEDULE_COLORS.DEFAULT;
                cells += `<td style="padding: 2px;"><div style="font-size: 10px; font-weight: bold; border-radius: 4px; padding: 4px; text-align: center; white-space: nowrap; background: ${bg}; color: ${fg};">${esc(label)}</div></td>`;
                totalHrs += Number(d.hours) > 0 ? Number(d.hours) : 8;
            } else {
                cells += '<td></td>';
            }
        }

        return `
            <tr>
                <td style="position: sticky; left: 0; background: white; z-index: 1; font-weight: 500; text-transform: uppercase;">${esc(name)}</td>
                ${cells}
                <td style="text-align: center; font-weight: bold;">${totalHrs || '-'}</td>
            </tr>`;
    }).join('');
}

// ==================== Event Listeners ====================
function setupEventListeners() {
    document.querySelectorAll('.menu li').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            showSection(item.dataset.section);
        });
    });

    on('menuToggle', 'click', () => document.querySelector('.sidebar').classList.toggle('active'));

    document.addEventListener('click', e => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar.classList.contains('active') && !e.target.closest('.sidebar') && !e.target.closest('#menuToggle')) {
            sidebar.classList.remove('active');
        }
    });

    on('addEmployeeBtn', 'click', () => openEmployeeModal());
    on('addDepartmentBtn', 'click', () => openDepartmentModal());
    on('markAttendanceBtn', 'click', () => openAttendanceModal());
    on('addReviewBtn', 'click', () => openReviewModal());
    on('requestLeaveBtn', 'click', () => openLeaveModal());
    on('generatePayrollBtn', 'click', generatePayroll);
    on('refreshScheduleBtn', 'click', fetchSchedule);
    on('changePasswordBtn', 'click', openPasswordModal);

    on('employeeForm', 'submit', e => { e.preventDefault(); saveEmployee(); });
    on('departmentForm', 'submit', e => { e.preventDefault(); saveDepartment(); });
    on('attendanceForm', 'submit', e => { e.preventDefault(); saveAttendance(); });
    on('leaveForm', 'submit', e => { e.preventDefault(); saveLeave(); });
    on('reviewForm', 'submit', e => { e.preventDefault(); saveReview(); });
    on('passwordForm', 'submit', e => { e.preventDefault(); savePassword(); });
    on('companySettingsForm', 'submit', e => { e.preventDefault(); saveSettings(); });

    on('selectAll', 'change', function () {
        document.querySelectorAll('#employeesTable tbody input[type="checkbox"]').forEach(cb => { cb.checked = this.checked; });
    });

    on('departmentFilter', 'change', renderEmployees);
    on('statusFilter', 'change', renderEmployees);
    on('globalSearch', 'input', handleGlobalSearch);
    on('departmentSearch', 'input', renderDepartments);

    on('attendanceDate', 'change', renderAttendance);
    on('attendancePeriod', 'change', renderAttendanceChart);
    on('performancePeriod', 'change', renderPerformance);
    on('performanceDepartment', 'change', renderPerformance);
    on('payrollMonth', 'change', renderPayroll);
    on('payrollDepartment', 'change', renderPayroll);
    on('leaveStatus', 'change', renderLeave);
    on('leaveType', 'change', renderLeave);

    ['schedMonth', 'schedYear', 'schedLocation', 'schedEmployee'].forEach(id => on(id, 'change', renderSchedule));

    on('notifications', 'click', () => {
        const pending = state.leave.filter(l => l.status === 'pending').length;
        showToast(`${pending} pending leave request(s)`, 'info');
    });

    on('exportDataBtn', 'click', exportData);
    on('backupDataBtn', 'click', exportData);
    on('clearCacheBtn', 'click', () => {
        localStorage.removeItem('ems_settings');
        showToast('Cache cleared. Reloading data...', 'success');
        initializeData();
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    });
}

// ==================== Navigation ====================
function showSection(sectionId) {
    const menuItem = document.querySelector(`.menu li[data-section="${sectionId}"]`);
    if (menuItem?.classList.contains('admin-only') && !isAdmin()) {
        showToast('You do not have access to this page', 'error');
        return;
    }
    const section = $(sectionId);
    if (!section) return;

    document.querySelectorAll('.menu li').forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
    });
    $('pageTitle').textContent = PAGE_TITLES[sectionId] || 'Dashboard';
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    section.classList.add('active');
    section.scrollTop = 0;
    document.querySelector('.sidebar').classList.remove('active');

    if (sectionId === 'dashboard' && isAdmin()) renderAttendanceChart();
    if (sectionId === 'performance') renderPerformance();
}

// ==================== Modals ====================
function closeModal(modalId) {
    $(modalId).classList.remove('active');
}

async function openEmployeeModal(employee = null) {
    const modal = $('employeeModal');
    const form = $('employeeForm');
    const F = form.elements;
    const hint = $('passwordHint');
    updateDropdowns();

    if (employee) {
        $('employeeModalTitle').textContent = 'Edit Employee';
        form.dataset.editId = employee.id;
        form.dataset.oldName = fullNameOf(employee);
        F.firstName.value = employee.firstName || '';
        F.lastName.value = employee.lastName || '';
        F.email.value = employee.email || '';
        F.phone.value = employee.phone || '';
        F.department.value = employee.department || '';
        F.position.value = employee.position || '';
        F.employeeId.value = employee.employeeId || '';
        F.employeeId.readOnly = !!employee.uid;     // the login is tied to the ID once it exists
        F.joinDate.value = employee.joinDate || '';
        F.employmentType.value = employee.employmentType || 'full-time';
        F.salary.value = employee.salary ?? '';
        F.address.value = employee.address || '';
        F.status.value = employee.status || 'active';

        F.password.value = '';
        F.password.required = false;
        if (employee.uid) {
            F.password.disabled = true;
            F.password.placeholder = 'Managed by the employee';
            if (hint) hint.textContent = 'The employee changes their own password with the key icon in the header.';
        } else {
            F.password.disabled = false;
            F.password.placeholder = "Set a password to create this employee's login";
            if (hint) hint.textContent = 'This employee has no login yet. Enter a password (min 6 characters) to create one.';
        }

        try {
            const profile = await api(`/profile_extensions/${profileKey(fullNameOf(employee))}`);
            F.role.value = profile.role || 'USER';
            F.location.value = profile.location || 'General';
            F.logType.value = profile.logType || 'Logs';
            F.bio.value = profile.bio || '';
        } catch (e) {
            console.log('No profile extension found for this user');
        }
    } else {
        $('employeeModalTitle').textContent = 'Add New Employee';
        delete form.dataset.editId;
        delete form.dataset.oldName;
        form.reset();
        F.employeeId.readOnly = false;
        F.password.disabled = false;
        F.password.required = true;
        F.password.placeholder = 'Set a login password';
        if (hint) hint.textContent = 'Login: Employee ID + this password (min 6 characters).';
    }
    modal.classList.add('active');
}

function openDepartmentModal(department = null) {
    const form = $('departmentForm');
    const F = form.elements;
    updateDropdowns();

    if (department) {
        $('departmentModalTitle').textContent = 'Edit Department';
        form.dataset.editId = department.id;
        F.name.value = department.name || '';
        F.code.value = department.code || '';
        F.head.value = department.head || '';
        F.description.value = department.description || '';
        F.budget.value = department.budget ?? '';
    } else {
        $('departmentModalTitle').textContent = 'Add New Department';
        delete form.dataset.editId;
        form.reset();
    }
    $('departmentModal').classList.add('active');
}

function openEmployeeDetails(employee) {
    const name = fullNameOf(employee);
    $('detailImage').src = avatar(name);
    $('detailName').textContent = name;
    $('detailPosition').textContent = employee.position || '';
    $('detailDepartment').textContent = employee.department || '';
    $('detailEmail').textContent = employee.email || 'N/A';
    $('detailPhone').textContent = employee.phone || 'N/A';
    $('detailId').textContent = employee.employeeId || 'N/A';
    $('detailJoinDate').textContent = formatDate(employee.joinDate);
    $('detailType').textContent = formatEmploymentType(employee.employmentType);
    $('detailSalary').textContent = formatCurrency(employee.salary);
    $('detailAddress').textContent = employee.address || 'N/A';
    $('detailStatus').innerHTML = `<span class="status-badge ${esc(employee.status)}">${esc(employee.status)}</span>`;
    $('employeeDetailsModal').classList.add('active');
}

// ==================== Change own password ====================
function openPasswordModal() {
    $('passwordForm').reset();
    $('passwordModal').classList.add('active');
}

async function savePassword() {
    const F = $('passwordForm').elements;
    const current = F.currentPassword.value;
    const next = F.newPassword.value;
    const confirmPw = F.confirmPassword.value;

    if (next.length < 6) { showToast('New password must be at least 6 characters', 'error'); return; }
    if (next !== confirmPw) { showToast('New passwords do not match', 'error'); return; }
    if (next === current) { showToast('New password must be different', 'error'); return; }

    const user = auth.currentUser;
    if (!user) { showToast('Please sign in again', 'error'); return; }

    try {
        const credential = EmailAuthProvider.credential(user.email, current);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, next);
        closeModal('passwordModal');
        showToast('Password updated successfully!', 'success');
    } catch (err) {
        showToast(authErrorMessage(err), 'error');
    }
}

// ==================== Dashboard ====================
function renderDashboard() {
    const today = todayStr();
    const todays = state.attendance.filter(a => !a.date || a.date === today);
    const present = todays.filter(a => a.status === 'present' || a.status === 'late').length;
    const active = state.employees.filter(e => e.status === 'active').length;

    $('totalEmployees').textContent = state.employees.length;
    $('activeEmployeesInfo').textContent = `${active} active`;
    $('presentToday').textContent = present;
    $('attendanceRate').textContent = `${state.employees.length ? Math.round((present / state.employees.length) * 100) : 0}% attendance`;
    $('onLeave').textContent = state.leave.filter(l => l.status === 'approved' && l.fromDate <= today && l.toDate >= today).length;
    $('pendingLeaves').textContent = `${state.leave.filter(l => l.status === 'pending').length} pending requests`;
    $('totalDepartments').textContent = state.departments.length;

    const recent = [...state.employees].sort((a, b) => String(b.joinDate).localeCompare(String(a.joinDate))).slice(0, 5);
    $('recentEmployeesTable').querySelector('tbody').innerHTML = recent.map(emp => `
        <tr>
            <td><div class="user-info"><img src="${avatar(fullNameOf(emp))}" alt=""><span>${esc(fullNameOf(emp))}</span></div></td>
            <td>${esc(emp.department)}</td>
            <td>${esc(emp.position)}</td>
            <td><span class="status-badge ${esc(emp.status)}">${esc(emp.status)}</span></td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">No employees yet</td></tr>';

    renderAttendanceChart();
}

function makeChart(key, canvasId, config) {
    const canvas = $(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(canvas, config);
}

function renderAttendanceChart() {
    const days = $('attendancePeriod').value === 'month' ? 30 : 7;
    const since = new Date(); since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const rows = state.attendance.filter(a => !a.date || a.date >= sinceStr);
    const count = s => rows.filter(a => a.status === s).length;

    makeChart('attendance', 'attendanceCanvas', {
        type: 'bar',
        data: {
            labels: ['Present', 'Late', 'Absent'],
            datasets: [{ label: 'Records', data: [count('present'), count('late'), count('absent')], backgroundColor: ['#10B981', '#F59E0B', '#EF4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

// ==================== Employees ====================
function renderEmployees() {
    const dept = $('departmentFilter').value;
    const status = $('statusFilter').value;
    const q = ui.searchQuery;
    const tbody = $('employeesTable').querySelector('tbody');
    $('selectAll').checked = false;

    let list = state.employees;
    if (dept) list = list.filter(e => e.department === dept);
    if (status) list = list.filter(e => e.status === status);
    if (q) {
        list = list.filter(e => [e.firstName, e.lastName, e.email, e.employeeId].some(v => String(v || '').toLowerCase().includes(q)));
    }

    tbody.innerHTML = list.map(emp => `
        <tr>
            <td><input type="checkbox"></td>
            <td>${esc(emp.employeeId)}</td>
            <td><div class="user-info"><img src="${avatar(fullNameOf(emp))}" alt=""><span>${esc(fullNameOf(emp))}</span></div></td>
            <td>${esc(emp.email)}</td>
            <td>${esc(emp.department)}</td>
            <td>${esc(emp.position)}</td>
            <td>${formatDate(emp.joinDate)}</td>
            <td><span class="status-badge ${esc(emp.status)}">${esc(emp.status)}</span></td>
            <td>
                <button class="btn-icon" onclick="viewEmployee('${esc(emp.id)}')" title="View"><i class="fas fa-eye"></i></button>
                <button class="btn-icon" onclick="editEmployee('${esc(emp.id)}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn-icon" onclick="deleteEmployee('${esc(emp.id)}')" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;">No employees found</td></tr>';
}

function viewEmployee(id) {
    const employee = findEmployee(id);
    if (employee) openEmployeeDetails(employee);
}

function editEmployee(id) {
    const employee = findEmployee(id);
    if (employee) openEmployeeModal(employee);
}

async function deleteEmployee(id) {
    if (!confirm('Are you sure you want to delete this employee? They will lose access immediately.')) return;
    try {
        const employee = findEmployee(id);
        await api(`/employees/${id}`, 'DELETE');
        if (employee) {
            try { await api(`/profile_extensions/${profileKey(fullNameOf(employee))}`, 'DELETE'); } catch (e) { /* ignore */ }
            if (employee.uid) {
                try { await api(`/users/${employee.uid}`, 'DELETE'); } catch (e) { console.warn('Could not remove users record', e); }
            }
        }
        state.employees = state.employees.filter(e => String(e.id) !== String(id));
        renderEmployees();
        renderDashboard();
        renderDepartments();
        renderUsers();
        updateDropdowns();
        showToast('Employee deleted. Remove their login in Firebase Console > Authentication to reuse the ID.', 'success');
    } catch (err) {
        showToast('Failed to delete employee: ' + err.message, 'error');
    }
}

async function saveEmployee() {
    const form = $('employeeForm');
    const F = form.elements;
    const editId = form.dataset.editId;
    const oldName = form.dataset.oldName;
    const existing = editId ? findEmployee(editId) : null;

    const firstName = F.firstName.value.trim();
    const lastName = F.lastName.value.trim();
    const fullName = `${firstName} ${lastName}`;
    const employeeId = F.employeeId.value.trim();
    const newPassword = F.password.disabled ? '' : F.password.value;
    const role = F.role.value === 'ADMIN' ? 'ADMIN' : 'USER';
    const needsLogin = !existing || !existing.uid;      // new employee, or an old one without a login
    const creatingLogin = needsLogin && !!newPassword;

    if (state.employees.some(e => String(e.employeeId).toLowerCase() === employeeId.toLowerCase() && String(e.id) !== String(editId))) {
        showToast('Employee ID already exists', 'error');
        return;
    }
    if (!editId && !newPassword) {
        showToast('A password is required for new employees', 'error');
        return;
    }
    if (newPassword && newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    if ((creatingLogin || !editId) && !ID_PATTERN.test(employeeId)) {
        showToast('Employee ID may contain only letters, digits, dot, underscore and hyphen', 'error');
        return;
    }

    const employeeData = {
        firstName, lastName,
        email: F.email.value.trim(),
        phone: F.phone.value.trim(),
        department: F.department.value,
        position: F.position.value.trim(),
        employeeId,
        joinDate: F.joinDate.value,
        employmentType: F.employmentType.value,
        salary: parseFloat(F.salary.value) || 0,
        address: F.address.value.trim(),
        status: F.status.value
    };

    // Profile info only. Passwords live in Firebase Authentication; old plain-text fields are scrubbed.
    const profileData = {
        address: employeeData.address,
        bio: F.bio.value || '',
        email: employeeData.email,
        image: avatar(fullName),
        location: F.location.value || 'General',
        logType: F.logType.value || 'Logs',
        phone: employeeData.phone,
        role,
        password: null, passwordHash: null, salt: null, iterations: null, hashAlgo: null
    };

    let uid = existing?.uid || null;
    try {
        // 1) Firebase Authentication login (Employee ID + password)
        if (creatingLogin) uid = await createLogin(employeeId, newPassword);

        // 2) Employee record
        const dataToSave = uid ? { ...employeeData, uid } : employeeData;
        let saved;
        if (editId) {
            saved = await api(`/employees/${editId}`, 'PUT', dataToSave);
            const index = state.employees.findIndex(e => String(e.id) === String(editId));
            if (index !== -1) state.employees[index] = saved;
            if (oldName && oldName !== fullName) {
                try { await api(`/profile_extensions/${profileKey(oldName)}`, 'DELETE'); } catch (e) { /* ignore */ }
            }
        } else {
            saved = await api('/employees', 'POST', dataToSave);
            state.employees.push(saved);
        }

        // 3) users/<uid>: what the login page and the database rules read
        if (uid) {
            await api(`/users/${uid}`, 'PUT', {
                employeeId,
                employeeKey: saved.id,
                name: fullName,
                role,
                status: employeeData.status === 'active' ? 'active' : 'inactive'
            });
        }

        // 4) Profile extension (no passwords)
        await api(`/profile_extensions/${profileKey(fullName)}`, 'PUT', profileData);
        state.profiles = await api('/profile_extensions').catch(() => state.profiles);

        showToast(editId ? (creatingLogin ? 'Employee updated and login created!' : 'Employee updated successfully!')
                         : 'Employee added and login created!', 'success');
        closeModal('employeeModal');
        renderEmployees();
        renderDashboard();
        renderDepartments();
        renderUsers();
        updateDropdowns();
    } catch (err) {
        console.error('saveEmployee failed:', err);
        showToast('Failed to save employee: ' + authErrorMessage(err), 'error');
    }
}

// ==================== Departments ====================
function renderDepartments() {
    const q = ($('departmentSearch').value || '').toLowerCase();
    const list = state.departments.filter(d => !q || String(d.name).toLowerCase().includes(q) || String(d.code || '').toLowerCase().includes(q));

    $('departmentsGrid').innerHTML = list.map(dept => {
        const count = state.employees.filter(e => e.department === dept.name).length;
        return `
        <div class="department-card">
            <div class="department-header">
                <div class="department-icon"><i class="fas fa-building"></i></div>
                <div class="department-actions">
                    <button class="btn-icon" onclick="editDepartment('${esc(dept.id)}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="deleteDepartment('${esc(dept.id)}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <h3>${esc(dept.name)}</h3>
            <p class="department-code">${esc(dept.code)}</p>
            <div class="department-stats">
                <div class="dept-stat"><span class="dept-stat-label">Employees</span><span class="dept-stat-value">${count}</span></div>
                <div class="dept-stat"><span class="dept-stat-label">Budget</span><span class="dept-stat-value">${formatCurrency(dept.budget)}</span></div>
            </div>
            <div class="department-head">
                <img src="${avatar(dept.head || 'NA', '10B981')}" alt="">
                <span>Head: ${esc(dept.head || 'Not assigned')}</span>
            </div>
        </div>`;
    }).join('') || '<p style="padding:16px;">No departments found</p>';
}

function editDepartment(id) {
    const department = state.departments.find(d => String(d.id) === String(id));
    if (department) openDepartmentModal(department);
}

async function deleteDepartment(id) {
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
        await api(`/departments/${id}`, 'DELETE');
        state.departments = state.departments.filter(d => String(d.id) !== String(id));
        renderDepartments();
        renderDashboard();
        updateDropdowns();
        showToast('Department deleted successfully!', 'success');
    } catch (err) {
        showToast('Failed to delete department: ' + err.message, 'error');
    }
}

async function saveDepartment() {
    const form = $('departmentForm');
    const F = form.elements;
    const editId = form.dataset.editId;

    const data = {
        name: F.name.value.trim(),
        code: F.code.value.trim(),
        head: F.head.value,
        description: F.description.value.trim(),
        budget: parseFloat(F.budget.value) || 0
    };

    try {
        if (editId) {
            const updated = await api(`/departments/${editId}`, 'PUT', data);
            const index = state.departments.findIndex(d => String(d.id) === String(editId));
            if (index !== -1) state.departments[index] = updated;
            showToast('Department updated successfully!', 'success');
        } else {
            const created = await api('/departments', 'POST', data);
            state.departments.push(created);
            showToast('Department added successfully!', 'success');
        }
        closeModal('departmentModal');
        renderDepartments();
        renderDashboard();
        updateDropdowns();
    } catch (err) {
        showToast('Failed to save department: ' + err.message, 'error');
    }
}

// ==================== Attendance ====================
function calcHours(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 0;
    const [h1, m1] = checkIn.split(':').map(Number);
    const [h2, m2] = checkOut.split(':').map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;
    return Math.round((mins / 60) * 100) / 100;
}

function visibleAttendance() {
    const date = $('attendanceDate').value;
    let list = state.attendance.filter(a => !a.date || !date || a.date === date);
    if (!isAdmin()) list = list.filter(a => sameName(a.name, state.currentUser.name));
    return list;
}

function renderAttendance() {
    $('attendanceTable').querySelector('tbody').innerHTML = visibleAttendance().map(att => `
        <tr>
            <td>${esc(att.employeeId)}</td>
            <td><div class="user-info"><img src="${avatar(att.name)}" alt=""><span>${esc(att.name)}</span></div></td>
            <td>${esc(att.department)}</td>
            <td>${esc(att.checkIn || '-')}</td>
            <td>${esc(att.checkOut || '-')}</td>
            <td>${esc(att.hoursWorked ?? 0)} hrs</td>
            <td><span class="status-badge ${esc(att.status)}">${esc(att.status)}</span></td>
            <td>
                ${isAdmin() ? `<button class="btn-icon" onclick="markAttendance('${esc(att.employeeId)}', '${esc(att.id)}')" title="Mark Present"><i class="fas fa-check"></i></button>` : ''}
                <button class="btn-icon" onclick="editAttendance('${esc(att.id)}')" title="Edit"><i class="fas fa-edit"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;">No attendance records for this date</td></tr>';
}

function openAttendanceModal(record = null) {
    const form = $('attendanceForm');
    const F = form.elements;
    updateDropdowns();

    if (record) {
        $('attendanceModalTitle').textContent = 'Edit Attendance';
        form.dataset.editId = record.id;
        const emp = state.employees.find(e => e.employeeId === record.employeeId || sameName(fullNameOf(e), record.name));
        F.employee.value = emp ? emp.id : '';
        F.date.value = record.date || $('attendanceDate').value || todayStr();
        F.checkIn.value = record.checkIn || '09:00';
        F.checkOut.value = record.checkOut || '18:00';
        F.status.value = record.status || 'present';
    } else {
        $('attendanceModalTitle').textContent = 'Mark Attendance';
        delete form.dataset.editId;
        form.reset();
        F.date.value = $('attendanceDate').value || todayStr();
        if (!isAdmin()) {
            const me = state.employees.find(e => sameName(fullNameOf(e), state.currentUser.name));
            if (me) F.employee.value = me.id;
        }
    }
    $('attendanceModal').classList.add('active');
}

function editAttendance(id) {
    const record = state.attendance.find(a => String(a.id) === String(id));
    if (record) openAttendanceModal(record);
}

async function saveAttendance() {
    const form = $('attendanceForm');
    const F = form.elements;
    const editId = form.dataset.editId;
    const emp = findEmployee(F.employee.value);
    if (!emp) { showToast('Select a valid employee', 'error'); return; }

    const status = F.status.value;
    const data = {
        employeeId: emp.employeeId,
        name: fullNameOf(emp),
        department: emp.department || '',
        date: F.date.value,
        checkIn: status === 'absent' ? '' : F.checkIn.value,
        checkOut: status === 'absent' ? '' : F.checkOut.value,
        hoursWorked: status === 'absent' ? 0 : calcHours(F.checkIn.value, F.checkOut.value),
        status
    };

    try {
        if (editId) {
            const updated = await api(`/attendance/${editId}`, 'PUT', data);
            const i = state.attendance.findIndex(a => String(a.id) === String(editId));
            if (i !== -1) state.attendance[i] = updated;
        } else {
            state.attendance.push(await api('/attendance', 'POST', data));
        }
        closeModal('attendanceModal');
        renderAttendance();
        if (isAdmin()) renderDashboard();
        showToast('Attendance saved!', 'success');
    } catch (err) {
        showToast('Failed to save attendance: ' + err.message, 'error');
    }
}

async function markAttendance(employeeId, id) {
    try {
        const updated = await api(`/attendance/${id}`, 'PUT', { checkIn: '09:00', checkOut: '18:00', hoursWorked: 9, status: 'present' });
        const i = state.attendance.findIndex(a => String(a.id) === String(id));
        if (i !== -1) state.attendance[i] = updated;
        renderAttendance();
        if (isAdmin()) renderDashboard();
        showToast('Attendance marked!', 'success');
    } catch (err) {
        showToast('Failed to mark attendance: ' + err.message, 'error');
    }
}

// ==================== Performance ====================
function renderPerformance() {
    if (!isAdmin()) return;
    const period = $('performancePeriod').value;
    const dept = $('performanceDepartment').value;

    let list = [...state.performance];
    if (period) list = list.filter(p => p.period === period);
    if (dept) list = list.filter(p => p.department === dept);
    list.sort((a, b) => Number(b.score) - Number(a.score));

    $('topPerformersTable').querySelector('tbody').innerHTML = list.slice(0, 10).map((p, i) => `
        <tr>
            <td>#${i + 1}</td>
            <td><div class="user-info"><img src="${avatar(p.name)}" alt=""><span>${esc(p.name)}</span></div></td>
            <td>${esc(p.department)}</td>
            <td><strong>${esc(p.score)}</strong></td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">No reviews yet</td></tr>';

    const bucket = fn => list.filter(p => fn(Number(p.score))).length;
    makeChart('performance', 'performanceCanvas', {
        type: 'doughnut',
        data: {
            labels: ['Excellent (90+)', 'Good (75-89)', 'Average (60-74)', 'Poor (<60)'],
            datasets: [{
                data: [bucket(s => s >= 90), bucket(s => s >= 75 && s < 90), bucket(s => s >= 60 && s < 75), bucket(s => s < 60)],
                backgroundColor: ['#10B981', '#4F46E5', '#F59E0B', '#EF4444']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function openReviewModal() {
    updateDropdowns();
    $('reviewForm').reset();
    $('reviewModal').classList.add('active');
}

async function saveReview() {
    const F = $('reviewForm').elements;
    const emp = findEmployee(F.employee.value);
    if (!emp) { showToast('Select a valid employee', 'error'); return; }

    const data = {
        employeeId: emp.employeeId,
        name: fullNameOf(emp),
        department: emp.department || '',
        score: Math.min(100, Math.max(0, Number(F.score.value) || 0)),
        period: F.period.value,
        comments: F.comments.value.trim(),
        date: todayStr()
    };

    try {
        state.performance.push(await api('/performance', 'POST', data));
        closeModal('reviewModal');
        renderPerformance();
        showToast('Review saved!', 'success');
    } catch (err) {
        showToast('Failed to save review: ' + err.message, 'error');
    }
}

// ==================== Payroll ====================
function selectedPayrollPeriod() {
    const [month, year] = $('payrollMonth').value.split('-').map(Number);
    return { month, year };
}

function renderPayroll() {
    if (!isAdmin()) return;
    const { month, year } = selectedPayrollPeriod();
    const dept = $('payrollDepartment').value;

    let list = state.payroll.filter(p => !p.month || (Number(p.month) === month && Number(p.year) === year));
    if (dept) list = list.filter(p => p.department === dept);

    $('payrollTable').querySelector('tbody').innerHTML = list.map(pay => `
        <tr>
            <td>${esc(pay.employeeId)}</td>
            <td><div class="user-info"><img src="${avatar(pay.name)}" alt=""><span>${esc(pay.name)}</span></div></td>
            <td>${esc(pay.department)}</td>
            <td>${formatCurrency(pay.basicSalary)}</td>
            <td>${formatCurrency(pay.allowances)}</td>
            <td>${formatCurrency(pay.deductions)}</td>
            <td><strong>${formatCurrency(pay.netSalary)}</strong></td>
            <td><span class="status-badge ${esc(pay.status)}">${esc(pay.status)}</span></td>
            <td>
                <button class="btn-icon" onclick="viewPayslip('${esc(pay.id)}')" title="View Payslip"><i class="fas fa-file-invoice"></i></button>
                <button class="btn-icon" onclick="processPayment('${esc(pay.id)}')" title="Process Payment"><i class="fas fa-money-bill"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;">No payroll for this period. Click "Generate Payroll".</td></tr>';
}

async function generatePayroll() {
    if (!isAdmin()) { showToast('Admins only', 'error'); return; }
    const { month, year } = selectedPayrollPeriod();
    const dept = $('payrollDepartment').value;
    const targets = state.employees.filter(e => e.status === 'active' && (!dept || e.department === dept));
    if (!targets.length) { showToast('No active employees to process', 'error'); return; }

    let created = 0;
    try {
        for (const emp of targets) {
            const exists = state.payroll.some(p => p.employeeId === emp.employeeId && Number(p.month) === month && Number(p.year) === year);
            if (exists) continue;
            const basic = Number(emp.salary) || 0;
            const allowances = Math.round(basic * PAYROLL_RULES.allowanceRate);
            const deductions = Math.round(basic * PAYROLL_RULES.deductionRate);
            const rec = await api('/payroll', 'POST', {
                employeeId: emp.employeeId, name: fullNameOf(emp), department: emp.department || '',
                basicSalary: basic, allowances, deductions, netSalary: basic + allowances - deductions,
                month, year, status: 'pending'
            });
            state.payroll.push(rec);
            created++;
        }
        renderPayroll();
        showToast(created ? `Payroll generated for ${created} employee(s)` : 'Payroll already exists for this period', created ? 'success' : 'info');
    } catch (err) {
        showToast('Failed to generate payroll: ' + err.message, 'error');
    }
}

function viewPayslip(id) {
    const p = state.payroll.find(x => String(x.id) === String(id));
    if (!p) return;
    const w = window.open('', '_blank', 'width=520,height=640');
    if (!w) { showToast('Allow pop-ups to view the payslip', 'error'); return; }
    w.document.write(`<html><head><title>Payslip - ${esc(p.name)}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{font-family:Arial,sans-serif;padding:24px}td{padding:6px 12px;border-bottom:1px solid #ddd}</style></head><body>
        <h2>Payslip</h2><p>${esc(p.name)} (${esc(p.employeeId)}) - ${esc(p.department)}<br>Period: ${esc(p.month)}/${esc(p.year)}</p>
        <table><tr><td>Basic Salary</td><td>${formatCurrency(p.basicSalary)}</td></tr>
        <tr><td>Allowances</td><td>${formatCurrency(p.allowances)}</td></tr>
        <tr><td>Deductions</td><td>-${formatCurrency(p.deductions)}</td></tr>
        <tr><td><strong>Net Salary</strong></td><td><strong>${formatCurrency(p.netSalary)}</strong></td></tr>
        <tr><td>Status</td><td>${esc(p.status)}</td></tr></table>
        <p><button onclick="window.print()">Print</button></p></body></html>`);
    w.document.close();
}

async function processPayment(id) {
    try {
        const updated = await api(`/payroll/${id}`, 'PUT', { status: 'paid' });
        const i = state.payroll.findIndex(p => String(p.id) === String(id));
        if (i !== -1) state.payroll[i] = updated;
        renderPayroll();
        showToast('Payment processed successfully!', 'success');
    } catch (err) {
        showToast('Failed to process payment: ' + err.message, 'error');
    }
}

// ==================== Leave Management ====================
function daysBetween(from, to) {
    const d = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    return d > 0 ? d : 0;
}

function visibleLeave() {
    let list = [...state.leave];
    if (!isAdmin()) list = list.filter(l => sameName(l.employee, state.currentUser.name));
    const status = $('leaveStatus').value;
    const type = $('leaveType').value;
    if (status) list = list.filter(l => l.status === status);
    if (type) list = list.filter(l => l.type === type);
    return list;
}

function renderLeave() {
    $('leaveTable').querySelector('tbody').innerHTML = visibleLeave().map(lv => `
        <tr>
            <td><div class="user-info"><img src="${avatar(lv.employee)}" alt=""><span>${esc(lv.employee)}</span></div></td>
            <td>${formatLeaveType(lv.type)}</td>
            <td>${formatDate(lv.fromDate)}</td>
            <td>${formatDate(lv.toDate)}</td>
            <td>${esc(lv.days)} days</td>
            <td>${esc(lv.reason)}</td>
            <td><span class="status-badge ${esc(lv.status)}">${esc(lv.status)}</span></td>
            <td>${isAdmin() && lv.status === 'pending' ? `
                <button class="btn-icon" onclick="approveLeave('${esc(lv.id)}')" title="Approve"><i class="fas fa-check"></i></button>
                <button class="btn-icon" onclick="rejectLeave('${esc(lv.id)}')" title="Reject"><i class="fas fa-times"></i></button>` : '-'}
            </td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;">No leave requests</td></tr>';

    const mine = isAdmin() ? state.leave : state.leave.filter(l => sameName(l.employee, state.currentUser.name));
    document.querySelectorAll('.leave-stat-card').forEach(card => {
        const type = card.dataset.type;
        const total = LEAVE_ALLOWANCE[type] || 0;
        const used = mine.filter(l => l.type === type && l.status === 'approved').reduce((s, l) => s + (Number(l.days) || 0), 0);
        card.querySelector('.used').textContent = `Used: ${used}`;
        card.querySelector('.remaining').textContent = `Remaining: ${Math.max(total - used, 0)}`;
        card.querySelector('.progress').style.width = `${total ? Math.min(100, Math.round((used / total) * 100)) : 0}%`;
    });
    updateNotifications();
}

function openLeaveModal() {
    updateDropdowns();
    const form = $('leaveForm');
    form.reset();
    if (!isAdmin()) {
        const me = state.employees.find(e => sameName(fullNameOf(e), state.currentUser.name));
        if (me) form.elements.employee.value = me.id;
    }
    $('leaveModal').classList.add('active');
}

async function saveLeave() {
    const F = $('leaveForm').elements;
    const emp = findEmployee(F.employee.value);
    if (!emp) { showToast('Select a valid employee', 'error'); return; }
    const days = daysBetween(F.fromDate.value, F.toDate.value);
    if (!days) { showToast('"To" date must be on or after "From" date', 'error'); return; }

    const data = {
        employeeId: emp.employeeId,
        employee: fullNameOf(emp),
        type: F.type.value,
        fromDate: F.fromDate.value,
        toDate: F.toDate.value,
        days,
        reason: F.reason.value.trim(),
        status: 'pending'
    };

    try {
        state.leave.push(await api('/leave', 'POST', data));
        closeModal('leaveModal');
        renderLeave();
        if (isAdmin()) renderDashboard();
        showToast('Leave request submitted!', 'success');
    } catch (err) {
        showToast('Failed to submit leave: ' + err.message, 'error');
    }
}

async function setLeaveStatus(id, status, message) {
    try {
        const updated = await api(`/leave/${id}`, 'PUT', { status });
        const i = state.leave.findIndex(l => String(l.id) === String(id));
        if (i !== -1) state.leave[i] = updated;
        renderLeave();
        if (isAdmin()) renderDashboard();
        showToast(message, 'success');
    } catch (err) {
        showToast('Failed to update leave: ' + err.message, 'error');
    }
}
const approveLeave = id => setLeaveStatus(id, 'approved', 'Leave request approved!');
const rejectLeave = id => setLeaveStatus(id, 'rejected', 'Leave request rejected');

// ==================== Reports ====================
function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCSV(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [headers.map(cell).join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\n');
}

function generateReport(type) {
    const builders = {
        attendance: () => state.attendance.map(a => ({ Date: a.date, EmployeeID: a.employeeId, Name: a.name, Department: a.department, CheckIn: a.checkIn, CheckOut: a.checkOut, Hours: a.hoursWorked, Status: a.status })),
        performance: () => state.performance.map(p => ({ Name: p.name, Department: p.department, Period: p.period, Score: p.score, Comments: p.comments, Date: p.date })),
        payroll: () => state.payroll.map(p => ({ EmployeeID: p.employeeId, Name: p.name, Department: p.department, Month: p.month, Year: p.year, Basic: p.basicSalary, Allowances: p.allowances, Deductions: p.deductions, Net: p.netSalary, Status: p.status })),
        leave: () => state.leave.map(l => ({ Employee: l.employee, Type: l.type, From: l.fromDate, To: l.toDate, Days: l.days, Reason: l.reason, Status: l.status })),
        department: () => state.departments.map(d => ({ Name: d.name, Code: d.code, Head: d.head, Budget: d.budget, Employees: state.employees.filter(e => e.department === d.name).length })),
        employee: () => state.employees.map(e => ({ EmployeeID: e.employeeId, Name: fullNameOf(e), Email: e.email, Phone: e.phone, Department: e.department, Position: e.position, JoinDate: e.joinDate, Type: e.employmentType, Salary: e.salary, Status: e.status }))
    };
    const rows = builders[type]?.() || [];
    if (!rows.length) { showToast('No data available for this report', 'error'); return; }
    downloadFile(`${type}-report-${todayStr()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
    showToast('Report downloaded successfully!', 'success');
}

// ==================== Settings & Data ====================
function loadSettings() {
    const form = $('companySettingsForm');
    if (!form) return;
    let s = null;
    try { s = JSON.parse(localStorage.getItem('ems_settings')); } catch (e) { /* ignore */ }
    if (!s) return;
    form.elements.companyName.value = s.companyName ?? '';
    form.elements.industry.value = s.industry ?? '';
    form.elements.startTime.value = s.startTime ?? '09:00';
    form.elements.endTime.value = s.endTime ?? '18:00';
    form.querySelectorAll('input[name="workDays"]').forEach(cb => { cb.checked = (s.workDays || []).includes(cb.value); });
}

function saveSettings() {
    const form = $('companySettingsForm');
    const s = {
        companyName: form.elements.companyName.value,
        industry: form.elements.industry.value,
        startTime: form.elements.startTime.value,
        endTime: form.elements.endTime.value,
        workDays: [...form.querySelectorAll('input[name="workDays"]:checked')].map(cb => cb.value)
    };
    localStorage.setItem('ems_settings', JSON.stringify(s));
    showToast('Settings saved successfully!', 'success');
}

function exportData() {
    const { employees, departments, attendance, performance, payroll, leave } = state;
    downloadFile(`ems-backup-${todayStr()}.json`, JSON.stringify({ employees, departments, attendance, performance, payroll, leave }, null, 2), 'application/json');
    showToast('Data exported', 'success');
}

function renderUsers() {
    const tbody = $('usersTable')?.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = state.employees.map(emp => {
        const profile = state.profiles.find(p => p.id === profileKey(fullNameOf(emp)));
        const role = String(profile?.role || 'USER').toUpperCase() === 'ADMIN' ? 'Administrator' : 'Employee';
        return `<tr>
            <td><div class="user-info"><img src="${avatar(fullNameOf(emp))}" alt=""><span>${esc(fullNameOf(emp))}</span></div></td>
            <td>${role}</td>
            <td>${esc(emp.employeeId)}</td>
            <td><span class="status-badge ${esc(emp.status)}">${esc(emp.status)}</span></td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;">No users</td></tr>';
}

function updateNotifications() {
    const el = $('notifCount');
    if (el) el.textContent = state.leave.filter(l => l.status === 'pending').length;
}

// ==================== Helpers ====================
function updateDropdowns() {
    const deptOptions = state.departments.map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
    [
        ['departmentFilter', 'All Departments'],
        ['performanceDepartment', 'All Departments'],
        ['payrollDepartment', 'All Departments'],
        ['employeeDepartment', 'Select Department']
    ].forEach(([id, label]) => {
        const select = $(id);
        if (!select) return;
        const current = select.value;
        select.innerHTML = `<option value="">${label}</option>` + deptOptions;
        select.value = current;
    });

    const head = $('departmentHead');
    if (head) {
        const current = head.value;
        head.innerHTML = '<option value="">Select Employee</option>' +
            state.employees.map(e => `<option value="${esc(fullNameOf(e))}">${esc(fullNameOf(e))}</option>`).join('');
        head.value = current;
    }

    const pool = isAdmin() ? state.employees : state.employees.filter(e => sameName(fullNameOf(e), state.currentUser.name));
    const empOptions = pool.map(e => `<option value="${esc(e.id)}">${esc(fullNameOf(e))}</option>`).join('');
    ['attendanceEmployee', 'leaveEmployee', 'reviewEmployee'].forEach(id => {
        const select = $(id);
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Select Employee</option>' + empOptions;
        select.value = current;
    });
}

function handleGlobalSearch(e) {
    const query = e.target.value.trim().toLowerCase();
    ui.searchQuery = query.length >= 2 ? query : '';
    if (!isAdmin()) return;
    if (ui.searchQuery) showSection('employees');
    renderEmployees();
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: CURRENCY,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(Number(amount) || 0);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date)) return esc(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatEmploymentType(type) {
    const types = { 'full-time': 'Full Time', 'part-time': 'Part Time', 'contract': 'Contract', 'internship': 'Internship' };
    return types[type] || type || 'N/A';
}

function formatLeaveType(type) {
    const types = { sick: 'Sick Leave', casual: 'Casual Leave', annual: 'Annual Leave', maternity: 'Maternity Leave' };
    return types[type] || esc(type);
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${esc(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}

// ==================== Expose to inline onclick handlers ====================
// script.js is an ES module, so its functions are private unless attached to window.
Object.assign(window, {
    showSection, closeModal,
    viewEmployee, editEmployee, deleteEmployee,
    editDepartment, deleteDepartment,
    markAttendance, editAttendance,
    viewPayslip, processPayment,
    approveLeave, rejectLeave,
    generateReport
});
