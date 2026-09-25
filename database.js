const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'ems.db');

let db = null;
let dbReady = null; // Promise that resolves when DB is initialized

function getDbReadyPromise() {
    if (!dbReady) {
        dbReady = initializeDatabase();
    }
    return dbReady;
}

async function initializeDatabase() {
    const SQL = await initSqlJs();

    // Load existing DB file or create new one
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('Loaded existing database from', DB_PATH);
    } else {
        db = new SQL.Database();
        console.log('Created new database');
    }

    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');

    initializeTables();
    seedDataIfEmpty();
    saveDatabase();

    return db;
}

function getDatabase() {
    return db;
}

function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

function initializeTables() {
    db.run(`
        CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT,
            head TEXT,
            employees INTEGER DEFAULT 0,
            budget REAL DEFAULT 0,
            description TEXT
        )
    `);

    db.run(`
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
        )
    `);

    db.run(`
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
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS performance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employeeId TEXT NOT NULL,
            name TEXT,
            department TEXT,
            score INTEGER DEFAULT 0,
            rating TEXT,
            period TEXT,
            review TEXT
        )
    `);

    db.run(`
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
        )
    `);

    db.run(`
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
        )
    `);
}

// Helper: run a SELECT and return array of row objects
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// Helper: run a SELECT and return first row object or null
function queryOne(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

// Helper: run INSERT/UPDATE/DELETE, return { changes, lastInsertRowid }
function runSql(sql, params = []) {
    db.run(sql, params);
    const changes = db.getRowsModified();
    const lastId = queryOne('SELECT last_insert_rowid() as id');
    saveDatabase(); // Persist after every write
    return { changes, lastInsertRowid: lastId ? lastId.id : 0 };
}

function seedDataIfEmpty() {
    const count = queryOne('SELECT COUNT(*) as cnt FROM departments');
    if (count && count.cnt > 0) return; // Already seeded

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
        db.run('INSERT INTO departments (name, code, head, employees, budget, description) VALUES (?, ?, ?, ?, ?, ?)', d);
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
        db.run('INSERT INTO employees (employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', e);
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
        db.run('INSERT INTO attendance (employeeId, name, department, checkIn, checkOut, hoursWorked, status, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', a);
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
        db.run('INSERT INTO performance (employeeId, name, department, score, rating, period, review) VALUES (?, ?, ?, ?, ?, ?, ?)', p);
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
        db.run('INSERT INTO payroll (employeeId, name, department, basicSalary, allowances, deductions, netSalary, status, month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', p);
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
        db.run('INSERT INTO leave_requests (employee, employeeId, type, fromDate, toDate, days, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', l);
    }

    console.log('Database seeded with sample data.');
}

function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        dbReady = null;
    }
}

module.exports = { getDbReadyPromise, getDatabase, queryAll, queryOne, runSql, saveDatabase, closeDatabase };
