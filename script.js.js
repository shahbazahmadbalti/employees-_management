// Employee Management System - Main JavaScript

// ==================== State Management ====================
const state = {
    employees: [],
    departments: [],
    attendance: [],
    performance: [],
    payroll: [],
    leave: [],
    currentUser: {
        id: 1,
        name: 'Admin User',
        role: 'Administrator'
    }
};

// ==================== Sample Data ====================
const sampleDepartments = [
    { id: 1, name: 'Engineering', code: 'ENG', head: 'John Smith', employees: 25, budget: 500000, description: 'Software development and technical operations' },
    { id: 2, name: 'Human Resources', code: 'HR', head: 'Sarah Johnson', employees: 8, budget: 150000, description: 'Talent acquisition and employee relations' },
    { id: 3, name: 'Marketing', code: 'MKT', head: 'Mike Wilson', employees: 15, budget: 300000, description: 'Brand management and digital marketing' },
    { id: 4, name: 'Finance', code: 'FIN', head: 'Emily Brown', employees: 12, budget: 250000, description: 'Financial planning and accounting' },
    { id: 5, name: 'Sales', code: 'SLS', head: 'David Lee', employees: 20, budget: 400000, description: 'Business development and client relations' },
    { id: 6, name: 'Operations', code: 'OPS', head: 'Lisa Chen', employees: 18, budget: 350000, description: 'Daily operations and logistics' }
];

