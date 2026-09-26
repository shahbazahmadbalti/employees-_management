const { sql } = require('@vercel/postgres');

// ==================== Table Creation ====================
async function initializeTables() {
    await sql`
        CREATE TABLE IF NOT EXISTS departments (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT,
            head TEXT,
            employees INTEGER DEFAULT 0,
            budget NUMERIC DEFAULT 0,
            description TEXT
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL UNIQUE,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            department TEXT,
            position TEXT,
            join_date TEXT,
            employment_type TEXT DEFAULT 'full-time',
            salary NUMERIC DEFAULT 0,
            address TEXT,
            status TEXT DEFAULT 'active'
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL,
            name TEXT,
            department TEXT,
            check_in TEXT,
            check_out TEXT,
            hours_worked NUMERIC DEFAULT 0,
            status TEXT DEFAULT 'absent',
            date TEXT
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS performance (
            id SERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL,
            name TEXT,
            department TEXT,
            score INTEGER DEFAULT 0,
            rating TEXT,
            period TEXT,
            review TEXT
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS payroll (
            id SERIAL PRIMARY KEY,
            employee_id TEXT NOT NULL,
            name TEXT,
            department TEXT,
            basic_salary NUMERIC DEFAULT 0,
            allowances NUMERIC DEFAULT 0,
            deductions NUMERIC DEFAULT 0,
            net_salary NUMERIC DEFAULT 0,
            status TEXT DEFAULT 'pending',
            month TEXT
        )
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS leave_requests (
            id SERIAL PRIMARY KEY,
            employee TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            type TEXT,
            from_date TEXT,
            to_date TEXT,
            days INTEGER DEFAULT 0,
            reason TEXT,
            status TEXT DEFAULT 'pending'
        )
    `;

    console.log('All tables created successfully.');
}

