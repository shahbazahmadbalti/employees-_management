import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, get, set, push, update, remove, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyfxRkhKOqjNWr1kl1nO3IE6uJ6rfTOWfxxabS5okAQtPxPvk0dwRlB30Og_ez_jqKm/exec";

const state = {
    employees: [],
    departments: [],
    attendance: [],
    performance: [],
    payroll: [],
    leave: [],
    schedule: {},
    masterEmployees: [],
    currentUser: {
        id: null,
        name: 'User',
        role: 'employee'
    }
};

// ==================== Firebase API Wrapper ====================
async function api(endpoint, method = 'GET', body = null) {
    let [path, query] = endpoint.split('?');
    const pathParts = path.split('/').filter(Boolean);
    const collection = pathParts[0];
    const id = pathParts[1];
    
    const dbRef = ref(db);
    
    if (method === 'GET') {
        if (id) {
            const snapshot = await get(child(dbRef, `${collection}/${id}`));
            if (!snapshot.exists()) throw new Error('Not found');
            return { id, ...snapshot.val() };
        } else {
            const snapshot = await get(child(dbRef, collection));
            if (!snapshot.exists()) return [];
            const data = snapshot.val();
            return Object.keys(data).map(key => ({ id: key, ...data[key] }));
        }
    } else if (method === 'POST') {
        const newRef = push(child(dbRef, collection));
        await set(newRef, body);
        return { id: newRef.key, ...body };
    } else if (method === 'PUT') {
        const itemRef = child(dbRef, `${collection}/${id}`);
        await update(itemRef, body);
        return { id, ...body };
    } else if (method === 'DELETE') {
        const itemRef = child(dbRef, `${collection}/${id}`);
        await remove(itemRef);
        return { success: true };
    }
}

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', function() {
    // Custom Auth using localStorage
    const storedUser = localStorage.getItem('duna_user');
    
    if (storedUser) {
        const user = JSON.parse(storedUser);
        document.getElementById('currentUserEmail').textContent = user.username;
        
        const role = user.role === 'ADMIN' ? 'admin' : 'employee';
        document.body.className = `role-${role}`;
        state.currentUser.name = user.username;
        state.currentUser.role = role;
        
        initializeData();
        setupEventListeners();
    } else {
        window.location.href = '/login.html';
    }

    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('duna_user');
        window.location.href = '/login.html';
    });
});

async function initializeData() {
    try {
        const [employees, departments, attendance, performance, payroll, leave] = await Promise.all([
            api('/employees'),
            api('/departments'),
            api('/attendance'),
            api('/performance'),
            api('/payroll'),
            api('/leave')
        ]);

        state.employees = employees;
        state.departments = departments;
        state.attendance = attendance;
        state.performance = performance;
        state.payroll = payroll;
        state.leave = leave;
        
        renderAttendance();
        renderLeave();
        fetchSchedule();
        
    } catch (err) {
        console.error('Failed to load data:', err);
        showToast('Failed to load data from server', 'error');
    }
}

async function fetchSchedule() {
    try {
        document.getElementById('scheduleLoading').style.display = 'block';
        document.getElementById('scheduleTable').style.display = 'none';
        
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const data = await response.json();
        
        state.schedule = data.schedule || {};
        state.masterEmployees = data.employees || [];
        state.employeeLocations = data.employeeLocations || {};
        
        // Dynamically update role if they are an admin in the database
        const roleFromDb = data.employeeRoles?.[state.currentUser.name] || '';
        if (roleFromDb.toLowerCase().includes('admin')) {
            state.currentUser.role = 'admin';
            document.body.className = 'role-admin';
        }
        
        // Render based on role
        if (state.currentUser.role === 'admin') {
            renderDashboard();
            renderEmployees();
            renderDepartments();
            renderPerformance();
            renderPayroll();
            updateDropdowns();
        }
        
        renderSchedule();
    } catch (err) {
        console.error('Failed to fetch schedule', err);
        document.getElementById('scheduleLoading').textContent = 'Failed to load schedule';
    }
}

