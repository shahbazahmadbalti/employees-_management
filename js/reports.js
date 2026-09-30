import { state, $, on, fullNameOf, todayStr, showToast } from './core.js';
import { formatOf, workedMinutes, breakMinutes, logsInRange } from './attendance.js';

function downloadFile(filename, content, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCSV(rows) {
    if (!rows.length) return '';
    const heads = Object.keys(rows[0]);
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [heads.map(cell).join(','), ...rows.map(r => heads.map(h => cell(r[h])).join(','))].join('\n');
}

async function attendanceRows() {
    const ym = todayStr().slice(0, 7);
    const logs = await logsInRange(`${ym}-01`, `${ym}-31`);
    const rows = [];
    Object.keys(logs).sort().forEach(date => {
        Object.entries(logs[date] || {}).forEach(([eid, log]) => {
            const f = formatOf(log.format);
            const worked = workedMinutes(log, f);
            rows.push({
                Date: date, EmployeeID: eid, Name: log.name || '', Group: log.group || '', Shift: log.shift || '', Format: f,
                In: log[f === 'SDI' ? 'lineIn' : 'checkIn'] || '', Out: log[f === 'SDI' ? 'lineOut' : 'checkOut'] || '',
                BreakMinutes: breakMinutes(log, f), WorkedHours: worked == null ? '' : (worked / 60).toFixed(2),
                Notes: log.remarks || log.comments || ''
            });
        });
    });
    return rows;
}

export async function generateReport(type) {
    const builders = {
        attendance: attendanceRows,
        performance: () => state.performance.map(p => ({ Name: p.name, Department: p.department, Period: p.period, Score: p.score, Comments: p.comments, Date: p.date })),
        payroll: () => state.payroll.map(p => ({ EmployeeID: p.employeeId, Name: p.name, Department: p.department, Month: p.month, Year: p.year, Basic: p.basicSalary, Allowances: p.allowances, Deductions: p.deductions, Net: p.netSalary, Status: p.status })),
        leave: () => state.leave.map(l => ({ Employee: l.employee, Type: l.type, From: l.fromDate, To: l.toDate, Days: l.days, Reason: l.reason, Status: l.status })),
        department: () => state.departments.map(d => ({ Name: d.name, Code: d.code, Head: d.head, Budget: d.budget, Employees: state.employees.filter(e => e.department === d.name).length })),
        employee: () => state.employees.map(e => ({ EmployeeID: e.employeeId, Name: fullNameOf(e), Email: e.email, Phone: e.phone, Department: e.department, Position: e.position, JoinDate: e.joinDate, Type: e.employmentType, LogType: e.logType, Salary: e.salary, Status: e.status }))
    };
    try {
        const rows = await builders[type]?.() || [];
        if (!rows.length) return showToast('No data available for this report', 'error');
        downloadFile(`${type}-report-${todayStr()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
        showToast('Report downloaded successfully!', 'success');
    } catch (err) { showToast('Report failed: ' + err.message, 'error'); }
}

function loadSettings() {
    const form = $('companySettingsForm');
    if (!form) return;
    let s = null;
    try { s = JSON.parse(localStorage.getItem('ems_settings')); } catch (e) { /* ignore */ }
    if (!s) return;
    form.elements.companyName.value = s.companyName ?? '';
    form.elements.industry.value = s.industry ?? '';
    form.elements.startTime.value = s.startTime ?? '09:00';
    form.elements.endTime.value = s.endTime ?? '18:00';
    form.querySelectorAll('input[name="workDays"]').forEach(cb => { cb.checked = (s.workDays || []).includes(cb.value); });
}

function saveSettings() {
    const form = $('companySettingsForm');
    localStorage.setItem('ems_settings', JSON.stringify({
        companyName: form.elements.companyName.value, industry: form.elements.industry.value,
        startTime: form.elements.startTime.value, endTime: form.elements.endTime.value,
        workDays: [...form.querySelectorAll('input[name="workDays"]:checked')].map(cb => cb.value)
    }));
    showToast('Settings saved successfully!', 'success');
}

function exportData() {
    const { employees, departments, performance, payroll, leave } = state;
    downloadFile(`ems-backup-${todayStr()}.json`, JSON.stringify({ employees, departments, performance, payroll, leave }, null, 2), 'application/json');
    showToast('Data exported', 'success');
}

export function initReports() {
    loadSettings();
    on('companySettingsForm', 'submit', e => { e.preventDefault(); saveSettings(); });
    on('exportDataBtn', 'click', exportData);
    on('backupDataBtn', 'click', exportData);
    on('clearCacheBtn', 'click', () => { localStorage.removeItem('ems_settings'); showToast('Saved settings cleared', 'success'); });
}
