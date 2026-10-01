import { GOOGLE_SCRIPT_URL, MONTHS, state, bus, $, on, esc, sameName, profileKey, isAdmin, todayStr } from './core.js';

const COLORS = { FA: ['#bfdbfe', '#1e40af'], P2: ['#bbf7d0', '#166534'], AD: ['#fed7aa', '#9a3412'], DEFAULT: ['#c7d2fe', '#3730a3'] };

// Scheduled shift label for a person on a date (YYYY-MM-DD), read from the Google Sheet data
export function shiftFor(name, dateStr) {
    const key = Object.keys(state.schedule || {}).find(k => sameName(k, name));
    if (!key) return '';
    const [y, m, d] = dateStr.split('-');
    const area = state.schedule[key]?.[y]?.[MONTHS[Number(m) - 1]]?.[Number(d)]?.area;
    return area ? String(area).trim() : '';
}

// First group/segment of a person: directory first, then Sheets location, then profile location
export function groupFor(name) {
    const entry = Object.values(state.directory || {}).find(p => sameName(p.name, name));
    if (entry && entry.group) return entry.group;
    const key = Object.keys(state.employeeLocations || {}).find(k => sameName(k, name));
    let loc = key ? state.employeeLocations[key] : null;
    if (!loc) loc = state.profiles.find(p => p.id === profileKey(name))?.location;
    return String([].concat(loc || [])[0] || 'General').split(',')[0].trim() || 'General';
}

export async function fetchSchedule() {
    const loading = $('scheduleLoading'), table = $('scheduleTable');
    try {
        loading.style.display = 'block';
        loading.textContent = 'Loading schedule data from Google Sheets...';
        table.style.display = 'none';
        const res = await fetch(GOOGLE_SCRIPT_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        state.schedule = data.schedule || {};
        state.masterEmployees = data.employees || [];
        state.employeeLocations = data.employeeLocations || {};
        populateScheduleFilters();
        renderSchedule();
        bus.emit('schedule:loaded');
    } catch (err) {
        console.error('Failed to fetch schedule', err);
        loading.style.display = 'block';
        loading.textContent = 'Failed to load schedule. Click "Refresh Schedule" to retry.';
    }
}

function populateScheduleFilters() {
    const locSel = $('schedLocation'), empSel = $('schedEmployee');
    const prevLoc = locSel.value || 'All', prevEmp = empSel.value || 'All';
    const locations = [...new Set(Object.values(state.employeeLocations || {}).flat().filter(Boolean))].sort();
    let names = (state.masterEmployees || []).map(e => (typeof e === 'string' ? e : e?.name)).filter(Boolean);
    if (!names.length) names = Object.keys(state.schedule);
    names = [...new Set(names)].sort();
    if (!isAdmin()) names = names.filter(n => sameName(n, state.currentUser.name));
    locSel.innerHTML = '<option value="All">All</option>' + locations.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    empSel.innerHTML = '<option value="All">All</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    locSel.value = locations.includes(prevLoc) ? prevLoc : 'All';
    empSel.value = names.includes(prevEmp) ? prevEmp : 'All';
}

export function renderSchedule() {
    $('scheduleLoading').style.display = 'none';
    $('scheduleTable').style.display = 'table';
    const tbody = $('scheduleBody'), theadRow = $('scheduleHead').querySelector('tr');
    const selMonth = $('schedMonth').value, selYear = $('schedYear').value;
    const selLoc = $('schedLocation').value, selEmp = $('schedEmployee').value;
    const days = new Date(Number(selYear), MONTHS.indexOf(selMonth) + 1, 0).getDate();

    let head = '<th style="position: sticky; left: 0; background: #f8fafc; z-index: 2; width: 150px; text-align: left;">EMPLOYEE NAME</th>';
    for (let i = 1; i <= days; i++) head += `<th style="text-align: center;">${i}</th>`;
    head += '<th style="text-align: center; width: 80px;">TOTAL HOURS</th>';
    theadRow.innerHTML = head;

    let names = Object.keys(state.schedule || {});
    if (!isAdmin()) names = names.filter(n => sameName(n, state.currentUser.name));
    if (selEmp !== 'All') names = names.filter(n => n === selEmp);
    if (selLoc !== 'All') names = names.filter(n => [].concat(state.employeeLocations?.[n] || []).includes(selLoc));

    if (!names.length) {
        tbody.innerHTML = `<tr><td colspan="${days + 2}" style="text-align: center; padding: 16px;">No schedule data available</td></tr>`;
        return;
    }

    tbody.innerHTML = names.map(name => {
        let total = 0, cells = '';
        const sched = state.schedule[name]?.[selYear]?.[selMonth] || {};
        for (let i = 1; i <= days; i++) {
            const d = sched[i];
            if (d && d.area) {
                const label = String(d.area);
                const [bg, fg] = label.includes('FA') ? COLORS.FA : label.includes('P2') ? COLORS.P2 : label.includes('AD') ? COLORS.AD : COLORS.DEFAULT;
                cells += `<td style="padding: 2px;"><div style="font-size: 10px; font-weight: bold; border-radius: 4px; padding: 4px; text-align: center; white-space: nowrap; background: ${bg}; color: ${fg};">${esc(label)}</div></td>`;
                total += Number(d.hours) > 0 ? Number(d.hours) : 8;
            } else cells += '<td></td>';
        }
        return `<tr>
            <td style="position: sticky; left: 0; background: white; z-index: 1; font-weight: 500; text-transform: uppercase;">${esc(name)}</td>
            ${cells}
            <td style="text-align: center; font-weight: bold;">${total || '-'}</td></tr>`;
    }).join('');
}

export function initSchedule() {
    const [, month] = todayStr().split('-');
    $('schedMonth').value = MONTHS[Number(month) - 1];
    $('schedYear').value = todayStr().slice(0, 4);
    on('refreshScheduleBtn', 'click', fetchSchedule);
    ['schedMonth', 'schedYear', 'schedLocation', 'schedEmployee'].forEach(id => on(id, 'change', renderSchedule));
}
