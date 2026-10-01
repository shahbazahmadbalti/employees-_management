import { db, ref, get, state, charts, bus, $, on, esc, avatar, isAdmin, fullNameOf, todayStr, addDays } from './core.js';
import { statusOf, formatOf, logsInRange } from './attendance.js';
import { shiftFor } from './schedule.js';

const dash = { date: todayStr() };
const STATUS_UI = { done: ['Done', 'present'], active: ['Active', 'approved'], break: ['On break', 'late'], pending: ['Not started', 'pending'] };
const isWorking = s => { const u = (s || '').toUpperCase().trim(); return !!u && u !== 'OFF' && !/AWAY|SICK|HOLIDAY|LEAVE/.test(u); };

export function makeChart(key, canvasId, config) {
    const canvas = $(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(canvas, config);
}

// Check-in / check-out table for the chosen day
async function renderDayTable() {
    const tbody = $('recentEmployeesTable')?.querySelector('tbody');
    if (!tbody) return;
    $('dashDate').value = dash.date;

    let logs = {};
    try { logs = (await get(ref(db, `attendanceLogs/${dash.date}`))).val() || {}; }
    catch (err) { console.warn('Could not load logs for', dash.date, err); }

    const rows = state.employees.filter(e => e.status === 'active').map(e => {
        const name = fullNameOf(e), log = logs[e.employeeId], f = formatOf(log?.format || e.logType);
        return {
            name, department: e.department, log, st: statusOf(log), shift: shiftFor(name, dash.date),
            inT: log?.[f === 'SDI' ? 'lineIn' : 'checkIn'] || '', outT: log?.[f === 'SDI' ? 'lineOut' : 'checkOut'] || ''
        };
    }).filter(r => r.log || isWorking(r.shift))
      .sort((a, b) => (a.inT || '99:99').localeCompare(b.inT || '99:99') || a.name.localeCompare(b.name));

    tbody.innerHTML = rows.map(r => {
        const [label, cls] = STATUS_UI[r.st];
        return `<tr>
            <td><div class="user-info"><img src="${avatar(r.name)}" alt=""><span>${esc(r.name)}</span></div></td>
            <td>${esc(r.department)}</td>
            <td>${esc(r.inT) || '&mdash;'}</td>
            <td>${esc(r.outT) || '&mdash;'}</td>
            <td><span class="status-badge ${cls}">${label}</span></td>
        </tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;">No check-ins or scheduled shifts for this day</td></tr>';
}

export async function renderDashboard() {
    if (!isAdmin()) return;
    const today = todayStr();
    const active = state.employees.filter(e => e.status === 'active').length;

    $('totalEmployees').textContent = state.employees.length;
    $('activeEmployeesInfo').textContent = `${active} active`;
    $('onLeave').textContent = state.leave.filter(l => l.status === 'approved' && l.fromDate <= today && l.toDate >= today).length;
    $('pendingLeaves').textContent = `${state.leave.filter(l => l.status === 'pending').length} pending requests`;
    $('totalDepartments').textContent = state.departments.length;

    try {
        const snap = await get(ref(db, `attendanceLogs/${today}`));
        const present = Object.values(snap.val() || {}).filter(l => statusOf(l) !== 'pending').length;
        $('presentToday').textContent = present;
        $('attendanceRate').textContent = `${active ? Math.round((present / active) * 100) : 0}% attendance`;
    } catch (err) { console.warn('Could not load today\'s logs', err); }

    renderDayTable();
    renderAttendanceChart();
}

export async function renderAttendanceChart() {
    if (!isAdmin()) return;
    const days = $('attendancePeriod').value === 'month' ? 30 : 7;
    const today = todayStr();
    const dates = Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
    let logs = {};
    try { logs = await logsInRange(dates[0], today); } catch (err) { console.warn('Chart data failed', err); }

    const counts = dates.map(d => Object.values(logs[d] || {}).filter(l => statusOf(l) !== 'pending').length);
    makeChart('attendance', 'attendanceCanvas', {
        type: 'bar',
        data: { labels: dates.map(d => d.slice(5)), datasets: [{ label: 'Checked in', data: counts, backgroundColor: '#10B981', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

export function initDashboard() {
    on('attendancePeriod', 'change', renderAttendanceChart);
    on('dashDate', 'change', e => { if (e.target.value) { dash.date = e.target.value; renderDayTable(); } });
    on('dashPrev', 'click', () => { dash.date = addDays(dash.date, -1); renderDayTable(); });
    on('dashNext', 'click', () => { dash.date = addDays(dash.date, 1); renderDayTable(); });
    bus.on('section', id => { if (id === 'dashboard') renderDashboard(); });
    bus.on('schedule:loaded', () => { if (isAdmin()) renderDayTable(); });
}
