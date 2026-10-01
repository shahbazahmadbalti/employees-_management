import {
    db, ref, get, onValue, query, orderByKey, endBefore, limitToLast,
    $, on, esc, isAdmin, fmtDateTime, WORK_TZ, showToast, bus
} from './core.js';

export const features = ['audit'];

const PAGE = 100;
const A = { live: {}, older: {}, done: false, subscribed: false, loading: false };
const dayOf = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: WORK_TZ });

// Live newest page + any older pages already loaded, newest first
const allEntries = () => {
    const merged = { ...A.older, ...A.live };
    return Object.keys(merged).sort().reverse().map(k => ({ key: k, ...merged[k] }));
};

function render() {
    const tbody = $('auditTable')?.querySelector('tbody');
    if (!tbody) return;
    const date = $('auditDate').value;
    const q = ($('auditSearch').value || '').trim().toLowerCase();

    const rows = allEntries().filter(e => {
        if (date && e.ts && dayOf(e.ts) !== date) return false;
        if (q && ![e.user, e.eid, e.action, e.details].some(v => String(v || '').toLowerCase().includes(q))) return false;
        return true;
    }).slice(0, 400);

    tbody.innerHTML = rows.map(e => `
        <tr>
            <td>${fmtDateTime(e.ts)}</td>
            <td><strong>${esc(e.user || '')}</strong>${e.eid ? `<br><small style="color:var(--gray-500)">${esc(e.eid)}</small>` : ''}</td>
            <td>${esc(e.action)}</td>
            <td style="white-space:normal; word-break:break-word; max-width:360px;">${esc(e.details)}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">No entries match</td></tr>';

    $('auditMoreBtn').style.display = A.done ? 'none' : '';
}

function subscribe() {
    if (A.subscribed) return;
    A.subscribed = true;
    onValue(query(ref(db, 'audit_logs'), orderByKey(), limitToLast(PAGE)), snap => {
        A.live = snap.val() || {};
        if (Object.keys(A.live).length < PAGE) A.done = Object.keys(A.older).length === 0;
        render();
    }, err => { A.subscribed = false; showToast('Could not read the audit log: ' + err.message, 'error'); });
}

async function loadOlder() {
    if (A.loading || A.done) return;
    const keys = Object.keys({ ...A.older, ...A.live }).sort();
    if (!keys.length) return;
    A.loading = true;
    try {
        const snap = await get(query(ref(db, 'audit_logs'), orderByKey(), endBefore(keys[0]), limitToLast(PAGE)));
        const page = snap.val() || {};
        Object.assign(A.older, page);
        if (Object.keys(page).length < PAGE) A.done = true;
        render();
    } catch (err) { showToast('Could not load older entries: ' + err.message, 'error'); }
    A.loading = false;
}

export async function init() {
    if (!isAdmin()) return {};
    on('auditDate', 'change', render);
    on('auditSearch', 'input', render);
    on('auditMoreBtn', 'click', loadOlder);
    bus.on('section', id => { if (id === 'audit') { subscribe(); render(); } });
    return {};
}
