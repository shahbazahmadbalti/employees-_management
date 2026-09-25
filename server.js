const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDbReadyPromise, queryAll, queryOne, runSql, closeDatabase } = require('./database');

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
    const employees = queryAll('SELECT * FROM employees ORDER BY id');
    res.json(employees);
});

app.get('/api/employees/:id', (req, res) => {
    const employee = queryOne('SELECT * FROM employees WHERE id = ?', [Number(req.params.id)]);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
});

app.post('/api/employees', (req, res) => {
    const { employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status } = req.body;
    try {
        const result = runSql(
            'INSERT INTO employees (employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [employeeId, firstName, lastName, email, phone || '', department, position, joinDate, employmentType || 'full-time', salary || 0, address || '', status || 'active']
        );
        const newEmployee = queryOne('SELECT * FROM employees WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(newEmployee);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/employees/:id', (req, res) => {
    const { employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status } = req.body;
    try {
        const result = runSql(
            'UPDATE employees SET employeeId=?, firstName=?, lastName=?, email=?, phone=?, department=?, position=?, joinDate=?, employmentType=?, salary=?, address=?, status=? WHERE id=?',
            [employeeId, firstName, lastName, email, phone || '', department, position, joinDate, employmentType || 'full-time', salary || 0, address || '', status || 'active', Number(req.params.id)]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
        const updated = queryOne('SELECT * FROM employees WHERE id = ?', [Number(req.params.id)]);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/employees/:id', (req, res) => {
    const result = runSql('DELETE FROM employees WHERE id = ?', [Number(req.params.id)]);
    if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true });
});

// --- Departments ---
app.get('/api/departments', (req, res) => {
    const departments = queryAll('SELECT * FROM departments ORDER BY id');
    res.json(departments);
});

app.get('/api/departments/:id', (req, res) => {
    const department = queryOne('SELECT * FROM departments WHERE id = ?', [Number(req.params.id)]);
    if (!department) return res.status(404).json({ error: 'Department not found' });
    res.json(department);
});

app.post('/api/departments', (req, res) => {
    const { name, code, head, employees, budget, description } = req.body;
    try {
        const result = runSql(
            'INSERT INTO departments (name, code, head, employees, budget, description) VALUES (?, ?, ?, ?, ?, ?)',
            [name, code || '', head || '', employees || 0, budget || 0, description || '']
        );
        const newDept = queryOne('SELECT * FROM departments WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(newDept);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/departments/:id', (req, res) => {
    const { name, code, head, employees, budget, description } = req.body;
    try {
        const result = runSql(
            'UPDATE departments SET name=?, code=?, head=?, employees=?, budget=?, description=? WHERE id=?',
            [name, code || '', head || '', employees || 0, budget || 0, description || '', Number(req.params.id)]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Department not found' });
        const updated = queryOne('SELECT * FROM departments WHERE id = ?', [Number(req.params.id)]);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/departments/:id', (req, res) => {
    const result = runSql('DELETE FROM departments WHERE id = ?', [Number(req.params.id)]);
    if (result.changes === 0) return res.status(404).json({ error: 'Department not found' });
    res.json({ success: true });
});

// --- Attendance ---
app.get('/api/attendance', (req, res) => {
    const { date } = req.query;
    let attendance;
    if (date) {
        attendance = queryAll('SELECT * FROM attendance WHERE date = ? ORDER BY id', [date]);
    } else {
        attendance = queryAll('SELECT * FROM attendance ORDER BY id');
    }
    res.json(attendance);
});

app.post('/api/attendance', (req, res) => {
    const { employeeId, name, department, checkIn, checkOut, hoursWorked, status, date } = req.body;
    try {
        const result = runSql(
            'INSERT INTO attendance (employeeId, name, department, checkIn, checkOut, hoursWorked, status, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [employeeId, name, department, checkIn || '-', checkOut || '-', hoursWorked || 0, status || 'absent', date]
        );
        const newAtt = queryOne('SELECT * FROM attendance WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(newAtt);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/attendance/:id', (req, res) => {
    const { checkIn, checkOut, hoursWorked, status } = req.body;
    try {
        const result = runSql(
            'UPDATE attendance SET checkIn=?, checkOut=?, hoursWorked=?, status=? WHERE id=?',
            [checkIn, checkOut, hoursWorked || 0, status, Number(req.params.id)]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Attendance record not found' });
        const updated = queryOne('SELECT * FROM attendance WHERE id = ?', [Number(req.params.id)]);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Performance ---
app.get('/api/performance', (req, res) => {
    const performance = queryAll('SELECT * FROM performance ORDER BY score DESC');
    res.json(performance);
});

app.post('/api/performance', (req, res) => {
    const { employeeId, name, department, score, rating, period, review } = req.body;
    try {
        const result = runSql(
            'INSERT INTO performance (employeeId, name, department, score, rating, period, review) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [employeeId, name, department, score || 0, rating || '', period || '', review || '']
        );
        const newPerf = queryOne('SELECT * FROM performance WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(newPerf);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Payroll ---
app.get('/api/payroll', (req, res) => {
    const payroll = queryAll('SELECT * FROM payroll ORDER BY id');
    res.json(payroll);
});

app.post('/api/payroll', (req, res) => {
    const { employeeId, name, department, basicSalary, allowances, deductions, netSalary, status, month } = req.body;
    try {
        const result = runSql(
            'INSERT INTO payroll (employeeId, name, department, basicSalary, allowances, deductions, netSalary, status, month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [employeeId, name, department, basicSalary || 0, allowances || 0, deductions || 0, netSalary || 0, status || 'pending', month || '']
        );
        const newPay = queryOne('SELECT * FROM payroll WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(newPay);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/payroll/:id', (req, res) => {
    const { status } = req.body;
    try {
        const result = runSql('UPDATE payroll SET status=? WHERE id=?', [status, Number(req.params.id)]);
        if (result.changes === 0) return res.status(404).json({ error: 'Payroll record not found' });
        const updated = queryOne('SELECT * FROM payroll WHERE id = ?', [Number(req.params.id)]);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Leave Requests ---
app.get('/api/leave', (req, res) => {
    const leave = queryAll('SELECT * FROM leave_requests ORDER BY id');
    res.json(leave);
});

app.post('/api/leave', (req, res) => {
    const { employee, employeeId, type, fromDate, toDate, days, reason, status } = req.body;
    try {
        const result = runSql(
            'INSERT INTO leave_requests (employee, employeeId, type, fromDate, toDate, days, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [employee, employeeId, type, fromDate, toDate, days || 0, reason || '', status || 'pending']
        );
        const newLeave = queryOne('SELECT * FROM leave_requests WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(newLeave);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/leave/:id', (req, res) => {
    const { status } = req.body;
    try {
        const result = runSql('UPDATE leave_requests SET status=? WHERE id=?', [status, Number(req.params.id)]);
        if (result.changes === 0) return res.status(404).json({ error: 'Leave request not found' });
        const updated = queryOne('SELECT * FROM leave_requests WHERE id = ?', [Number(req.params.id)]);
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
async function startServer() {
    try {
        await getDbReadyPromise();
        app.listen(PORT, () => {
            console.log(`Employee Management System running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
});
