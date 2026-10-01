import {
    db, ref, get, set, state, bus, $, on, esc, avatar, isAdmin, isLeader, isManager, sameName, findEmployee, fullNameOf,
    todayStr, LEAVE_ALLOWANCE, api, showToast, closeModal, updateNotifications, formatDate, formatLeaveType, auditLog
} from './core.js';
import { updateDropdowns } from './employees.js';

const TYPES = ['sick', 'casual', 'annual'];
const daysBetween = (from, to) => {
    const d = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    return d > 0 ? d : 0;
};

// Leaders manage the people of their groups (never their own requests)
const inMyGroups = eid => {
    const g = state.directory?.[eid]?.group;
    return !!g && state.currentUser.leaderGroups.includes(g);
};
const canDecide = lv => isAdmin() || (isLeader() && lv.employeeId !== state.currentUser.employeeId && inMyGroups(lv.employeeId));
const nameOf = eid => state.directory?.[eid]?.name || fullNameOf(state.employees.find(e => e.employeeId === eid) || {}) || eid;

// ---------- Employee filter (managers only) ----------
function fillEmployeeFilter() {
    const s = $('leaveEmployeeFilter');
    if (!s) return;
    s.style.display = isManager() ? '' : 'none';
    if (!isManager()) return;
    const cur = s.value;
    s.innerHTML = '<option value="">All employees</option>' + state.employees
        .filter(e => e.employeeId)
        .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)))
        .map(e => `<option value="${esc(e.employeeId)}">${esc(fullNameOf(e))}</option>`).join('');
    s.value = [...s.options].some(o => o.value === cur) ? cur : '';
}

function selectedEmployee() { return $('leaveEmployeeFilter')?.value || ''; }

function visibleLeave() {
    let list = [...state.leave];
    if (isLeader()) list = list.filter(l => l.employeeId === state.currentUser.employeeId || inMyGroups(l.employeeId));
    else if (!isAdmin()) list = list.filter(l => sameName(l.employee, state.currentUser.name));
    const eid = selectedEmployee();
    if (eid && isManager()) list = list.filter(l => l.employeeId === eid || (!l.employeeId && sameName(l.employee, nameOf(eid))));
    const status = $('leaveStatus').value, type = $('leaveType').value;
    if (status) list = list.filter(l => l.status === status);
    if (type) list = list.filter(l => l.type === type);
    return list;
}

// ---------- Entitlements (days per year, set per employee by the admin) ----------
state.leaveAllowance = state.leaveAllowance || {};
const withDefaults = a => ({ ...LEAVE_ALLOWANCE, ...(a || {}) });

async function getAllowance(eid) {
    if (!(eid in state.leaveAllowance)) {
        try { state.leaveAllowance[eid] = (await get(ref(db, `leaveAllowance/${eid}`))).val() || null; }
        catch (err) { state.leaveAllowance[eid] = null; }
    }
    return withDefaults(state.leaveAllowance[eid]);
}

function balanceTarget() {
    const sel = selectedEmployee();
    if (isAdmin()) return sel || null;                       // admins pick an employee to see balances
    if (isLeader()) return sel || state.currentUser.employeeId;
    return state.currentUser.employeeId;
}

async function renderBalances() {
    const cards = document.querySelectorAll('.leave-stat-card'), title = $('leaveBalanceTitle');
    const eid = balanceTarget();
    if (!eid) {
        cards.forEach(c => { c.style.display = 'none'; });
        if (title) title.textContent = 'Select an employee to see their leave balance.';
        return;
    }
    cards.forEach(c => { c.style.display = ''; });
    const allow = await getAllowance(eid);
    const year = todayStr().slice(0, 4);
    const name = eid === state.currentUser.employeeId ? 'Your' : `${nameOf(eid)}'s`;
    if (title) title.textContent = `${name} leave balance for ${year}`;

    const mine = state.leave.filter(l => l.employeeId === eid || (!l.employeeId && sameName(l.employee, nameOf(eid))));
    cards.forEach(card => {
        const type = card.dataset.type, total = Number(allow[type]) || 0;
        const days = status => mine.filter(l => l.type === type && l.status === status && String(l.fromDate).startsWith(year))
            .reduce((s, l) => s + (Number(l.days) || 0), 0);
        const used = days('approved'), pending = days('pending');
        card.querySelector('h4').textContent = `${formatLeaveType(type)} · ${total} days`;
        card.querySelector('.used').textContent = `Used: ${used}${pending ? ` (+${pending} pending)` : ''}`;
        card.querySelector('.remaining').textContent = `Remaining: ${Math.max(total - used, 0)}`;
        card.querySelector('.progress').style.width = `${total ? Math.min(100, Math.round((used / total) * 100)) : 0}%`;
    });
}

