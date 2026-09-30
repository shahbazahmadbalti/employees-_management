import { state, bus, $, on, esc, avatar, isAdmin, findEmployee, fullNameOf, todayStr, api, showToast, closeModal } from './core.js';
import { updateDropdowns } from './employees.js';
import { makeChart } from './dashboard.js';

export function renderPerformance() {
    if (!isAdmin()) return;
    const period = $('performancePeriod').value, dept = $('performanceDepartment').value;
    let list = [...state.performance];
    if (period) list = list.filter(p => p.period === period);
    if (dept) list = list.filter(p => p.department === dept);
    list.sort((a, b) => Number(b.score) - Number(a.score));

    $('topPerformersTable').querySelector('tbody').innerHTML = list.slice(0, 10).map((p, i) => `
        <tr>
            <td>#${i + 1}</td>
            <td><div class="user-info"><img src="${avatar(p.name)}" alt=""><span>${esc(p.name)}</span></div></td>
            <td>${esc(p.department)}</td><td><strong>${esc(p.score)}</strong></td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">No reviews yet</td></tr>';

    const bucket = fn => list.filter(p => fn(Number(p.score))).length;
    makeChart('performance', 'performanceCanvas', {
        type: 'doughnut',
        data: {
            labels: ['Excellent (90+)', 'Good (75-89)', 'Average (60-74)', 'Poor (<60)'],
            datasets: [{
                data: [bucket(s => s >= 90), bucket(s => s >= 75 && s < 90), bucket(s => s >= 60 && s < 75), bucket(s => s < 60)],
                backgroundColor: ['#10B981', '#4F46E5', '#F59E0B', '#EF4444']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

async function saveReview() {
    const F = $('reviewForm').elements;
    const emp = findEmployee(F.employee.value);
    if (!emp) return showToast('Select a valid employee', 'error');
    const data = {
        employeeId: emp.employeeId, name: fullNameOf(emp), department: emp.department || '',
        score: Math.min(100, Math.max(0, Number(F.score.value) || 0)), period: F.period.value,
        comments: F.comments.value.trim(), date: todayStr()
    };
    try {
        state.performance.push(await api('/performance', 'POST', data));
        closeModal('reviewModal');
        renderPerformance();
        showToast('Review saved!', 'success');
    } catch (err) { showToast('Failed to save review: ' + err.message, 'error'); }
}

export function initPerformance() {
    on('addReviewBtn', 'click', () => { updateDropdowns(); $('reviewForm').reset(); $('reviewModal').classList.add('active'); });
    on('reviewForm', 'submit', e => { e.preventDefault(); saveReview(); });
    on('performancePeriod', 'change', renderPerformance);
    on('performanceDepartment', 'change', renderPerformance);
    bus.on('section', id => { if (id === 'performance') renderPerformance(); });
}
