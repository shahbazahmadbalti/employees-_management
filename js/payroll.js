import { state, PAYROLL_RULES, $, on, esc, avatar, isAdmin, fullNameOf, todayStr, api, showToast, formatCurrency } from './core.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fillMonths() {
    const s = $('payrollMonth');
    if (!s) return;
    const [y, m] = todayStr().split('-').map(Number);
    let html = '';
    for (let i = 0; i < 6; i++) {
        const d = new Date(Date.UTC(y, m - 1 - i, 1));
        const mm = d.getUTCMonth() + 1, yy = d.getUTCFullYear();
        html += `<option value="${mm}-${yy}">${MONTH_NAMES[mm - 1]} ${yy}</option>`;
    }
    s.innerHTML = html;
}

const period = () => { const [month, year] = $('payrollMonth').value.split('-').map(Number); return { month, year }; };

export function renderPayroll() {
    if (!isAdmin()) return;
    const { month, year } = period(), dept = $('payrollDepartment').value;
    let list = state.payroll.filter(p => !p.month || (Number(p.month) === month && Number(p.year) === year));
    if (dept) list = list.filter(p => p.department === dept);

    $('payrollTable').querySelector('tbody').innerHTML = list.map(pay => `
        <tr>
            <td>${esc(pay.employeeId)}</td>
            <td><div class="user-info"><img src="${avatar(pay.name)}" alt=""><span>${esc(pay.name)}</span></div></td>
            <td>${esc(pay.department)}</td>
            <td>${formatCurrency(pay.basicSalary)}</td><td>${formatCurrency(pay.allowances)}</td><td>${formatCurrency(pay.deductions)}</td>
            <td><strong>${formatCurrency(pay.netSalary)}</strong></td>
            <td><span class="status-badge ${esc(pay.status)}">${esc(pay.status)}</span></td>
            <td>
                <button class="btn-icon" onclick="viewPayslip('${esc(pay.id)}')" title="View Payslip"><i class="fas fa-file-invoice"></i></button>
                <button class="btn-icon" onclick="processPayment('${esc(pay.id)}')" title="Process Payment"><i class="fas fa-money-bill"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;">No payroll for this period. Click "Generate Payroll".</td></tr>';
}

async function generatePayroll() {
    if (!isAdmin()) return showToast('Admins only', 'error');
    const { month, year } = period(), dept = $('payrollDepartment').value;
    const targets = state.employees.filter(e => e.status === 'active' && (!dept || e.department === dept));
    if (!targets.length) return showToast('No active employees to process', 'error');
    let created = 0;
    try {
        for (const emp of targets) {
            if (state.payroll.some(p => p.employeeId === emp.employeeId && Number(p.month) === month && Number(p.year) === year)) continue;
            const basic = Number(emp.salary) || 0;
            const allowances = Math.round(basic * PAYROLL_RULES.allowanceRate);
            const deductions = Math.round(basic * PAYROLL_RULES.deductionRate);
            state.payroll.push(await api('/payroll', 'POST', {
                employeeId: emp.employeeId, name: fullNameOf(emp), department: emp.department || '',
                basicSalary: basic, allowances, deductions, netSalary: basic + allowances - deductions,
                month, year, status: 'pending'
            }));
            created++;
        }
        renderPayroll();
        showToast(created ? `Payroll generated for ${created} employee(s)` : 'Payroll already exists for this period', created ? 'success' : 'info');
    } catch (err) { showToast('Failed to generate payroll: ' + err.message, 'error'); }
}

export function viewPayslip(id) {
    const p = state.payroll.find(x => String(x.id) === String(id));
    if (!p) return;
    const w = window.open('', '_blank', 'width=520,height=640');
    if (!w) return showToast('Allow pop-ups to view the payslip', 'error');
    w.document.write(`<html><head><title>Payslip - ${esc(p.name)}</title><meta name="viewport" content="width=device-width, initial-scale=1">
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

export async function processPayment(id) {
    try {
        const updated = await api(`/payroll/${id}`, 'PUT', { status: 'paid' });
        const i = state.payroll.findIndex(p => String(p.id) === String(id));
        if (i !== -1) state.payroll[i] = updated;
        renderPayroll();
        showToast('Payment processed successfully!', 'success');
    } catch (err) { showToast('Failed to process payment: ' + err.message, 'error'); }
}

export function initPayroll() {
    fillMonths();
    on('generatePayrollBtn', 'click', generatePayroll);
    on('payrollMonth', 'change', renderPayroll);
    on('payrollDepartment', 'change', renderPayroll);
}