function renderSchedule() {
    document.getElementById('scheduleLoading').style.display = 'none';
    document.getElementById('scheduleTable').style.display = 'table';
    
    const tbody = document.getElementById('scheduleBody');
    const theadRow = document.getElementById('scheduleHead').querySelector('tr');
    
    const selMonth = document.getElementById('schedMonth').value; // e.g. OCT
    const selYear = document.getElementById('schedYear').value;   // e.g. 2026
    
    // Generate days 1 to 31
    let headersHTML = '<th style="position: sticky; left: 0; background: #f8fafc; z-index: 2; width: 150px; text-align: left;">EMPLOYEE NAME</th>';
    for (let i = 1; i <= 31; i++) headersHTML += `<th style="text-align: center;">${i}</th>`;
    headersHTML += '<th style="text-align: center; width: 80px;">TOTAL HOURS</th>';
    theadRow.innerHTML = headersHTML;
    
    const employees = Object.keys(state.schedule);
    if (!employees.length) {
        tbody.innerHTML = '<tr><td colspan="33" style="text-align: center;">No schedule data available</td></tr>';
        return;
    }
    
    tbody.innerHTML = employees.map(empName => {
        let totalHrs = 0;
        let daysHtml = '';
        const empSchedule = state.schedule[empName]?.[selYear]?.[selMonth] || {};
        
        for (let i = 1; i <= 31; i++) {
            const dayData = empSchedule[i];
            if (dayData && dayData.area) {
                // e.g. "SK/SDI" or "FA 2 (N)"
                const label = dayData.area;
                let colorClass = 'bg-yellow-200 text-yellow-800'; 
                if (label.includes('FA')) colorClass = 'bg-blue-200 text-blue-800';
                else if (label.includes('P2')) colorClass = 'bg-green-200 text-green-800';
                else if (label.includes('AD')) colorClass = 'bg-orange-200 text-orange-800';
                else colorClass = 'bg-indigo-200 text-indigo-800';
                
                daysHtml += `<td style="padding: 2px;"><div style="font-size: 10px; font-weight: bold; border-radius: 4px; padding: 4px; text-align: center; white-space: nowrap;" class="${colorClass}">${label}</div></td>`;
                totalHrs += 8; // dummy calculation
            } else {
                daysHtml += '<td></td>';
            }
        }
        
        return `
            <tr>
                <td style="position: sticky; left: 0; background: white; z-index: 1; font-weight: 500; text-transform: uppercase;">${empName}</td>
                ${daysHtml}
                <td style="text-align: center; font-weight: bold;">${totalHrs || '-'}</td>
            </tr>
        `;
    }).join('');
}