async function openAllowanceModal() {
    const eid = selectedEmployee();
    if (!eid) return showToast('Pick an employee in the filter first', 'info');
    const a = await getAllowance(eid);
    const F = $('allowanceForm').elements;
    $('allowanceName').textContent = `${nameOf(eid)} (${eid})`;
    TYPES.forEach(t => { F[t].value = a[t]; });
    $('allowanceForm').dataset.eid = eid;
    $('allowanceModal').classList.add('active');
}

async function saveAllowance() {
    const form = $('allowanceForm'), F = form.elements, eid = form.dataset.eid;
    if (!eid) return;
    const data = {};
    TYPES.forEach(t => { data[t] = Math.max(0, Math.min(366, Number(F[t].value) || 0)); });
    try {
        await set(ref(db, `leaveAllowance/${eid}`), { ...data, updatedBy: state.currentUser.name });
        state.leaveAllowance[eid] = data;
        closeModal('allowanceModal');
        renderBalances();
        showToast('Leave entitlement saved', 'success');
        auditLog('Updated leave entitlement', `${nameOf(eid)}: sick ${data.sick}, casual ${data.casual}, annual ${data.annual}`);
    } catch (err) { showToast('Could not save entitlement: ' + err.message, 'error'); }
}

// ---------- Rendering ----------
export function renderLeave() {
    $('leaveTable').querySelector('tbody').innerHTML = visibleLeave().map(lv => `
        <tr>
            <td><div class="user-info"><img src="${avatar(lv.employee)}" alt=""><span>${esc(lv.employee)}</span></div></td>
            <td>${formatLeaveType(lv.type)}</td>
            <td>${formatDate(lv.fromDate)}</td>
            <td>${formatDate(lv.toDate)}</td>
            <td>${esc(lv.days)} days</td>
            <td>${esc(lv.reason)}</td>
            <td><span class="status-badge ${esc(lv.status)}">${esc(lv.status)}</span></td>
            <td>${canDecide(lv) && lv.status === 'pending' ? `
                <button class="btn-icon" onclick="approveLeave('${esc(lv.id)}')" title="Approve"><i class="fas fa-check"></i></button>
                <button class="btn-icon" onclick="rejectLeave('${esc(lv.id)}')" title="Reject"><i class="fas fa-times"></i></button>` : '-'}</td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;">No leave requests</td></tr>';

    renderBalances();
    updateNotifications();
}

function openLeaveModal() {
    updateDropdowns();
    const form = $('leaveForm');
    form.reset();
    if (!isAdmin()) {
        const me = state.employees.find(e => sameName(fullNameOf(e), state.currentUser.name));
        if (me) form.elements.employee.value = me.id;
    }
    $('leaveModal').classList.add('active');
}

async function saveLeave() {
    const F = $('leaveForm').elements;
    const emp = findEmployee(F.employee.value);
    if (!emp) return showToast('Select a valid employee', 'error');
    const days = daysBetween(F.fromDate.value, F.toDate.value);
    if (!days) return showToast('"To" date must be on or after "From" date', 'error');
    const data = {
        employeeId: emp.employeeId, employee: fullNameOf(emp), type: F.type.value,
        fromDate: F.fromDate.value, toDate: F.toDate.value, days, reason: F.reason.value.trim(), status: 'pending'
    };
    try {
        state.leave.push(await api('/leave', 'POST', data));
        closeModal('leaveModal');
        renderLeave();
        bus.emit('data:changed');
        showToast('Leave request submitted!', 'success');
    } catch (err) { showToast('Failed to submit leave: ' + err.message, 'error'); }
}

async function setStatus(id, status, message) {
    try {
        const updated = await api(`/leave/${id}`, 'PUT', { status });
        const i = state.leave.findIndex(l => String(l.id) === String(id));
        if (i !== -1) state.leave[i] = updated;
        renderLeave();
        bus.emit('data:changed');
        showToast(message, 'success');
    } catch (err) { showToast('Failed to update leave: ' + err.message, 'error'); }
}
export const approveLeave = id => setStatus(id, 'approved', 'Leave request approved!');
export const rejectLeave = id => setStatus(id, 'rejected', 'Leave request rejected');

export async function initLeave() {
    on('requestLeaveBtn', 'click', openLeaveModal);
    on('leaveForm', 'submit', e => { e.preventDefault(); saveLeave(); });
    on('leaveStatus', 'change', renderLeave);
    on('leaveType', 'change', renderLeave);
    on('leaveEmployeeFilter', 'change', renderLeave);
    on('editAllowanceBtn', 'click', openAllowanceModal);
    on('allowanceForm', 'submit', e => { e.preventDefault(); saveAllowance(); });

    bus.on('data:changed', () => { fillEmployeeFilter(); renderBalances(); });
    fillEmployeeFilter();

    // Admins load every entitlement once; others fetch their own on demand
    if (isAdmin()) {
        try { state.leaveAllowance = (await get(ref(db, 'leaveAllowance'))).val() || {}; }
        catch (err) { console.warn('leaveAllowance read failed', err); }
        renderBalances();
    }
}
