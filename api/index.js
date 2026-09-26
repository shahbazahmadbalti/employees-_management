const express = require('express');
const cors = require('cors');
const { sql } = require('@vercel/postgres');
const {
    initializeTables, seedDataIfEmpty,
    mapRow, mapRows,
    employeeMap, departmentMap, attendanceMap, performanceMap, payrollMap, leaveMap
} = require('../database');

const app = express();

app.use(cors());
app.use(express.json());

// ==================== DB Init on first request ====================
let dbInitialized = false;
app.use(async (req, res, next) => {
    if (!dbInitialized) {
        try {
            await initializeTables();
            await seedDataIfEmpty();
            dbInitialized = true;
        } catch (err) {
            console.error('DB init error:', err);
        }
    }
    next();
});

// ==================== Employees ====================
app.get('/api/employees', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM employees ORDER BY id`;
        res.json(mapRows(rows, employeeMap));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employees/:id', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM employees WHERE id = ${req.params.id}`;
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(mapRow(rows[0], employeeMap));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employees', async (req, res) => {
    const { employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status } = req.body;
    try {
        const { rows } = await sql`
            INSERT INTO employees (employee_id, first_name, last_name, email, phone, department, position, join_date, employment_type, salary, address, status)
            VALUES (${employeeId}, ${firstName}, ${lastName}, ${email}, ${phone || ''}, ${department}, ${position}, ${joinDate}, ${employmentType || 'full-time'}, ${salary || 0}, ${address || ''}, ${status || 'active'})
            RETURNING *
        `;
        res.status(201).json(mapRow(rows[0], employeeMap));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/employees/:id', async (req, res) => {
    const { employeeId, firstName, lastName, email, phone, department, position, joinDate, employmentType, salary, address, status } = req.body;
    try {
        const { rows } = await sql`
            UPDATE employees SET employee_id=${employeeId}, first_name=${firstName}, last_name=${lastName}, email=${email}, phone=${phone || ''}, department=${department}, position=${position}, join_date=${joinDate}, employment_type=${employmentType || 'full-time'}, salary=${salary || 0}, address=${address || ''}, status=${status || 'active'}
            WHERE id=${req.params.id} RETURNING *
        `;
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(mapRow(rows[0], employeeMap));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/employees/:id', async (req, res) => {
    try {
        const { rowCount } = await sql`DELETE FROM employees WHERE id = ${req.params.id}`;
        if (!rowCount) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Departments ====================
app.get('/api/departments', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM departments ORDER BY id`;
        res.json(mapRows(rows, departmentMap));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/departments', async (req, res) => {
    const { name, code, head, employees, budget, description } = req.body;
    try {
        const { rows } = await sql`
            INSERT INTO departments (name, code, head, employees, budget, description)
            VALUES (${name}, ${code || ''}, ${head || ''}, ${employees || 0}, ${budget || 0}, ${description || ''})
            RETURNING *
        `;
        res.status(201).json(mapRow(rows[0], departmentMap));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/departments/:id', async (req, res) => {
    const { name, code, head, employees, budget, description } = req.body;
    try {
        const { rows } = await sql`
            UPDATE departments SET name=${name}, code=${code || ''}, head=${head || ''}, employees=${employees || 0}, budget=${budget || 0}, description=${description || ''}
            WHERE id=${req.params.id} RETURNING *
        `;
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(mapRow(rows[0], departmentMap));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/departments/:id', async (req, res) => {
    try {
        const { rowCount } = await sql`DELETE FROM departments WHERE id = ${req.params.id}`;
        if (!rowCount) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Attendance ====================
app.get('/api/attendance', async (req, res) => {
    try {
        const { date } = req.query;
        let result;
        if (date) {
            result = await sql`SELECT * FROM attendance WHERE date = ${date} ORDER BY id`;
        } else {
            result = await sql`SELECT * FROM attendance ORDER BY id`;
        }
        res.json(mapRows(result.rows, attendanceMap));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/attendance/:id', async (req, res) => {
    const { checkIn, checkOut, hoursWorked, status } = req.body;
    try {
        const { rows } = await sql`
            UPDATE attendance SET check_in=${checkIn}, check_out=${checkOut}, hours_worked=${hoursWorked || 0}, status=${status}
            WHERE id=${req.params.id} RETURNING *
        `;
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(mapRow(rows[0], attendanceMap));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// ==================== Performance ====================
app.get('/api/performance', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM performance ORDER BY score DESC`;
        res.json(mapRows(rows, performanceMap));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Payroll ====================
app.get('/api/payroll', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM payroll ORDER BY id`;
        res.json(mapRows(rows, payrollMap));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/payroll/:id', async (req, res) => {
    const { status } = req.body;
    try {
        const { rows } = await sql`UPDATE payroll SET status=${status} WHERE id=${req.params.id} RETURNING *`;
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(mapRow(rows[0], payrollMap));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// ==================== Leave ====================
app.get('/api/leave', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM leave_requests ORDER BY id`;
        res.json(mapRows(rows, leaveMap));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/leave/:id', async (req, res) => {
    const { status } = req.body;
    try {
        const { rows } = await sql`UPDATE leave_requests SET status=${status} WHERE id=${req.params.id} RETURNING *`;
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(mapRow(rows[0], leaveMap));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = app;