// ==================== Event Listeners ====================
function setupEventListeners() {
    // Menu Navigation
    document.querySelectorAll('.menu li').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.dataset.section;
            showSection(section);
        });
    });

    // Mobile Menu Toggle
    document.getElementById('menuToggle').addEventListener('click', function() {
        document.querySelector('.sidebar').classList.toggle('active');
    });

    // Add Employee Button
    document.getElementById('addEmployeeBtn').addEventListener('click', function() {
        openEmployeeModal();
    });

    // Add Department Button
    document.getElementById('addDepartmentBtn').addEventListener('click', function() {
        openDepartmentModal();
    });

    // Employee Form Submit
    document.getElementById('employeeForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveEmployee();
    });

    // Department Form Submit
    document.getElementById('departmentForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveDepartment();
    });

    // Select All Checkbox
    document.getElementById('selectAll').addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('#employeesTable tbody input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = this.checked);
    });

    // Filters
    document.getElementById('departmentFilter').addEventListener('change', renderEmployees);
    document.getElementById('statusFilter').addEventListener('change', renderEmployees);
    document.getElementById('globalSearch').addEventListener('input', handleGlobalSearch);

    // Attendance Date
    document.getElementById('attendanceDate').addEventListener('change', renderAttendance);

    // Mark Attendance Button
    document.getElementById('markAttendanceBtn').addEventListener('click', function() {
        showToast('Attendance marked successfully!', 'success');
    });

    // Add Review Button
    document.getElementById('addReviewBtn').addEventListener('click', function() {
        showToast('Performance review form opened', 'success');
    });

    // Generate Payroll Button
    document.getElementById('generatePayrollBtn').addEventListener('click', function() {
        showToast('Payroll generated successfully!', 'success');
    });

    // Request Leave Button
    document.getElementById('requestLeaveBtn').addEventListener('click', function() {
        showToast('Leave request form opened', 'success');
    });

    // Refresh Schedule Button
    const refreshScheduleBtn = document.getElementById('refreshScheduleBtn');
    if (refreshScheduleBtn) {
        refreshScheduleBtn.addEventListener('click', function() {
            fetchSchedule();
        });
    }

    const schedMonth = document.getElementById('schedMonth');
    const schedYear = document.getElementById('schedYear');
    if (schedMonth) schedMonth.addEventListener('change', renderSchedule);
    if (schedYear) schedYear.addEventListener('change', renderSchedule);

    // Company Settings Form
    document.getElementById('companySettingsForm').addEventListener('submit', function(e) {
        e.preventDefault();
        showToast('Settings saved successfully!', 'success');
    });

    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
            }
        });
    });
}

// ==================== Navigation ====================
function showSection(sectionId) {
    // Update menu active state
    document.querySelectorAll('.menu li').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.section === sectionId) {
            item.classList.add('active');
        }
    });

    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        employees: 'Employees',
        departments: 'Departments',
        attendance: 'Attendance',
        performance: 'Performance',
        payroll: 'Payroll',
        leave: 'Leave Management',
        reports: 'Reports',
        settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[sectionId] || 'Dashboard';

    // Show section
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');

    // Close mobile menu
    document.querySelector('.sidebar').classList.remove('active');
}

// ==================== Modal Functions ====================
function openEmployeeModal(employee = null) {
    const modal = document.getElementById('employeeModal');
    const title = document.getElementById('employeeModalTitle');
    const form = document.getElementById('employeeForm');

    if (employee) {
        title.textContent = 'Edit Employee';
        form.dataset.editId = employee.id;
        form.firstName.value = employee.firstName;
        form.lastName.value = employee.lastName;
        form.email.value = employee.email;
        form.phone.value = employee.phone;
        form.department.value = employee.department;
        form.position.value = employee.position;
        form.employeeId.value = employee.employeeId;
        form.joinDate.value = employee.joinDate;
        form.employmentType.value = employee.employmentType;
        form.salary.value = employee.salary;
        form.address.value = employee.address;
        form.status.value = employee.status;
    } else {
        title.textContent = 'Add New Employee';
        delete form.dataset.editId;
        form.reset();
    }

    modal.classList.add('active');
}