const sampleEmployees = [
    { id: 1, employeeId: 'EMP001', firstName: 'John', lastName: 'Smith', email: 'john.smith@company.com', phone: '+36 30 123 4567', department: 'Engineering', position: 'Senior Developer', joinDate: '2022-03-15', employmentType: 'full-time', salary: 95000, address: '123 Tech Street, Budapest', status: 'active' },
    { id: 2, employeeId: 'EMP002', firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@company.com', phone: '+36 30 234 5678', department: 'Human Resources', position: 'HR Manager', joinDate: '2021-06-01', employmentType: 'full-time', salary: 85000, address: '456 People Avenue, Budapest', status: 'active' },
    { id: 3, employeeId: 'EMP003', firstName: 'Mike', lastName: 'Wilson', email: 'mike.wilson@company.com', phone: '+36 30 345 6789', department: 'Marketing', position: 'Marketing Director', joinDate: '2020-09-10', employmentType: 'full-time', salary: 105000, address: '789 Brand Boulevard, Budapest', status: 'active' },
    { id: 4, employeeId: 'EMP004', firstName: 'Emily', lastName: 'Brown', email: 'emily.brown@company.com', phone: '+36 30 456 7890', department: 'Finance', position: 'Financial Analyst', joinDate: '2023-01-20', employmentType: 'full-time', salary: 75000, address: '321 Money Lane, Budapest', status: 'active' },
    { id: 5, employeeId: 'EMP005', firstName: 'David', lastName: 'Lee', email: 'david.lee@company.com', phone: '+36 30 567 8901', department: 'Sales', position: 'Sales Representative', joinDate: '2023-05-12', employmentType: 'full-time', salary: 65000, address: '654 Commerce Road, Budapest', status: 'active' },
    { id: 6, employeeId: 'EMP006', firstName: 'Lisa', lastName: 'Chen', email: 'lisa.chen@company.com', phone: '+36 30 678 9012', department: 'Operations', position: 'Operations Manager', joinDate: '2022-08-05', employmentType: 'full-time', salary: 90000, address: '987 Logistics Way, Budapest', status: 'active' },
    { id: 7, employeeId: 'EMP007', firstName: 'James', lastName: 'Taylor', email: 'james.taylor@company.com', phone: '+36 30 789 0123', department: 'Engineering', position: 'Junior Developer', joinDate: '2024-02-01', employmentType: 'full-time', salary: 55000, address: '147 Code Street, Budapest', status: 'active' },
    { id: 8, employeeId: 'EMP008', firstName: 'Anna', lastName: 'Martinez', email: 'anna.martinez@company.com', phone: '+36 30 890 1234', department: 'Marketing', position: 'Content Specialist', joinDate: '2023-11-15', employmentType: 'part-time', salary: 45000, address: '258 Creative Avenue, Budapest', status: 'active' },
    { id: 9, employeeId: 'EMP009', firstName: 'Robert', lastName: 'Garcia', email: 'robert.garcia@company.com', phone: '+36 30 901 2345', department: 'Sales', position: 'Account Executive', joinDate: '2022-04-20', employmentType: 'full-time', salary: 70000, address: '369 Business Park, Budapest', status: 'inactive' },
    { id: 10, employeeId: 'EMP010', firstName: 'Maria', lastName: 'Rodriguez', email: 'maria.rodriguez@company.com', phone: '+36 30 012 3456', department: 'Human Resources', position: 'Recruiter', joinDate: '2023-07-08', employmentType: 'full-time', salary: 60000, address: '471 Talent Street, Budapest', status: 'active' }
];

const sampleAttendance = [
    { id: 1, employeeId: 'EMP001', name: 'John Smith', department: 'Engineering', checkIn: '09:00', checkOut: '18:00', hoursWorked: 9, status: 'present', date: '2026-09-25' },
    { id: 2, employeeId: 'EMP002', name: 'Sarah Johnson', department: 'Human Resources', checkIn: '08:45', checkOut: '17:45', hoursWorked: 9, status: 'present', date: '2026-09-25' },
    { id: 3, employeeId: 'EMP003', name: 'Mike Wilson', department: 'Marketing', checkIn: '09:15', checkOut: '18:15', hoursWorked: 9, status: 'late', date: '2026-09-25' },
    { id: 4, employeeId: 'EMP004', name: 'Emily Brown', department: 'Finance', checkIn: '09:00', checkOut: '18:00', hoursWorked: 9, status: 'present', date: '2026-09-25' },
    { id: 5, employeeId: 'EMP005', name: 'David Lee', department: 'Sales', checkIn: '-', checkOut: '-', hoursWorked: 0, status: 'absent', date: '2026-09-25' },
    { id: 6, employeeId: 'EMP006', name: 'Lisa Chen', department: 'Operations', checkIn: '08:55', checkOut: '17:55', hoursWorked: 9, status: 'present', date: '2026-09-25' }
];

const samplePerformance = [
    { id: 1, employeeId: 'EMP001', name: 'John Smith', department: 'Engineering', score: 92, rating: 'Excellent', period: 'Q3 2026', review: 'Outstanding technical contributions and leadership' },
    { id: 2, employeeId: 'EMP002', name: 'Sarah Johnson', department: 'Human Resources', score: 88, rating: 'Very Good', period: 'Q3 2026', review: 'Excellent people management skills' },
    { id: 3, employeeId: 'EMP003', name: 'Mike Wilson', department: 'Marketing', score: 95, rating: 'Excellent', period: 'Q3 2026', review: 'Exceptional campaign results' },
    { id: 4, employeeId: 'EMP004', name: 'Emily Brown', department: 'Finance', score: 85, rating: 'Very Good', period: 'Q3 2026', review: 'Strong analytical capabilities' },
    { id: 5, employeeId: 'EMP006', name: 'Lisa Chen', department: 'Operations', score: 90, rating: 'Excellent', period: 'Q3 2026', review: 'Improved operational efficiency significantly' }
];

const samplePayroll = [
    { id: 1, employeeId: 'EMP001', name: 'John Smith', department: 'Engineering', basicSalary: 95000, allowances: 15000, deductions: 12000, netSalary: 98000, status: 'paid', month: 'September 2026' },
    { id: 2, employeeId: 'EMP002', name: 'Sarah Johnson', department: 'Human Resources', basicSalary: 85000, allowances: 12000, deductions: 10000, netSalary: 87000, status: 'paid', month: 'September 2026' },
    { id: 3, employeeId: 'EMP003', name: 'Mike Wilson', department: 'Marketing', basicSalary: 105000, allowances: 18000, deductions: 14000, netSalary: 109000, status: 'pending', month: 'September 2026' },
    { id: 4, employeeId: 'EMP004', name: 'Emily Brown', department: 'Finance', basicSalary: 75000, allowances: 10000, deductions: 8000, netSalary: 77000, status: 'paid', month: 'September 2026' },
    { id: 5, employeeId: 'EMP005', name: 'David Lee', department: 'Sales', basicSalary: 65000, allowances: 20000, deductions: 9000, netSalary: 76000, status: 'pending', month: 'September 2026' },
    { id: 6, employeeId: 'EMP006', name: 'Lisa Chen', department: 'Operations', basicSalary: 90000, allowances: 14000, deductions: 11000, netSalary: 93000, status: 'paid', month: 'September 2026' }
];

const sampleLeave = [
    { id: 1, employee: 'John Smith', employeeId: 'EMP001', type: 'sick', fromDate: '2026-09-20', toDate: '2026-09-22', days: 3, reason: 'Medical appointment', status: 'approved' },
    { id: 2, employee: 'Sarah Johnson', employeeId: 'EMP002', type: 'annual', fromDate: '2026-10-01', toDate: '2026-10-10', days: 10, reason: 'Family vacation', status: 'pending' },
    { id: 3, employee: 'Mike Wilson', employeeId: 'EMP003', type: 'casual', fromDate: '2026-09-18', toDate: '2026-09-19', days: 2, reason: 'Personal matters', status: 'approved' },
    { id: 4, employee: 'Emily Brown', employeeId: 'EMP004', type: 'sick', fromDate: '2026-09-25', toDate: '2026-09-26', days: 2, reason: 'Flu', status: 'pending' },
    { id: 5, employee: 'David Lee', employeeId: 'EMP005', type: 'annual', fromDate: '2026-11-15', toDate: '2026-11-30', days: 16, reason: 'Extended travel', status: 'rejected' },
    { id: 6, employee: 'Lisa Chen', employeeId: 'EMP006', type: 'maternity', fromDate: '2026-12-01', toDate: '2027-03-01', days: 90, reason: 'Maternity leave', status: 'approved' }
];

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeData();
    setupEventListeners();
    renderDashboard();
    renderEmployees();
    renderDepartments();
    renderAttendance();
    renderPerformance();
    renderPayroll();
    renderLeave();
    updateDropdowns();
});

