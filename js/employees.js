import {
    ID_PATTERN, state, ui, bus, $, on, esc, avatar, isAdmin, fullNameOf, profileKey, sameName,
    findEmployee, api, showToast, closeModal, showSection, formatDate, formatCurrency, formatEmploymentType
} from './core.js';
import { createLogin, authErrorMessage } from './auth.js';

// ==================== Employees ====================
export function renderEmployees() {
    const dept = $('departmentFilter').value, status = $('statusFilter').value, q = ui.searchQuery;
    $('selectAll').checked = false;
    let list = state.employees;
    if (dept) list = list.filter(e => e.department === dept);
    if (status) list = list.filter(e => e.status === status);
    if (q) list = list.filter(e => [e.firstName, e.lastName, e.email, e.employeeId].some(v => String(v || '').toLowerCase().includes(q)));

    $('employeesTable').querySelector('tbody').innerHTML = list.map(emp => `
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

export function viewEmployee(id) { const e = findEmployee(id); if (e) openEmployeeDetails(e); }
export function editEmployee(id) { const e = findEmployee(id); if (e) openEmployeeModal(e); }

function openEmployeeDetails(emp) {
    const name = fullNameOf(emp);
    $('detailImage').src = avatar(name);
    $('detailName').textContent = name;
    $('detailPosition').textContent = emp.position || '';
    $('detailDepartment').textContent = emp.department || '';
    $('detailEmail').textContent = emp.email || 'N/A';
    $('detailPhone').textContent = emp.phone || 'N/A';
    $('detailId').textContent = emp.employeeId || 'N/A';
    $('detailJoinDate').textContent = formatDate(emp.joinDate);
    $('detailType').textContent = formatEmploymentType(emp.employmentType);
    $('detailSalary').textContent = formatCurrency(emp.salary);
    $('detailAddress').textContent = emp.address || 'N/A';
    $('detailStatus').innerHTML = `<span class="status-badge ${esc(emp.status)}">${esc(emp.status)}</span>`;
    $('employeeDetailsModal').classList.add('active');
}

async function openEmployeeModal(emp = null) {
    const form = $('employeeForm'), F = form.elements, hint = $('passwordHint');
    updateDropdowns();

    if (emp) {
        $('employeeModalTitle').textContent = 'Edit Employee';
        form.dataset.editId = emp.id;
        form.dataset.oldName = fullNameOf(emp);
        F.firstName.value = emp.firstName || '';
        F.lastName.value = emp.lastName || '';
        F.email.value = emp.email || '';
        F.phone.value = emp.phone || '';
        F.department.value = emp.department || '';
        F.position.value = emp.position || '';
        F.employeeId.value = emp.employeeId || '';
        F.employeeId.readOnly = !!emp.uid;            // the login is tied to the ID once it exists
        F.joinDate.value = emp.joinDate || '';
        F.employmentType.value = emp.employmentType || 'full-time';
        F.salary.value = emp.salary ?? '';
        F.address.value = emp.address || '';
        F.status.value = emp.status || 'active';
        F.logType.value = emp.logType || 'Logs';
        F.leaderGroups.value = '';
        F.password.value = '';
        F.password.required = false;
        if (emp.uid) {
            F.password.disabled = true;
            F.password.placeholder = 'Managed by the employee';
            if (hint) hint.textContent = 'The employee changes their own password with the key icon in the header.';
        } else {
            F.password.disabled = false;
            F.password.placeholder = "Set a password to create this employee's login";
            if (hint) hint.textContent = 'This employee has no login yet. Enter a password (min 6 characters) to create one.';
        }
        try {
            const profile = await api(`/profile_extensions/${profileKey(fullNameOf(emp))}`);
            F.role.value = profile.role || 'USER';
            F.leaderGroups.value = profile.leaderGroups || '';
            F.location.value = profile.location || 'General';
            F.bio.value = profile.bio || '';
            if (profile.logType) F.logType.value = profile.logType;
        } catch (e) { console.log('No profile extension found for this user'); }
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
    $('employeeModal').classList.add('active');
}

export async function deleteEmployee(id) {
    if (!confirm('Are you sure you want to delete this employee? They will lose access immediately.')) return;
    try {
        const emp = findEmployee(id);
        await api(`/employees/${id}`, 'DELETE');
        if (emp) {
            try { await api(`/profile_extensions/${profileKey(fullNameOf(emp))}`, 'DELETE'); } catch (e) { /* ignore */ }
            if (emp.uid) { try { await api(`/users/${emp.uid}`, 'DELETE'); } catch (e) { console.warn('Could not remove users record', e); } }
        }
        state.employees = state.employees.filter(e => String(e.id) !== String(id));
        refreshEmployeeViews();
        showToast('Employee deleted. Remove their login in Firebase Console > Authentication to reuse the ID.', 'success');
    } catch (err) {
        showToast('Failed to delete employee: ' + err.message, 'error');
    }
}

async function saveEmployee() {
    const form = $('employeeForm'), F = form.elements;
    const editId = form.dataset.editId, oldName = form.dataset.oldName;
    const existing = editId ? findEmployee(editId) : null;

    const firstName = F.firstName.value.trim(), lastName = F.lastName.value.trim();
    const fullName = `${firstName} ${lastName}`;
    const employeeId = F.employeeId.value.trim();
    const newPassword = F.password.disabled ? '' : F.password.value;
    const role = ['ADMIN', 'LEADER'].includes(F.role.value) ? F.role.value : 'USER';
    const leaderGroups = role === 'LEADER' ? (F.leaderGroups.value || '').split(',').map(s => s.trim()).filter(Boolean) : [];

    const logType = F.logType.value === 'Logs_SDI' ? 'Logs_SDI' : 'Logs';
    const needsLogin = !existing || !existing.uid;
    const creatingLogin = needsLogin && !!newPassword;

    if (state.employees.some(e => String(e.employeeId).toLowerCase() === employeeId.toLowerCase() && String(e.id) !== String(editId)))
        return showToast('Employee ID already exists', 'error');
    if (!editId && !newPassword) return showToast('A password is required for new employees', 'error');
    if (newPassword && newPassword.length < 6) return showToast('Password must be at least 6 characters', 'error');
    if ((creatingLogin || !editId) && !ID_PATTERN.test(employeeId))
        return showToast('Employee ID may contain only letters, digits, underscore and hyphen', 'error');

    const employeeData = {
        firstName, lastName, employeeId, logType,
        email: F.email.value.trim(), phone: F.phone.value.trim(),
        department: F.department.value, position: F.position.value.trim(),
        joinDate: F.joinDate.value, employmentType: F.employmentType.value,
        salary: parseFloat(F.salary.value) || 0, address: F.address.value.trim(), status: F.status.value
    };
    // Profile info only. Passwords live in Firebase Authentication; old plain-text fields are scrubbed.
    const profileData = {
        address: employeeData.address, bio: F.bio.value || '', email: employeeData.email,
        image: avatar(fullName), location: F.location.value || 'General', logType,
        phone: employeeData.phone, role, leaderGroups: leaderGroups.join(', '),
        password: null, passwordHash: null, salt: null, iterations: null, hashAlgo: null
    };

    let uid = existing?.uid || null;
    try {
        if (creatingLogin) uid = await createLogin(employeeId, newPassword);

        const dataToSave = uid ? { ...employeeData, uid } : employeeData;
        let saved;
        if (editId) {
            saved = await api(`/employees/${editId}`, 'PUT', dataToSave);
            const i = state.employees.findIndex(e => String(e.id) === String(editId));
            if (i !== -1) state.employees[i] = saved;
            if (oldName && oldName !== fullName) { try { await api(`/profile_extensions/${profileKey(oldName)}`, 'DELETE'); } catch (e) { /* ignore */ } }
        } else {
            saved = await api('/employees', 'POST', dataToSave);
            state.employees.push(saved);
        }

        if (uid) {
            await api(`/users/${uid}`, 'PUT', {
    employeeId, employeeKey: saved.id, name: fullName, role, logType,
    leaderGroups: leaderGroups.join(', ') || null,
    groups: leaderGroups.length ? Object.fromEntries(leaderGroups.map(g => [g.replace(/[.#$\\\[\\\\]\/]/g, '_'), true])) : null,
    status: employeeData.status === 'active' ? 'active' : 'inactive'
});

        }

        await api(`/profile_extensions/${profileKey(fullName)}`, 'PUT', profileData);
        state.profiles = await api('/profile_extensions').catch(() => state.profiles);

        showToast(editId ? (creatingLogin ? 'Employee updated and login created!' : 'Employee updated successfully!') : 'Employee added and login created!', 'success');
        closeModal('employeeModal');
        refreshEmployeeViews();
    } catch (err) {
        console.error('saveEmployee failed:', err);
        showToast('Failed to save employee: ' + authErrorMessage(err), 'error');
    }
}

function refreshEmployeeViews() {
    renderEmployees(); renderDepartments(); renderUsers(); updateDropdowns();
    bus.emit('data:changed');
}

// ==================== Departments ====================
export function renderDepartments() {
    const q = ($('departmentSearch').value || '').toLowerCase();
    const list = state.departments.filter(d => !q || String(d.name).toLowerCase().includes(q) || String(d.code || '').toLowerCase().includes(q));
    $('departmentsGrid').innerHTML = list.map(dept => {
        const count = state.employees.filter(e => e.department === dept.name).length;
        return `<div class="department-card">
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
            <div class="department-head"><img src="${avatar(dept.head || 'NA', '10B981')}" alt=""><span>Head: ${esc(dept.head || 'Not assigned')}</span></div>
        </div>`;
    }).join('') || '<p style="padding:16px;">No departments found</p>';
}

function openDepartmentModal(dept = null) {
    const form = $('departmentForm'), F = form.elements;
    updateDropdowns();
    if (dept) {
        $('departmentModalTitle').textContent = 'Edit Department';
        form.dataset.editId = dept.id;
        F.name.value = dept.name || ''; F.code.value = dept.code || ''; F.head.value = dept.head || '';
        F.description.value = dept.description || ''; F.budget.value = dept.budget ?? '';
    } else {
        $('departmentModalTitle').textContent = 'Add New Department';
        delete form.dataset.editId;
        form.reset();
    }
    $('departmentModal').classList.add('active');
}

export function editDepartment(id) {
    const d = state.departments.find(x => String(x.id) === String(id));
    if (d) openDepartmentModal(d);
}

export async function deleteDepartment(id) {
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
        await api(`/departments/${id}`, 'DELETE');
        state.departments = state.departments.filter(d => String(d.id) !== String(id));
        renderDepartments(); updateDropdowns(); bus.emit('data:changed');
        showToast('Department deleted successfully!', 'success');
    } catch (err) { showToast('Failed to delete department: ' + err.message, 'error'); }
}

async function saveDepartment() {
    const form = $('departmentForm'), F = form.elements, editId = form.dataset.editId;
    const data = {
        name: F.name.value.trim(), code: F.code.value.trim(), head: F.head.value,
        description: F.description.value.trim(), budget: parseFloat(F.budget.value) || 0
    };
    try {
        if (editId) {
            const updated = await api(`/departments/${editId}`, 'PUT', data);
            const i = state.departments.findIndex(d => String(d.id) === String(editId));
            if (i !== -1) state.departments[i] = updated;
        } else {
            state.departments.push(await api('/departments', 'POST', data));
        }
        showToast(editId ? 'Department updated successfully!' : 'Department added successfully!', 'success');
        closeModal('departmentModal');
        renderDepartments(); updateDropdowns(); bus.emit('data:changed');
    } catch (err) { showToast('Failed to save department: ' + err.message, 'error'); }
}

// ==================== Users table, dropdowns, search ====================
export function renderUsers() {
    const tbody = $('usersTable')?.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = state.employees.map(emp => {
        const profile = state.profiles.find(p => p.id === profileKey(fullNameOf(emp)));
        const r = String(profile?.role || 'USER').toUpperCase();
const role = r === 'ADMIN' ? 'Administrator' : r === 'LEADER' ? 'Leader' : 'Employee';

        return `<tr>
            <td><div class="user-info"><img src="${avatar(fullNameOf(emp))}" alt=""><span>${esc(fullNameOf(emp))}</span></div></td>
            <td>${role}</td><td>${esc(emp.employeeId)}</td>
            <td><span class="status-badge ${esc(emp.status)}">${esc(emp.status)}</span></td></tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;">No users</td></tr>';
}

export function updateDropdowns() {
    const deptOptions = state.departments.map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
    [['departmentFilter', 'All Departments'], ['performanceDepartment', 'All Departments'],
     ['payrollDepartment', 'All Departments'], ['employeeDepartment', 'Select Department']].forEach(([id, label]) => {
        const s = $(id); if (!s) return;
        const cur = s.value;
        s.innerHTML = `<option value="">${label}</option>` + deptOptions;
        s.value = cur;
    });

    const head = $('departmentHead');
    if (head) {
        const cur = head.value;
        head.innerHTML = '<option value="">Select Employee</option>' +
            state.employees.map(e => `<option value="${esc(fullNameOf(e))}">${esc(fullNameOf(e))}</option>`).join('');
        head.value = cur;
    }

    const pool = isAdmin() ? state.employees : state.employees.filter(e => sameName(fullNameOf(e), state.currentUser.name));
    const opts = pool.map(e => `<option value="${esc(e.id)}">${esc(fullNameOf(e))}</option>`).join('');
    ['leaveEmployee', 'reviewEmployee'].forEach(id => {
        const s = $(id); if (!s) return;
        const cur = s.value;
        s.innerHTML = '<option value="">Select Employee</option>' + opts;
        s.value = cur;
    });
}

function handleGlobalSearch(e) {
    const q = e.target.value.trim().toLowerCase();
    ui.searchQuery = q.length >= 2 ? q : '';
    if (!isAdmin()) return;
    if (ui.searchQuery) showSection('employees');
    renderEmployees();
}

export function initEmployees() {
    on('addEmployeeBtn', 'click', () => openEmployeeModal());
    on('addDepartmentBtn', 'click', () => openDepartmentModal());
    on('employeeForm', 'submit', e => { e.preventDefault(); saveEmployee(); });
    on('departmentForm', 'submit', e => { e.preventDefault(); saveDepartment(); });
    on('selectAll', 'change', function () {
        document.querySelectorAll('#employeesTable tbody input[type="checkbox"]').forEach(cb => { cb.checked = this.checked; });
    });
    on('departmentFilter', 'change', renderEmployees);
    on('statusFilter', 'change', renderEmployees);
    on('globalSearch', 'input', handleGlobalSearch);
    on('departmentSearch', 'input', renderDepartments);
}