// ==================== Seed Data ====================
async function seedDataIfEmpty() {
    const { rows } = await sql`SELECT COUNT(*) as cnt FROM departments`;
    if (parseInt(rows[0].cnt) > 0) {
        console.log('Database already seeded, skipping.');
        return;
    }

    console.log('Seeding database with sample data...');

    // Seed Departments
    const departments = [
        ['Engineering', 'ENG', 'John Smith', 25, 500000, 'Software development and technical operations'],
        ['Human Resources', 'HR', 'Sarah Johnson', 8, 150000, 'Talent acquisition and employee relations'],
        ['Marketing', 'MKT', 'Mike Wilson', 15, 300000, 'Brand management and digital marketing'],
        ['Finance', 'FIN', 'Emily Brown', 12, 250000, 'Financial planning and accounting'],
        ['Sales', 'SLS', 'David Lee', 20, 400000, 'Business development and client relations'],
        ['Operations', 'OPS', 'Lisa Chen', 18, 350000, 'Daily operations and logistics']
    ];
    for (const d of departments) {
        await sql`INSERT INTO departments (name, code, head, employees, budget, description) VALUES (${d[0]}, ${d[1]}, ${d[2]}, ${d[3]}, ${d[4]}, ${d[5]})`;
    }

    // Seed Employees
    const employees = [
        ['EMP001', 'John', 'Smith', 'john.smith@company.com', '+36 30 123 4567', 'Engineering', 'Senior Developer', '2022-03-15', 'full-time', 95000, '123 Tech Street, Budapest', 'active'],
        ['EMP002', 'Sarah', 'Johnson', 'sarah.johnson@company.com', '+36 30 234 5678', 'Human Resources', 'HR Manager', '2021-06-01', 'full-time', 85000, '456 People Avenue, Budapest', 'active'],
        ['EMP003', 'Mike', 'Wilson', 'mike.wilson@company.com', '+36 30 345 6789', 'Marketing', 'Marketing Director', '2020-09-10', 'full-time', 105000, '789 Brand Boulevard, Budapest', 'active'],
        ['EMP004', 'Emily', 'Brown', 'emily.brown@company.com', '+36 30 456 7890', 'Finance', 'Financial Analyst', '2023-01-20', 'full-time', 75000, '321 Money Lane, Budapest', 'active'],
        ['EMP005', 'David', 'Lee', 'david.lee@company.com', '+36 30 567 8901', 'Sales', 'Sales Representative', '2023-05-12', 'full-time', 65000, '654 Commerce Road, Budapest', 'active'],
        ['EMP006', 'Lisa', 'Chen', 'lisa.chen@company.com', '+36 30 678 9012', 'Operations', 'Operations Manager', '2022-08-05', 'full-time', 90000, '987 Logistics Way, Budapest', 'active'],
        ['EMP007', 'James', 'Taylor', 'james.taylor@company.com', '+36 30 789 0123', 'Engineering', 'Junior Developer', '2024-02-01', 'full-time', 55000, '147 Code Street, Budapest', 'active'],
        ['EMP008', 'Anna', 'Martinez', 'anna.martinez@company.com', '+36 30 890 1234', 'Marketing', 'Content Specialist', '2023-11-15', 'part-time', 45000, '258 Creative Avenue, Budapest', 'active'],
        ['EMP009', 'Robert', 'Garcia', 'robert.garcia@company.com', '+36 30 901 2345', 'Sales', 'Account Executive', '2022-04-20', 'full-time', 70000, '369 Business Park, Budapest', 'inactive'],
        ['EMP010', 'Maria', 'Rodriguez', 'maria.rodriguez@company.com', '+36 30 012 3456', 'Human Resources', 'Recruiter', '2023-07-08', 'full-time', 60000, '471 Talent Street, Budapest', 'active']
    ];
    for (const e of employees) {
        await sql`INSERT INTO employees (employee_id, first_name, last_name, email, phone, department, position, join_date, employment_type, salary, address, status) VALUES (${e[0]}, ${e[1]}, ${e[2]}, ${e[3]}, ${e[4]}, ${e[5]}, ${e[6]}, ${e[7]}, ${e[8]}, ${e[9]}, ${e[10]}, ${e[11]})`;
    }

    // Seed Attendance
    const attendance = [
        ['EMP001', 'John Smith', 'Engineering', '09:00', '18:00', 9, 'present', '2026-09-25'],
        ['EMP002', 'Sarah Johnson', 'Human Resources', '08:45', '17:45', 9, 'present', '2026-09-25'],
        ['EMP003', 'Mike Wilson', 'Marketing', '09:15', '18:15', 9, 'late', '2026-09-25'],
        ['EMP004', 'Emily Brown', 'Finance', '09:00', '18:00', 9, 'present', '2026-09-25'],
        ['EMP005', 'David Lee', 'Sales', '-', '-', 0, 'absent', '2026-09-25'],
        ['EMP006', 'Lisa Chen', 'Operations', '08:55', '17:55', 9, 'present', '2026-09-25']
    ];
    for (const a of attendance) {
        await sql`INSERT INTO attendance (employee_id, name, department, check_in, check_out, hours_worked, status, date) VALUES (${a[0]}, ${a[1]}, ${a[2]}, ${a[3]}, ${a[4]}, ${a[5]}, ${a[6]}, ${a[7]})`;
    }

    // Seed Performance
    const performance = [
        ['EMP001', 'John Smith', 'Engineering', 92, 'Excellent', 'Q3 2026', 'Outstanding technical contributions and leadership'],
        ['EMP002', 'Sarah Johnson', 'Human Resources', 88, 'Very Good', 'Q3 2026', 'Excellent people management skills'],
        ['EMP003', 'Mike Wilson', 'Marketing', 95, 'Excellent', 'Q3 2026', 'Exceptional campaign results'],
        ['EMP004', 'Emily Brown', 'Finance', 85, 'Very Good', 'Q3 2026', 'Strong analytical capabilities'],
        ['EMP006', 'Lisa Chen', 'Operations', 90, 'Excellent', 'Q3 2026', 'Improved operational efficiency significantly']
    ];
    for (const p of performance) {
        await sql`INSERT INTO performance (employee_id, name, department, score, rating, period, review) VALUES (${p[0]}, ${p[1]}, ${p[2]}, ${p[3]}, ${p[4]}, ${p[5]}, ${p[6]})`;
    }

    // Seed Payroll
    const payroll = [
        ['EMP001', 'John Smith', 'Engineering', 95000, 15000, 12000, 98000, 'paid', 'September 2026'],
        ['EMP002', 'Sarah Johnson', 'Human Resources', 85000, 12000, 10000, 87000, 'paid', 'September 2026'],
        ['EMP003', 'Mike Wilson', 'Marketing', 105000, 18000, 14000, 109000, 'pending', 'September 2026'],
        ['EMP004', 'Emily Brown', 'Finance', 75000, 10000, 8000, 77000, 'paid', 'September 2026'],
        ['EMP005', 'David Lee', 'Sales', 65000, 20000, 9000, 76000, 'pending', 'September 2026'],
        ['EMP006', 'Lisa Chen', 'Operations', 90000, 14000, 11000, 93000, 'paid', 'September 2026']
    ];
    for (const p of payroll) {
        await sql`INSERT INTO payroll (employee_id, name, department, basic_salary, allowances, deductions, net_salary, status, month) VALUES (${p[0]}, ${p[1]}, ${p[2]}, ${p[3]}, ${p[4]}, ${p[5]}, ${p[6]}, ${p[7]}, ${p[8]})`;
    }

    // Seed Leave Requests
    const leaveRequests = [
        ['John Smith', 'EMP001', 'sick', '2026-09-20', '2026-09-22', 3, 'Medical appointment', 'approved'],
        ['Sarah Johnson', 'EMP002', 'annual', '2026-10-01', '2026-10-10', 10, 'Family vacation', 'pending'],
        ['Mike Wilson', 'EMP003', 'casual', '2026-09-18', '2026-09-19', 2, 'Personal matters', 'approved'],
        ['Emily Brown', 'EMP004', 'sick', '2026-09-25', '2026-09-26', 2, 'Flu', 'pending'],
        ['David Lee', 'EMP005', 'annual', '2026-11-15', '2026-11-30', 16, 'Extended travel', 'rejected'],
        ['Lisa Chen', 'EMP006', 'maternity', '2026-12-01', '2027-03-01', 90, 'Maternity leave', 'approved']
    ];
    for (const l of leaveRequests) {
        await sql`INSERT INTO leave_requests (employee, employee_id, type, from_date, to_date, days, reason, status) VALUES (${l[0]}, ${l[1]}, ${l[2]}, ${l[3]}, ${l[4]}, ${l[5]}, ${l[6]}, ${l[7]})`;
    }

    console.log('Database seeded successfully.');
}

