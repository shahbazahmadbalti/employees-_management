import {
    state, LEAVE_ALLOWANCE, bus, $, on, esc, avatar, isAdmin, sameName, findEmployee, fullNameOf,
    api, showToast, closeModal, updateNotifications, formatDate, formatLeaveType
} from './core.js';
import { updateDropdowns } from './employees.js';

const daysBetween = (from, to) => {
    const d = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    return d > 0 ? d : 0;
};

function visibleLeave() {
    let list = [...state.leave];
    if (!isAdmin()) list = list.filter(l => sameName(l.employee, state.currentUser.name));
    const status = $('leaveStatus').value, type = $('leaveType').value;
    if (status) list = list.filter(l => l.status === status);
    if (type) list = list.filter(l => l.type === type);
    return list;
}

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
            <td>${isAdmin() && lv.status === 'pending' ? `
                <button class="btn-icon" onclick="approveLeave('${esc(lv.id)}')" title="Approve"><i class="fas fa-check"></i></button>
                <button class="btn-icon" onclick="rejectLeave('${esc(lv.id)}')" title="Reject"><i class="fas fa-times"></i></button>` : '-'}</td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;">No leave requests</td></tr>';

    const mine = isAdmin() ? state.leave : state.leave.filter(l => sameName(l.employee, state.currentUser.name));
    document.querySelectorAll('.leave-stat-card').forEach(card => {
        const type = card.dataset.type, total = LEAVE_ALLOWANCE[type] || 0;
        const used = mine.filter(l => l.type === type && l.status === 'approved').reduce((s, l) => s + (Number(l.days) || 0), 0);
        card.querySelector('.used').textContent = `Used: ${used}`;
        card.querySelector('.remaining').textContent = `Remaining: ${Math.max(total - used, 0)}`;
        card.querySelector('.progress').style.width = `${total ? Math.min(100, Math.round((used / total) * 100)) : 0}%`;
    });
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

export function initLeave() {
    on('requestLeaveBtn', 'click', openLeaveModal);
    on('leaveForm', 'submit', e => { e.preventDefault(); saveLeave(); });
    on('leaveStatus', 'change', renderLeave);
    on('leaveType', 'change', renderLeave);
}
