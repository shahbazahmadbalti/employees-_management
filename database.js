const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'ems.db');

let db;

function getDatabase() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initializeTables();
        seedDataIfEmpty();
    }
    return db;
}

function initializeTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT,
            head TEXT,
            employees INTEGER DEFAULT 0,
            budget REAL DEFAULT 0,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employeeId TEXT NOT NULL UNIQUE,
            firstName TEXT NOT NULL,
            lastName TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            department TEXT,
            position TEXT,
            joinDate TEXT,
            employmentType TEXT DEFAULT 'full-time',
            salary REAL DEFAULT 0,
            address TEXT,
            status TEXT DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employeeId TEXT NOT NULL,
            name TEXT,
            department TEXT,
            checkIn TEXT,
            checkOut TEXT,
            hoursWorked REAL DEFAULT 0,
            status TEXT DEFAULT 'absent',
            date TEXT
        );

        CREATE TABLE IF NOT EXISTS performance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employeeId TEXT NOT NULL,
            name TEXT,
            department TEXT,
            score INTEGER DEFAULT 0,
            rating TEXT,
            period TEXT,
            review TEXT
        );

        CREATE TABLE IF NOT EXISTS payroll (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employeeId TEXT NOT NULL,
            name TEXT,
            department TEXT,
            basicSalary REAL DEFAULT 0,
            allowances REAL DEFAULT 0,
            deductions REAL DEFAULT 0,
            netSalary REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            month TEXT
        );

        CREATE TABLE IF NOT EXISTS leave_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee TEXT NOT NULL,
            employeeId TEXT NOT NULL,
            type TEXT,
            fromDate TEXT,
            toDate TEXT,
            days INTEGER DEFAULT 0,
            reason TEXT,
            status TEXT DEFAULT 'pending'
        );
    `);
}

function seedDataIfEmpty() {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM departments').get();
    if (count.cnt > 0) return; // Already seeded

    // Seed Departments
    const insertDept = db.prepare(`
        INSERT INTO departments (name, code, head, employees, budget, description)
        VALUES (@name, @code, @head, @employees, @budget, @description)
    `);

    const departments = [
        { name: 'Engineering', code: 'ENG', head: 'John Smith', employees: 25, budget: 500000, description: 'Software development and technical operations' },
        { name: 'Human Resources', code: 'HR', head: 'Sarah Johnson', employees: 8, budget: 150000, description: 'Talent acquisition and employee relations' },
        { name: 'Marketing', code: 'MKT', head: 'Mike Wilson', employees: 15, budget: 300000, description: 'Brand management and digital marketing' },
        { name: 'Finance', code: 'FIN', head: 'Emily Brown', employees: 12, budget: 250000, description: 'Financial planning and accounting' },
        { name: 'Sales', code: 'SLS', head: 'David Lee', employees: 20, budget: 400000, description: 'Business development and client relations' },
        { name: 'Operations', code: 'OPS', head: 'Lisa Chen', employees: 18, budget: 350000, description: 'Daily operations and logistics' }
    ];

    const seedDepts = db.transaction(() => {
        for (const dept of departments) insertDept.run(dept);
    });
    seedDepts();

    // Seed Employees
    const insertEmp = db.prepare(`
        INSERT INTO employees (employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status)
        VALUES (@employeeId, @firstName, @lastName, @email, @phone, @department, @position, @joinDate, @employmentType, @salary, @address, @status)
    `);

    const employees = [
        { employeeId: 'EMP001', firstName: 'John', lastName: 'Smith', email: 'john.smith@company.com', phone: '+36 30 123 4567', department: 'Engineering', position: 'Senior Developer', joinDate: '2022-03-15', employmentType: 'full-time', salary: 95000, address: '123 Tech Street, Budapest', status: 'active' },
        { employeeId: 'EMP002', firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@company.com', phone: '+36 30 234 5678', department: 'Human Resources', position: 'HR Manager', joinDate: '2021-06-01', employmentType: 'full-time', salary: 85000, address: '456 People Avenue, Budapest', status: 'active' },
        { employeeId: 'EMP003', firstName: 'Mike', lastName: 'Wilson', email: 'mike.wilson@company.com', phone: '+36 30 345 6789', department: 'Marketing', position: 'Marketing Director', joinDate: '2020-09-10', employmentType: 'full-time', salary: 105000, address: '789 Brand Boulevard, Budapest', status: 'active' },
        { employeeId: 'EMP004', firstName: 'Emily', lastName: 'Brown', email: 'emily.brown@company.com', phone: '+36 30 456 7890', department: 'Finance', position: 'Financial Analyst', joinDate: '2023-01-20', employmentType: 'full-time', salary: 75000, address: '321 Money Lane, Budapest', status: 'active' },
        { employeeId: 'EMP005', firstName: 'David', lastName: 'Lee', email: 'david.lee@company.com', phone: '+36 30 567 8901', department: 'Sales', position: 'Sales Representative', joinDate: '2023-05-12', employmentType: 'full-time', salary: 65000, address: '654 Commerce Road, Budapest', status: 'active' },
        { employeeId: 'EMP006', firstName: 'Lisa', lastName: 'Chen', email: 'lisa.chen@company.com', phone: '+36 30 678 9012', department: 'Operations', position: 'Operations Manager', joinDate: '2022-08-05', employmentType: 'full-time', salary: 90000, address: '987 Logistics Way, Budapest', status: 'active' },
        { employeeId: 'EMP007', firstName: 'James', lastName: 'Taylor', email: 'james.taylor@company.com', phone: '+36 30 789 0123', department: 'Engineering', position: 'Junior Developer', joinDate: '2024-02-01', employmentType: 'full-time', salary: 55000, address: '147 Code Street, Budapest', status: 'active' },
        { employeeId: 'EMP008', firstName: 'Anna', lastName: 'Martinez', email: 'anna.martinez@company.com', phone: '+36 30 890 1234', department: 'Marketing', position: 'Content Specialist', joinDate: '2023-11-15', employmentType: 'part-time', salary: 45000, address: '258 Creative Avenue, Budapest', status: 'active' },
        { employeeId: 'EMP009', firstName: 'Robert', lastName: 'Garcia', email: 'robert.garcia@company.com', phone: '+36 30 901 2345', department: 'Sales', position: 'Account Executive', joinDate: '2022-04-20', employmentType: 'full-time', salary: 70000, address: '369 Business Park, Budapest', status: 'inactive' },
        { employeeId: 'EMP010', firstName: 'Maria', lastName: 'Rodriguez', email: 'maria.rodriguez@company.com', phone: '+36 30 012 3456', department: 'Human Resources', position: 'Recruiter', joinDate: '2023-07-08', employmentType: 'full-time', salary: 60000, address: '471 Talent Street, Budapest', status: 'active' }
    ];

    const seedEmps = db.transaction(() => {
        for (const emp of employees) insertEmp.run(emp);
    });
    seedEmps();

    // Seed Attendance
    const insertAtt = db.prepare(`
        INSERT INTO attendance (employeeId, name, department, checkIn, checkOut, hoursWorked, status, date)
        VALUES (@employeeId, @name, @department, @checkIn, @checkOut, @hoursWorked, @status, @date)
    `);

    const attendance = [
        { employeeId: 'EMP001', name: 'John Smith', department: 'Engineering', checkIn: '09:00', checkOut: '18:00', hoursWorked: 9, status: 'present', date: '2026-09-25' },
        { employeeId: 'EMP002', name: 'Sarah Johnson', department: 'Human Resources', checkIn: '08:45', checkOut: '17:45', hoursWorked: 9, status: 'present', date: '2026-09-25' },
        { employeeId: 'EMP003', name: 'Mike Wilson', department: 'Marketing', checkIn: '09:15', checkOut: '18:15', hoursWorked: 9, status: 'late', date: '2026-09-25' },
        { employeeId: 'EMP004', name: 'Emily Brown', department: 'Finance', checkIn: '09:00', checkOut: '18:00', hoursWorked: 9, status: 'present', date: '2026-09-25' },
        { employeeId: 'EMP005', name: 'David Lee', department: 'Sales', checkIn: '-', checkOut: '-', hoursWorked: 0, status: 'absent', date: '2026-09-25' },
        { employeeId: 'EMP006', name: 'Lisa Chen', department: 'Operations', checkIn: '08:55', checkOut: '17:55', hoursWorked: 9, status: 'present', date: '2026-09-25' }
    ];

    const seedAtt = db.transaction(() => {
        for (const att of attendance) insertAtt.run(att);
    });
    seedAtt();

    // Seed Performance
    const insertPerf = db.prepare(`
        INSERT INTO performance (employeeId, name, department, score, rating, period, review)
        VALUES (@employeeId, @name, @department, @score, @rating, @period, @review)
    `);

    const performance = [
        { employeeId: 'EMP001', name: 'John Smith', department: 'Engineering', score: 92, rating: 'Excellent', period: 'Q3 2026', review: 'Outstanding technical contributions and leadership' },
        { employeeId: 'EMP002', name: 'Sarah Johnson', department: 'Human Resources', score: 88, rating: 'Very Good', period: 'Q3 2026', review: 'Excellent people management skills' },
        { employeeId: 'EMP003', name: 'Mike Wilson', department: 'Marketing', score: 95, rating: 'Excellent', period: 'Q3 2026', review: 'Exceptional campaign results' },
        { employeeId: 'EMP004', name: 'Emily Brown', department: 'Finance', score: 85, rating: 'Very Good', period: 'Q3 2026', review: 'Strong analytical capabilities' },
        { employeeId: 'EMP006', name: 'Lisa Chen', department: 'Operations', score: 90, rating: 'Excellent', period: 'Q3 2026', review: 'Improved operational efficiency significantly' }
    ];

    const seedPerf = db.transaction(() => {
        for (const perf of performance) insertPerf.run(perf);
    });
    seedPerf();

    // Seed Payroll
    const insertPay = db.prepare(`
        INSERT INTO payroll (employeeId, name, department, basicSalary, allowances, deductions, netSalary, status, month)
        VALUES (@employeeId, @name, @department, @basicSalary, @allowances, @deductions, @netSalary, @status, @month)
    `);

    const payroll = [
        { employeeId: 'EMP001', name: 'John Smith', department: 'Engineering', basicSalary: 95000, allowances: 15000, deductions: 12000, netSalary: 98000, status: 'paid', month: 'September 2026' },
        { employeeId: 'EMP002', name: 'Sarah Johnson', department: 'Human Resources', basicSalary: 85000, allowances: 12000, deductions: 10000, netSalary: 87000, status: 'paid', month: 'September 2026' },
        { employeeId: 'EMP003', name: 'Mike Wilson', department: 'Marketing', basicSalary: 105000, allowances: 18000, deductions: 14000, netSalary: 109000, status: 'pending', month: 'September 2026' },
        { employeeId: 'EMP004', name: 'Emily Brown', department: 'Finance', basicSalary: 75000, allowances: 10000, deductions: 8000, netSalary: 77000, status: 'paid', month: 'September 2026' },
        { employeeId: 'EMP005', name: 'David Lee', department: 'Sales', basicSalary: 65000, allowances: 20000, deductions: 9000, netSalary: 76000, status: 'pending', month: 'September 2026' },
        { employeeId: 'EMP006', name: 'Lisa Chen', department: 'Operations', basicSalary: 90000, allowances: 14000, deductions: 11000, netSalary: 93000, status: 'paid', month: 'September 2026' }
    ];

    const seedPay = db.transaction(() => {
        for (const pay of payroll) insertPay.run(pay);
    });
    seedPay();

    // Seed Leave Requests
    const insertLeave = db.prepare(`
        INSERT INTO leave_requests (employee, employeeId, type, fromDate, toDate, days, reason, status)
        VALUES (@employee, @employeeId, @type, @fromDate, @toDate, @days, @reason, @status)
    `);

    const leaveRequests = [
        { employee: 'John Smith', employeeId: 'EMP001', type: 'sick', fromDate: '2026-09-20', toDate: '2026-09-22', days: 3, reason: 'Medical appointment', status: 'approved' },
        { employee: 'Sarah Johnson', employeeId: 'EMP002', type: 'annual', fromDate: '2026-10-01', toDate: '2026-10-10', days: 10, reason: 'Family vacation', status: 'pending' },
        { employee: 'Mike Wilson', employeeId: 'EMP003', type: 'casual', fromDate: '2026-09-18', toDate: '2026-09-19', days: 2, reason: 'Personal matters', status: 'approved' },
        { employee: 'Emily Brown', employeeId: 'EMP004', type: 'sick', fromDate: '2026-09-25', toDate: '2026-09-26', days: 2, reason: 'Flu', status: 'pending' },
        { employee: 'David Lee', employeeId: 'EMP005', type: 'annual', fromDate: '2026-11-15', toDate: '2026-11-30', days: 16, reason: 'Extended travel', status: 'rejected' },
        { employee: 'Lisa Chen', employeeId: 'EMP006', type: 'maternity', fromDate: '2026-12-01', toDate: '2027-03-01', days: 90, reason: 'Maternity leave', status: 'approved' }
    ];

    const seedLeave = db.transaction(() => {
        for (const lv of leaveRequests) insertLeave.run(lv);
    });
    seedLeave();

    console.log('Database seeded with sample data.');
}

function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDatabase, closeDatabase };