// ==================== Row Mapper ====================
// Maps snake_case DB columns to camelCase for the frontend API
function mapRow(row, mapping) {
    const mapped = {};
    for (const [dbCol, apiKey] of Object.entries(mapping)) {
        if (row[dbCol] !== undefined) {
            mapped[apiKey] = row[dbCol];
        }
    }
    return mapped;
}

const employeeMap = {
    id: 'id', employee_id: 'employeeId', first_name: 'firstName', last_name: 'lastName',
    email: 'email', phone: 'phone', department: 'department', position: 'position',
    join_date: 'joinDate', employment_type: 'employmentType', salary: 'salary',
    address: 'address', status: 'status'
};

const departmentMap = {
    id: 'id', name: 'name', code: 'code', head: 'head',
    employees: 'employees', budget: 'budget', description: 'description'
};

const attendanceMap = {
    id: 'id', employee_id: 'employeeId', name: 'name', department: 'department',
    check_in: 'checkIn', check_out: 'checkOut', hours_worked: 'hoursWorked',
    status: 'status', date: 'date'
};

const performanceMap = {
    id: 'id', employee_id: 'employeeId', name: 'name', department: 'department',
    score: 'score', rating: 'rating', period: 'period', review: 'review'
};

const payrollMap = {
    id: 'id', employee_id: 'employeeId', name: 'name', department: 'department',
    basic_salary: 'basicSalary', allowances: 'allowances', deductions: 'deductions',
    net_salary: 'netSalary', status: 'status', month: 'month'
};

const leaveMap = {
    id: 'id', employee: 'employee', employee_id: 'employeeId', type: 'type',
    from_date: 'fromDate', to_date: 'toDate', days: 'days',
    reason: 'reason', status: 'status'
};

function mapRows(rows, mapping) {
    return rows.map(r => mapRow(r, mapping));
}

module.exports = {
    initializeTables, seedDataIfEmpty,
    mapRow, mapRows,
    employeeMap, departmentMap, attendanceMap, performanceMap, payrollMap, leaveMap
};
