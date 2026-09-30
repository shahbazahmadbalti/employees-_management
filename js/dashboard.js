import { db, ref, get, state, charts, bus, $, on, esc, avatar, isAdmin, fullNameOf, todayStr, addDays } from './core.js';
import { statusOf, logsInRange } from './attendance.js';

export function makeChart(key, canvasId, config) {
    const canvas = $(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(canvas, config);
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

    const recent = [...state.employees].sort((a, b) => String(b.joinDate).localeCompare(String(a.joinDate))).slice(0, 5);
    $('recentEmployeesTable').querySelector('tbody').innerHTML = recent.map(emp => `
        <tr>
            <td><div class="user-info"><img src="${avatar(fullNameOf(emp))}" alt=""><span>${esc(fullNameOf(emp))}</span></div></td>
            <td>${esc(emp.department)}</td><td>${esc(emp.position)}</td>
            <td><span class="status-badge ${esc(emp.status)}">${esc(emp.status)}</span></td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">No employees yet</td></tr>';

    try {
        const snap = await get(ref(db, `attendanceLogs/${today}`));
        const present = Object.values(snap.val() || {}).filter(l => statusOf(l) !== 'pending').length;
        $('presentToday').textContent = present;
        $('attendanceRate').textContent = `${active ? Math.round((present / active) * 100) : 0}% attendance`;
    } catch (err) { console.warn('Could not load today\'s logs', err); }

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
    bus.on('section', id => { if (id === 'dashboard') renderDashboard(); });
}