function initializeData() {
    state.departments = sampleDepartments;
    state.employees = sampleEmployees;
    state.attendance = sampleAttendance;
    state.performance = samplePerformance;
    state.payroll = samplePayroll;
    state.leave = sampleLeave;
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

function deleteEmployee(id) {
    if (confirm('Are you sure you want to delete this employee?')) {
        state.employees = state.employees.filter(e => e.id !== id);
        renderEmployees();
        renderDashboard();
        showToast('Employee deleted successfully!', 'success');
    }
}

function saveEmployee() {
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

    if (editId) {
        const index = state.employees.findIndex(e => e.id === parseInt(editId));
        if (index !== -1) {
            state.employees[index] = { ...state.employees[index], ...employeeData };
            showToast('Employee updated successfully!', 'success');
        }
    } else {
        const newId = Math.max(...state.employees.map(e => e.id)) + 1;
        state.employees.push({ id: newId, ...employeeData });
        showToast('Employee added successfully!', 'success');
    }

    closeModal('employeeModal');
    renderEmployees();
    renderDashboard();
    updateDropdowns();
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

function deleteDepartment(id) {
    if (confirm('Are you sure you want to delete this department?')) {
        state.departments = state.departments.filter(d => d.id !== id);
        renderDepartments();
        renderDashboard();
        updateDropdowns();
        showToast('Department deleted successfully!', 'success');
    }
}

function saveDepartment() {
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

    if (editId) {
        const index = state.departments.findIndex(d => d.id === parseInt(editId));
        if (index !== -1) {
            state.departments[index] = { ...state.departments[index], ...departmentData };
            showToast('Department updated successfully!', 'success');
        }
    } else {
        const newId = Math.max(...state.departments.map(d => d.id)) + 1;
        state.departments.push({ id: newId, ...departmentData });
        showToast('Department added successfully!', 'success');
    }

    closeModal('departmentModal');
    renderDepartments();
    renderDashboard();
    updateDropdowns();
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
                <button class="btn-icon" onclick="markAttendance('${att.employeeId}')" title="Mark">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-icon" onclick="editAttendance(${att.id})" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function markAttendance(employeeId) {
    const attendance = state.attendance.find(a => a.employeeId === employeeId);
    if (attendance) {
        attendance.status = 'present';
        attendance.checkIn = '09:00';
        attendance.checkOut = '18:00';
        attendance.hoursWorked = 9;
        renderAttendance();
        showToast('Attendance marked!', 'success');
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
                <button class="btn-icon" onclick="processPayment('${pay.employeeId}')" title="Process Payment">
                    <i class="fas fa-money-bill"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function viewPayslip(employeeId) {
    showToast(`Payslip for ${employeeId} generated`, 'success');
}

function processPayment(employeeId) {
    const payroll = state.payroll.find(p => p.employeeId === employeeId);
    if (payroll) {
        payroll.status = 'paid';
        renderPayroll();
        showToast('Payment processed successfully!', 'success');
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

function approveLeave(id) {
    const leave = state.leave.find(l => l.id === id);
    if (leave) {
        leave.status = 'approved';
        renderLeave();
        showToast('Leave request approved!', 'success');
    }
}

function rejectLeave(id) {
    const leave = state.leave.find(l => l.id === id);
    if (leave) {
        leave.status = 'rejected';
        renderLeave();
        showToast('Leave request rejected', 'success');
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