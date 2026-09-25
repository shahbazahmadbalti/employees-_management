const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDatabase, closeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (index.html, styles.css, script.js)
app.use(express.static(path.join(__dirname)));

// ==================== API Routes ====================

// --- Employees ---
app.get('/api/employees', (req, res) => {
    const db = getDatabase();
    const employees = db.prepare('SELECT * FROM employees ORDER BY id').all();
    res.json(employees);
});

app.get('/api/employees/:id', (req, res) => {
    const db = getDatabase();
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
});

app.post('/api/employees', (req, res) => {
    const db = getDatabase();
    const { employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status } = req.body;
    try {
        const result = db.prepare(`
            INSERT INTO employees (employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(employeeId, firstName, lastName, email, phone || '', department, position, joinDate, employmentType || 'full-time', salary || 0, address || '', status || 'active');
        
        const newEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newEmployee);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/employees/:id', (req, res) => {
    const db = getDatabase();
    const { employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status } = req.body;
    try {
        const result = db.prepare(`
            UPDATE employees SET employeeId=?, firstName=?, lastName=?, email=?, phone=?, department=?, position=?, joinDate=?, employmentType=?, salary=?, address=?, status=?
            WHERE id=?
        `).run(employeeId, firstName, lastName, email, phone || '', department, position, joinDate, employmentType || 'full-time', salary || 0, address || '', status || 'active', req.params.id);
        
        if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
        const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/employees/:id', (req, res) => {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true });
});

// --- Departments ---
app.get('/api/departments', (req, res) => {
    const db = getDatabase();
    const departments = db.prepare('SELECT * FROM departments ORDER BY id').all();
    res.json(departments);
});

app.get('/api/departments/:id', (req, res) => {
    const db = getDatabase();
    const department = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
    if (!department) return res.status(404).json({ error: 'Department not found' });
    res.json(department);
});

app.post('/api/departments', (req, res) => {
    const db = getDatabase();
    const { name, code, head, employees, budget, description } = req.body;
    try {
        const result = db.prepare(`
            INSERT INTO departments (name, code, head, employees, budget, description)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(name, code || '', head || '', employees || 0, budget || 0, description || '');
        
        const newDept = db.prepare('SELECT * FROM departments WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newDept);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/departments/:id', (req, res) => {
    const db = getDatabase();
    const { name, code, head, employees, budget, description } = req.body;
    try {
        const result = db.prepare(`
            UPDATE departments SET name=?, code=?, head=?, employees=?, budget=?, description=?
            WHERE id=?
        `).run(name, code || '', head || '', employees || 0, budget || 0, description || '', req.params.id);
        
        if (result.changes === 0) return res.status(404).json({ error: 'Department not found' });
        const updated = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/departments/:id', (req, res) => {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Department not found' });
    res.json({ success: true });
});

// --- Attendance ---
app.get('/api/attendance', (req, res) => {
    const db = getDatabase();
    const { date } = req.query;
    let attendance;
    if (date) {
        attendance = db.prepare('SELECT * FROM attendance WHERE date = ? ORDER BY id').all(date);
    } else {
        attendance = db.prepare('SELECT * FROM attendance ORDER BY id').all();
    }
    res.json(attendance);
});

app.post('/api/attendance', (req, res) => {
    const db = getDatabase();
    const { employeeId, name, department, checkIn, checkOut, hoursWorked, status, date } = req.body;
    try {
        const result = db.prepare(`
            INSERT INTO attendance (employeeId, name, department, checkIn, checkOut, hoursWorked, status, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(employeeId, name, department, checkIn || '-', checkOut || '-', hoursWorked || 0, status || 'absent', date);
        
        const newAtt = db.prepare('SELECT * FROM attendance WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newAtt);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/attendance/:id', (req, res) => {
    const db = getDatabase();
    const { checkIn, checkOut, hoursWorked, status } = req.body;
    try {
        const result = db.prepare(`
            UPDATE attendance SET checkIn=?, checkOut=?, hoursWorked=?, status=?
            WHERE id=?
        `).run(checkIn, checkOut, hoursWorked || 0, status, req.params.id);
        
        if (result.changes === 0) return res.status(404).json({ error: 'Attendance record not found' });
        const updated = db.prepare('SELECT * FROM attendance WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Performance ---
app.get('/api/performance', (req, res) => {
    const db = getDatabase();
    const performance = db.prepare('SELECT * FROM performance ORDER BY score DESC').all();
    res.json(performance);
});

app.post('/api/performance', (req, res) => {
    const db = getDatabase();
    const { employeeId, name, department, score, rating, period, review } = req.body;
    try {
        const result = db.prepare(`
            INSERT INTO performance (employeeId, name, department, score, rating, period, review)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(employeeId, name, department, score || 0, rating || '', period || '', review || '');
        
        const newPerf = db.prepare('SELECT * FROM performance WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newPerf);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Payroll ---
app.get('/api/payroll', (req, res) => {
    const db = getDatabase();
    const payroll = db.prepare('SELECT * FROM payroll ORDER BY id').all();
    res.json(payroll);
});

app.post('/api/payroll', (req, res) => {
    const db = getDatabase();
    const { employeeId, name, department, basicSalary, allowances, deductions, netSalary, status, month } = req.body;
    try {
        const result = db.prepare(`
            INSERT INTO payroll (employeeId, name, department, basicSalary, allowances, deductions, netSalary, status, month)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(employeeId, name, department, basicSalary || 0, allowances || 0, deductions || 0, netSalary || 0, status || 'pending', month || '');
        
        const newPay = db.prepare('SELECT * FROM payroll WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newPay);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/payroll/:id', (req, res) => {
    const db = getDatabase();
    const { status } = req.body;
    try {
        const result = db.prepare('UPDATE payroll SET status=? WHERE id=?').run(status, req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Payroll record not found' });
        const updated = db.prepare('SELECT * FROM payroll WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Leave Requests ---
app.get('/api/leave', (req, res) => {
    const db = getDatabase();
    const leave = db.prepare('SELECT * FROM leave_requests ORDER BY id').all();
    res.json(leave);
});

app.post('/api/leave', (req, res) => {
    const db = getDatabase();
    const { employee, employeeId, type, fromDate, toDate, days, reason, status } = req.body;
    try {
        const result = db.prepare(`
            INSERT INTO leave_requests (employee, employeeId, type, fromDate, toDate, days, reason, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(employee, employeeId, type, fromDate, toDate, days || 0, reason || '', status || 'pending');
        
        const newLeave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(newLeave);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/leave/:id', (req, res) => {
    const db = getDatabase();
    const { status } = req.body;
    try {
        const result = db.prepare('UPDATE leave_requests SET status=? WHERE id=?').run(status, req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Leave request not found' });
        const updated = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- SPA Fallback (must be last) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== Start Server ====================
app.listen(PORT, () => {
    // Initialize DB on startup
    getDatabase();
    console.log(`Employee Management System running at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
});