function openDepartmentModal(department = null) {
    const modal = document.getElementById('departmentModal');
    const title = document.getElementById('departmentModalTitle');
    const form = document.getElementById('departmentForm');

    if (department) {
        title.textContent = 'Edit Department';
        form.dataset.editId = department.id;
        form.name.value = department.name;
        form.code.value = department.code;
        form.head.value = department.head;
        form.description.value = department.description;
        form.budget.value = department.budget;
    } else {
        title.textContent = 'Add New Department';
        delete form.dataset.editId;
        form.reset();
    }

    modal.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function openEmployeeDetails(employee) {
    const modal = document.getElementById('employeeDetailsModal');
    
    document.getElementById('detailImage').src = `https://ui-avatars.com/api/?name=${employee.firstName}+${employee.lastName}&background=4F46E5&color=fff`;
    document.getElementById('detailName').textContent = `${employee.firstName} ${employee.lastName}`;
    document.getElementById('detailPosition').textContent = employee.position;
    document.getElementById('detailDepartment').textContent = employee.department;
    document.getElementById('detailEmail').textContent = employee.email;
    document.getElementById('detailPhone').textContent = employee.phone || 'N/A';
    document.getElementById('detailId').textContent = employee.employeeId;
    document.getElementById('detailJoinDate').textContent = formatDate(employee.joinDate);
    document.getElementById('detailType').textContent = formatEmploymentType(employee.employmentType);
    document.getElementById('detailSalary').textContent = formatCurrency(employee.salary);
    document.getElementById('detailAddress').textContent = employee.address || 'N/A';
    document.getElementById('detailStatus').innerHTML = `<span class="status-badge ${employee.status}">${employee.status}</span>`;

    modal.classList.add('active');
}

// ==================== Dashboard ====================
function renderDashboard() {
    // Update stats
    document.getElementById('totalEmployees').textContent = state.employees.length;
    document.getElementById('presentToday').textContent = state.attendance.filter(a => a.status === 'present').length;
    document.getElementById('onLeave').textContent = state.leave.filter(l => l.status === 'approved').length;
    document.getElementById('totalDepartments').textContent = state.departments.length;

    // Recent employees table
    const recentEmployees = state.employees.slice(0, 5);
    const tbody = document.querySelector('#recentEmployeesTable tbody');
    tbody.innerHTML = recentEmployees.map(emp => `
        <tr>
            <td>
                <div class="user-info">
                    <img src="https://ui-avatars.com/api/?name=${emp.firstName}+${emp.lastName}&background=4F46E5&color=fff" alt="${emp.firstName}">
                    <span>${emp.firstName} ${emp.lastName}</span>
                </div>
            </td>
            <td>${emp.department}</td>
            <td>${emp.position}</td>
            <td><span class="status-badge ${emp.status}">${emp.status}</span></td>
        </tr>
    `).join('');
}

// ==================== Employees ====================
function renderEmployees() {
    const deptFilter = document.getElementById('departmentFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const tbody = document.querySelector('#employeesTable tbody');

    let filtered = state.employees;
    if (deptFilter) filtered = filtered.filter(e => e.department === deptFilter);
    if (statusFilter) filtered = filtered.filter(e => e.status === statusFilter);

    tbody.innerHTML = filtered.map(emp => `
        <tr>
            <td><input type="checkbox"></td>
            <td>${emp.employeeId}</td>
            <td>
                <div class="user-info">
                    <img src="https://ui-avatars.com/api/?name=${emp.firstName}+${emp.lastName}&background=4F46E5&color=fff" alt="${emp.firstName}">
                    <span>${emp.firstName} ${emp.lastName}</span>
                </div>
            </td>
            <td>${emp.email}</td>
            <td>${emp.department}</td>
            <td>${emp.position}</td>
            <td>${formatDate(emp.joinDate)}</td>
            <td><span class="status-badge ${emp.status}">${emp.status}</span></td>
            <td>
                <button class="btn-icon" onclick="viewEmployee(${emp.id})" title="View">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-icon" onclick="editEmployee(${emp.id})" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon" onclick="deleteEmployee(${emp.id})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function viewEmployee(id) {
    const employee = state.employees.find(e => e.id === id);
    if (employee) openEmployeeDetails(employee);
}

function editEmployee(id) {
    const employee = state.employees.find(e => e.id === id);
    if (employee) openEmployeeModal(employee);
}

async function deleteEmployee(id) {
    if (confirm('Are you sure you want to delete this employee?')) {
        try {
            await api(`/employees/${id}`, 'DELETE');
            state.employees = state.employees.filter(e => e.id != id);
            renderEmployees();
            renderDashboard();
            showToast('Employee deleted successfully!', 'success');
        } catch (err) {
            showToast('Failed to delete employee: ' + err.message, 'error');
        }
    }
}

async function saveEmployee() {
    const form = document.getElementById('employeeForm');
    const editId = form.dataset.editId;

    const employeeData = {
        firstName: form.firstName.value,
        lastName: form.lastName.value,
        email: form.email.value,
        phone: form.phone.value,
        department: form.department.value,
        position: form.position.value,
        employeeId: form.employeeId.value,
        joinDate: form.joinDate.value,
        employmentType: form.employmentType.value,
        salary: parseFloat(form.salary.value) || 0,
        address: form.address.value,
        status: form.status.value
    };

    try {
        if (editId) {
            const updated = await api(`/employees/${editId}`, 'PUT', employeeData);
            const index = state.employees.findIndex(e => e.id == editId);
            if (index !== -1) state.employees[index] = updated;
            showToast('Employee updated successfully!', 'success');
        } else {
            const newEmp = await api('/employees', 'POST', employeeData);
            state.employees.push(newEmp);
            showToast('Employee added successfully!', 'success');
        }

        closeModal('employeeModal');
        renderEmployees();
        renderDashboard();
        updateDropdowns();
    } catch (err) {
        showToast('Failed to save employee: ' + err.message, 'error');
    }
}

// ==================== Departments ====================
function renderDepartments() {
    const grid = document.getElementById('departmentsGrid');
    
    grid.innerHTML = state.departments.map(dept => `
        <div class="department-card">
            <div class="department-header">
                <div class="department-icon">
                    <i class="fas fa-building"></i>
                </div>
                <div class="department-actions">
                    <button class="btn-icon" onclick="editDepartment(${dept.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteDepartment(${dept.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <h3>${dept.name}</h3>
            <p class="department-code">${dept.code}</p>
            <div class="department-stats">
                <div class="dept-stat">
                    <span class="dept-stat-label">Employees</span>
                    <span class="dept-stat-value">${dept.employees}</span>
                </div>
                <div class="dept-stat">
                    <span class="dept-stat-label">Budget</span>
                    <span class="dept-stat-value">${formatCurrency(dept.budget)}</span>
                </div>
            </div>
            <div class="department-head">
                <img src="https://ui-avatars.com/api/?name=${dept.head}&background=10B981&color=fff" alt="${dept.head}">
                <span>Head: ${dept.head}</span>
            </div>
        </div>
    `).join('');
}

function editDepartment(id) {
    const department = state.departments.find(d => d.id === id);
    if (department) openDepartmentModal(department);
}

async function deleteDepartment(id) {
    if (confirm('Are you sure you want to delete this department?')) {
        try {
            await api(`/departments/${id}`, 'DELETE');
            state.departments = state.departments.filter(d => d.id != id);
            renderDepartments();
            renderDashboard();
            updateDropdowns();
            showToast('Department deleted successfully!', 'success');
        } catch (err) {
            showToast('Failed to delete department: ' + err.message, 'error');
        }
    }
}

async function saveDepartment() {
    const form = document.getElementById('departmentForm');
    const editId = form.dataset.editId;

    const departmentData = {
        name: form.name.value,
        code: form.code.value,
        head: form.head.value,
        description: form.description.value,
        budget: parseFloat(form.budget.value) || 0,
        employees: Math.floor(Math.random() * 30) + 5
    };

    try {
        if (editId) {
            const updated = await api(`/departments/${editId}`, 'PUT', departmentData);
            const index = state.departments.findIndex(d => d.id == editId);
            if (index !== -1) state.departments[index] = updated;
            showToast('Department updated successfully!', 'success');
        } else {
            const newDept = await api('/departments', 'POST', departmentData);
            state.departments.push(newDept);
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
function renderAttendance() {
    const tbody = document.querySelector('#attendanceTable tbody');
    
    tbody.innerHTML = state.attendance.map(att => `
        <tr>
            <td>${att.employeeId}</td>
            <td>
                <div class="user-info">
                    <img src="https://ui-avatars.com/api/?name=${att.name}&background=4F46E5&color=fff" alt="${att.name}">
                    <span>${att.name}</span>
                </div>
            </td>
            <td>${att.department}</td>
            <td>${att.checkIn}</td>
            <td>${att.checkOut}</td>
            <td>${att.hoursWorked} hrs</td>
            <td><span class="status-badge ${att.status}">${att.status}</span></td>
            <td>
                <button class="btn-icon" onclick="markAttendance('${att.employeeId}', ${att.id})" title="Mark">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-icon" onclick="editAttendance(${att.id})" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function markAttendance(employeeId, id) {
    try {
        const updated = await api(`/attendance/${id}`, 'PUT', {
            checkIn: '09:00',
            checkOut: '18:00',
            hoursWorked: 9,
            status: 'present'
        });
        const index = state.attendance.findIndex(a => a.id == id);
        if (index !== -1) state.attendance[index] = updated;
        renderAttendance();
        showToast('Attendance marked!', 'success');
    } catch (err) {
        showToast('Failed to mark attendance: ' + err.message, 'error');
    }
}

function editAttendance(id) {
    showToast('Edit attendance form opened', 'success');
}

// ==================== Performance ====================
function renderPerformance() {
    const tbody = document.querySelector('#topPerformersTable tbody');
    
    const sorted = [...state.performance].sort((a, b) => b.score - a.score);
    
    tbody.innerHTML = sorted.map((perf, index) => `
        <tr>
            <td>#${index + 1}</td>
            <td>
                <div class="user-info">
                    <img src="https://ui-avatars.com/api/?name=${perf.name}&background=4F46E5&color=fff" alt="${perf.name}">
                    <span>${perf.name}</span>
                </div>
            </td>
            <td>${perf.department}</td>
            <td><strong>${perf.score}</strong></td>
        </tr>
    `).join('');
}

// ==================== Payroll ====================
function renderPayroll() {
    const tbody = document.querySelector('#payrollTable tbody');
    
    tbody.innerHTML = state.payroll.map(pay => `
        <tr>
            <td>${pay.employeeId}</td>
            <td>
                <div class="user-info">
                    <img src="https://ui-avatars.com/api/?name=${pay.name}&background=4F46E5&color=fff" alt="${pay.name}">
                    <span>${pay.name}</span>
                </div>
            </td>
            <td>${pay.department}</td>
            <td>${formatCurrency(pay.basicSalary)}</td>
            <td>${formatCurrency(pay.allowances)}</td>
            <td>${formatCurrency(pay.deductions)}</td>
            <td><strong>${formatCurrency(pay.netSalary)}</strong></td>
            <td><span class="status-badge ${pay.status}">${pay.status}</span></td>
            <td>
                <button class="btn-icon" onclick="viewPayslip('${pay.employeeId}')" title="View Payslip">
                    <i class="fas fa-file-invoice"></i>
                </button>
                <button class="btn-icon" onclick="processPayment('${pay.employeeId}', ${pay.id})" title="Process Payment">
                    <i class="fas fa-money-bill"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function viewPayslip(employeeId) {
    showToast(`Payslip for ${employeeId} generated`, 'success');
}

async function processPayment(employeeId, id) {
    try {
        const updated = await api(`/payroll/${id}`, 'PUT', { status: 'paid' });
        const index = state.payroll.findIndex(p => p.id == id);
        if (index !== -1) state.payroll[index] = updated;
        renderPayroll();
        showToast('Payment processed successfully!', 'success');
    } catch (err) {
        showToast('Failed to process payment: ' + err.message, 'error');
    }
}

// ==================== Leave Management ====================
function renderLeave() {
    const tbody = document.querySelector('#leaveTable tbody');
    
    tbody.innerHTML = state.leave.map(lv => `
        <tr>
            <td>
                <div class="user-info">
                    <img src="https://ui-avatars.com/api/?name=${lv.employee}&background=4F46E5&color=fff" alt="${lv.employee}">
                    <span>${lv.employee}</span>
                </div>
            </td>
            <td>${formatLeaveType(lv.type)}</td>
            <td>${formatDate(lv.fromDate)}</td>
            <td>${formatDate(lv.toDate)}</td>
            <td>${lv.days} days</td>
            <td>${lv.reason}</td>
            <td><span class="status-badge ${lv.status}">${lv.status}</span></td>
            <td>
                <button class="btn-icon" onclick="approveLeave(${lv.id})" title="Approve">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-icon" onclick="rejectLeave(${lv.id})" title="Reject">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function approveLeave(id) {
    try {
        const updated = await api(`/leave/${id}`, 'PUT', { status: 'approved' });
        const index = state.leave.findIndex(l => l.id == id);
        if (index !== -1) state.leave[index] = updated;
        renderLeave();
        showToast('Leave request approved!', 'success');
    } catch (err) {
        showToast('Failed to approve leave: ' + err.message, 'error');
    }
}

async function rejectLeave(id) {
    try {
        const updated = await api(`/leave/${id}`, 'PUT', { status: 'rejected' });
        const index = state.leave.findIndex(l => l.id == id);
        if (index !== -1) state.leave[index] = updated;
        renderLeave();
        showToast('Leave request rejected', 'success');
    } catch (err) {
        showToast('Failed to reject leave: ' + err.message, 'error');
    }
}

// ==================== Reports ====================
function generateReport(type) {
    const reports = {
        attendance: 'Attendance Report',
        performance: 'Performance Report',
        payroll: 'Payroll Report',
        leave: 'Leave Report',
        department: 'Department Report',
        employee: 'Employee Report'
    };
    
    showToast(`${reports[type]} is being generated...`, 'success');
    
    setTimeout(() => {
        showToast('Report downloaded successfully!', 'success');
    }, 1500);
}

// ==================== Helpers ====================
function updateDropdowns() {
    const deptSelects = [
        'departmentFilter',
        'employeeDepartment',
        'performanceDepartment',
        'payrollDepartment'
    ];

    deptSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="">All Departments</option>' +
                state.departments.map(dept => 
                    `<option value="${dept.name}">${dept.name}</option>`
                ).join('');
            select.value = currentValue;
        }
    });

    // Department head dropdown
    const headSelect = document.getElementById('departmentHead');
    if (headSelect) {
        headSelect.innerHTML = '<option value="">Select Employee</option>' +
            state.employees.map(emp => 
                `<option value="${emp.firstName} ${emp.lastName}">${emp.firstName} ${emp.lastName}</option>`
            ).join('');
    }
}

function handleGlobalSearch(e) {
    const query = e.target.value.toLowerCase();
    if (query.length < 2) return;

    const results = state.employees.filter(emp => 
        emp.firstName.toLowerCase().includes(query) ||
        emp.lastName.toLowerCase().includes(query) ||
        emp.email.toLowerCase().includes(query) ||
        emp.employeeId.toLowerCase().includes(query)
    );

    if (results.length > 0) {
        showSection('employees');
        renderEmployees();
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatEmploymentType(type) {
    const types = {
        'full-time': 'Full Time',
        'part-time': 'Part Time',
        'contract': 'Contract',
        'internship': 'Internship'
    };
    return types[type] || type;
}

function formatLeaveType(type) {
    const types = {
        'sick': 'Sick Leave',
        'casual': 'Casual Leave',
        'annual': 'Annual Leave',
        'maternity': 'Maternity Leave'
    };
    return types[type] || type;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ==================== Chart Initialization (Placeholder) ====================
// For actual charts, integrate Chart.js or similar library
function initCharts() {
    // Attendance chart placeholder
    const attendanceCanvas = document.getElementById('attendanceCanvas');
    if (attendanceCanvas) {
        // Initialize with Chart.js when library is loaded
        console.log('Attendance chart ready');
    }

    // Performance chart placeholder
    const performanceCanvas = document.getElementById('performanceCanvas');
    if (performanceCanvas) {
        // Initialize with Chart.js when library is loaded
        console.log('Performance chart ready');
    }
}

// Initialize charts on load
initCharts();
