import {
    db, ref, get, set, push, remove, update, onValue, query, orderByKey, startAt, endAt, serverTimestamp,
    state, bus, $, on, esc, avatar, isAdmin, fullNameOf, todayStr, timeNow, addDays, nowMs, WORK_TZ,
    showToast, updateNotifications
} from './core.js';
import { shiftFor, groupFor } from './schedule.js';

// ==================== Log formats ====================
const SK_STEPS = [['checkIn', 'Check in'], ['b1Out', 'Break 1 start'], ['b1In', 'Break 1 end'], ['b2Out', 'Break 2 start'], ['b2In', 'Break 2 end'], ['checkOut', 'Check out']];
const SDI_STEPS = [['lineIn', 'Line in'], ['b1Start', 'Break 1 start'], ['b1End', 'Break 1 end'], ['b2Start', 'Break 2 start'], ['b2End', 'Break 2 end'], ['b3Start', 'Break 3 start'], ['b3End', 'Break 3 end'], ['lineOut', 'Line out']];
const FIRST = { SK: 'checkIn', SDI: 'lineIn' };
const FINAL = { SK: 'checkOut', SDI: 'lineOut' };
const BREAKS = { SK: [['b1Out', 'b1In'], ['b2Out', 'b2In']], SDI: [['b1Start', 'b1End'], ['b2Start', 'b2End'], ['b3Start', 'b3End']] };
const SDI_CHECKS = [['smock', 'Smock'], ['gloves', 'Gloves'], ['noAccessories', 'No accessories']];
const SDI_TASKS = [['taskError', 'Errors'], ['taskClean', 'Cleaning'], ['taskTicket', 'Tickets'], ['taskAGVIn', 'AGV in'], ['taskAGVOut', 'AGV out']];
const STATUS_UI = { done: ['Done', 'present'], active: ['Active', 'approved'], break: ['On break', 'late'], pending: ['Not started', 'pending'] };

export const formatOf = t => (t === 'SDI' || t === 'Logs_SDI') ? 'SDI' : 'SK';
const stepsOf = f => (f === 'SDI' ? SDI_STEPS : SK_STEPS);
const toMin = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const span = (a, b) => { const s = toMin(a), e = toMin(b); if (s == null || e == null) return null; let d = e - s; if (d < 0) d += 1440; return d; };

export function breakMinutes(log, fmt) {
    fmt = fmt || formatOf(log.format);
    return BREAKS[fmt].reduce((sum, [s, e]) => sum + (span(log[s], log[e]) || 0), 0);
}
export function workedMinutes(log, fmt) {
    fmt = fmt || formatOf(log.format);
    const total = span(log[FIRST[fmt]], log[FINAL[fmt]]);
    return total == null ? null : Math.max(total - breakMinutes(log, fmt), 0);
}
export const fmtHM = m => (m == null ? '-' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);
export function statusOf(log) {
    if (!log) return 'pending';
    const f = formatOf(log.format);
    if (log[FINAL[f]]) return 'done';
    if (!log[FIRST[f]]) return 'pending';
    return BREAKS[f].some(([s, e]) => log[s] && !log[e]) ? 'break' : 'active';
}
const isOpenShift = log => !!log && statusOf(log) !== 'pending' && statusOf(log) !== 'done';

const logRef = (date, eid) => ref(db, `attendanceLogs/${date}/${eid}`);
export async function logsInRange(from, to) {
    const snap = await get(query(ref(db, 'attendanceLogs'), orderByKey(), startAt(from), endAt(to)));
    return snap.val() || {};
}

const longDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtTs = ts => ts ? new Date(ts).toLocaleString('en-GB', { timeZone: WORK_TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : 'sending...';
const iconFor = (key, f) => key === FIRST[f] ? 'fa-right-to-bracket' : key === FINAL[f] ? 'fa-right-from-bracket' : /(Out|Start)$/.test(key) ? 'fa-mug-hot' : 'fa-play';

// ==================== Writing ====================
async function writeLog(ctx, fields) {
    await update(logRef(ctx.date, ctx.eid), {
        ...fields, format: ctx.fmt, name: ctx.name, group: ctx.group, shift: ctx.shift || '',
        updatedBy: state.currentUser.name, updatedAt: serverTimestamp()
    });
}

// Employees can only stamp the server time: one press, no typing, confirmed once
async function stamp(ctx, field, btn) {
    const label = stepsOf(ctx.fmt).find(([k]) => k === field)?.[1] || field;
    const snap = await get(ref(db, `attendanceLogs/${ctx.date}/${ctx.eid}/${field}`));
    if (snap.exists()) return showToast(`${label} is already recorded`, 'info');
    const t = timeNow();
    if (!confirm(`Record "${label}" at ${t}?\nThis cannot be edited afterwards.`)) return;
    btn.disabled = true;
    await writeLog(ctx, { [field]: t });
    showToast(`${label} recorded at ${t}`, 'success');
}

async function saveDetails(container, ctx) {
    const fields = {};
    container.querySelectorAll('[data-detail]').forEach(el => {
        fields[el.dataset.detail] = el.type === 'checkbox' ? el.checked : (el.value.trim() || null);
    });
    await writeLog(ctx, fields);
    showToast('Details saved', 'success');
}

function bindEditor(container, getCtx) {
    container.addEventListener('click', async e => {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        const ctx = getCtx();
        if (!ctx) return;
        try {
            if (b.dataset.act === 'step') await stamp(ctx, b.dataset.field, b);
            else if (b.dataset.act === 'clear' && isAdmin()) await writeLog(ctx, { [b.dataset.field]: null });
            else if (b.dataset.act === 'save-details') await saveDetails(container, ctx);
        } catch (err) { showToast('Could not save: ' + err.message, 'error'); }
    });
    // Manual time corrections exist only for admins (the inputs are not rendered for employees)
    container.addEventListener('change', async e => {
        const i = e.target.closest('input[data-time]');
        if (!i || !isAdmin()) return;
        const ctx = getCtx();
        if (!ctx) return;
        try { await writeLog(ctx, { [i.dataset.time]: i.value || null }); }
        catch (err) { showToast('Could not save: ' + err.message, 'error'); }
    });
}

// Don't wipe what someone is typing when a live update arrives
function safeRender(el, html) {
    const a = document.activeElement;
    if (el.contains(a) && a.matches('textarea, input[type="text"]')) return;
    el.innerHTML = html;
}

// ==================== Editor markup (shared by My Day and the admin log window) ====================
function detailsHTML(log, fmt, canText) {
    const dis = canText ? '' : 'disabled';
    const save = canText ? '<button class="btn btn-success" data-act="save-details"><i class="fas fa-floppy-disk"></i> Save details</button>' : '';
    if (fmt === 'SDI') {
        return `<div class="md-section">
            <h4>Checklist</h4>
            <div class="md-checks">${SDI_CHECKS.map(([k, l]) => `<label><input type="checkbox" data-detail="${k}" ${log[k] ? 'checked' : ''} ${dis}> ${l}</label>`).join('')}</div>
            <h4>Tasks</h4>
            <div class="md-tasks">${SDI_TASKS.map(([k, l]) => `<div class="form-group"><label>${l}</label><input type="text" class="form-control" data-detail="${k}" value="${esc(log[k])}" ${dis}></div>`).join('')}</div>
            <div class="form-group"><label>Comments</label><textarea class="form-control" rows="2" data-detail="comments" ${dis}>${esc(log.comments)}</textarea></div>
            ${save}</div>`;
    }
    return `<div class="md-section">
        <div class="form-group"><label>Remarks</label><textarea class="form-control" rows="2" data-detail="remarks" ${dis}>${esc(log.remarks)}</textarea></div>
        ${save}</div>`;
}

// o: { mode: 'employee' | 'admin', stampable, canText }
function editorHTML(log, fmt, o) {
    log = log || {};
    const steps = stepsOf(fmt), first = FIRST[fmt], final = FINAL[fmt];
    let html = '';

    if (o.mode === 'employee') {
        if (log[final]) {
            html += '<div class="md-done"><i class="fas fa-circle-check"></i> Shift complete. Thank you!</div>';
        } else if (o.stampable) {
            const next = steps.find(([k]) => !log[k]);
            html += `<div class="md-actions"><button class="btn btn-primary md-next" data-act="step" data-field="${next[0]}"><i class="fas ${iconFor(next[0], fmt)}"></i> ${next[1]}</button>`;
            if (log[first] && next[0] !== final) {
                html += `<button class="btn btn-outline" data-act="step" data-field="${final}">${steps[steps.length - 1][1]} now</button>`;
            }
            html += '</div>';
        } else {
            html += '<p class="md-hint">Times can only be recorded for today, or for an open shift from yesterday.</p>';
        }
    }

    html += '<div class="md-steps">' + steps.map(([k, l]) => {
        const v = log[k] || '';
        const cell = o.mode === 'admin'
            ? `<input type="time" data-time="${k}" value="${esc(v)}">${v ? `<button class="btn-icon" data-act="clear" data-field="${k}" title="Clear">&#10005;</button>` : ''}`
            : `<span class="md-step-time">${v || '&mdash;'}</span>`;
        return `<div class="md-step ${v ? 'has' : ''}"><span class="md-step-label">${l}</span><div>${cell}</div></div>`;
    }).join('') + '</div>';

    const [sLabel, sClass] = STATUS_UI[statusOf(log)];
    html += `<div class="md-totals">
        <div><span>Worked</span><strong>${fmtHM(workedMinutes(log, fmt))}</strong></div>
        <div><span>Breaks</span><strong>${fmtHM(breakMinutes(log, fmt) || null)}</strong></div>
        <div><span>Status</span><span class="status-badge ${sClass}">${sLabel}</span></div></div>`;

    return html + detailsHTML(log, fmt, o.canText);
}

// ==================== Notes thread (management <-> employee) ====================
function mountNotes(container, date, eid, who) {
    container.innerHTML = `<h4>Management notes &amp; replies</h4><div class="notes-list"></div>
        <div class="notes-compose"><textarea class="form-control" rows="2" placeholder="${who === 'MANAGEMENT' ? 'Write a note to the employee...' : 'Write a reply...'}"></textarea>
        <button class="btn btn-primary" type="button"><i class="fas fa-paper-plane"></i> Send</button></div>`;
    const list = container.querySelector('.notes-list'), ta = container.querySelector('textarea'), btn = container.querySelector('button');

    const clearAlert = () => (who === 'EMPLOYEE'
        ? remove(ref(db, `noteAlerts/${eid}/${date}`))
        : remove(ref(db, `replyAlerts/${date}/${eid}`))).catch(() => {});

    const unsub = onValue(ref(db, `notes/${date}/${eid}`), snap => {
        const items = Object.values(snap.val() || {}).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        list.innerHTML = items.length ? items.map(n => `
            <div class="note ${n.byRole === 'MANAGEMENT' ? 'mgmt' : 'emp'}">
                <div class="note-head"><strong>${esc(n.byName)}</strong><span>${n.byRole === 'MANAGEMENT' ? 'Management' : 'Employee'} &middot; ${fmtTs(n.ts)}</span></div>
                <div>${esc(n.text)}</div></div>`).join('') : '<p class="md-hint">No notes yet.</p>';
        list.scrollTop = list.scrollHeight;
        clearAlert();
    }, err => console.warn('notes read failed', err));

    btn.addEventListener('click', async () => {
        const text = ta.value.trim();
        if (!text) return;
        btn.disabled = true;
        try {
            await push(ref(db, `notes/${date}/${eid}`), { byName: state.currentUser.name, byRole: who, text, ts: serverTimestamp() });
            if (who === 'MANAGEMENT') await set(ref(db, `noteAlerts/${eid}/${date}`), serverTimestamp());
            else await set(ref(db, `replyAlerts/${date}/${eid}`), serverTimestamp());
            ta.value = '';
        } catch (err) { showToast('Could not send note: ' + err.message, 'error'); }
        btn.disabled = false;
    });

    return () => { unsub(); container.innerHTML = ''; };
}

// ==================== My Day (employee) ====================
const my = { date: todayStr(), log: null, unsub: null, notesUnsub: null };

const myCtx = () => {
    const u = state.currentUser;
    return { date: my.date, eid: u.employeeId, name: u.name, fmt: formatOf(my.log?.format || u.logType), group: groupFor(u.name), shift: shiftFor(u.name, my.date) };
};

function renderMyDay() {
    const body = $('myDayBody');
    if (!body) return;
    const u = state.currentUser;
    if (!u.employeeId || !u.employeeKey) {
        body.innerHTML = '<p class="md-empty">Your account has no employee profile, so there is nothing to log here.</p>';
        $('myDayNotes').innerHTML = '';
        return;
    }
    const today = todayStr(), yesterday = addDays(today, -1);
    const fmt = formatOf(my.log?.format || u.logType);
    const shift = shiftFor(u.name, my.date);
    const stampable = my.date === today || (my.date === yesterday && isOpenShift(my.log));
    const canText = my.date === today || my.date === yesterday;

    $('myDayDate').textContent = (my.date === today ? 'Today · ' : '') + longDate(my.date);
    $('myDayShift').innerHTML = shift ? `<span class="att-chip">${esc(shift)}</span>` : '<span class="md-hint">No scheduled shift</span>';
    $('myDayFmt').textContent = fmt === 'SDI' ? 'SDI log' : 'Standard log';
    $('myDayNext').disabled = my.date >= today;
    safeRender(body, editorHTML(my.log, fmt, { mode: 'employee', stampable, canText }));
}

function renderMyAlerts() {
    const box = $('myDayAlerts');
    if (!box) return;
    box.innerHTML = state.noteAlertDates.map(d => `<button type="button" data-date="${d}"><i class="fas fa-bullhorn"></i> Management left a note on ${longDate(d)}</button>`).join('');
}

function subscribeMyLog() {
    const u = state.currentUser;
    my.unsub && my.unsub(); my.notesUnsub && my.notesUnsub();
    my.unsub = my.notesUnsub = null;
    if (!u.employeeId || !u.employeeKey) { renderMyDay(); return; }
    my.unsub = onValue(logRef(my.date, u.employeeId), snap => { my.log = snap.val(); renderMyDay(); });
    my.notesUnsub = mountNotes($('myDayNotes'), my.date, u.employeeId, 'EMPLOYEE');
}

async function openMyDay() {
    const u = state.currentUser;
    if (!u.employeeId || !u.employeeKey) { renderMyDay(); return; }
    const today = todayStr(), y = addDays(today, -1);
    try {
        const [t, yy] = await Promise.all([get(logRef(today, u.employeeId)), get(logRef(y, u.employeeId))]);
        my.date = (!t.val() && isOpenShift(yy.val())) ? y : today;    // night shift still open from yesterday
    } catch (e) { my.date = today; }
    subscribeMyLog();
}

function moveMy(n) {
    const next = addDays(my.date, n);
    if (next > todayStr()) return;
    my.date = next;
    subscribeMyLog();
}

// ==================== Alerts ====================
const countLeaves = map => Object.values(map || {}).reduce((s, v) => s + Object.keys(v || {}).length, 0);

function watchAlerts() {
    const u = state.currentUser;
    if (isAdmin()) {
        onValue(ref(db, 'replyAlerts'), snap => {
            state.replyAlertMap = snap.val() || {};
            state.alerts.replies = countLeaves(state.replyAlertMap);
            updateNotifications();
            renderAdminDay();
        }, err => console.warn('replyAlerts', err));
    } else if (u.employeeId) {
        onValue(ref(db, `noteAlerts/${u.employeeId}`), snap => {
            const map = snap.val() || {};
            state.noteAlertDates = Object.keys(map).sort();
            state.alerts.notes = state.noteAlertDates.length;
            updateNotifications();
            renderMyAlerts();
            // already looking at that day: nothing new to announce
            if (map[my.date] && $('myday').classList.contains('active')) remove(ref(db, `noteAlerts/${u.employeeId}/${my.date}`)).catch(() => {});
        }, err => console.warn('noteAlerts', err));
    }
}

// ==================== Admin: day view + log window ====================
const adm = { date: todayStr(), logs: {}, unsub: null, group: 'ALL' };
let modalCtx = null, modalUnsub = null, modalNotesUnsub = null;

const isWorking = s => { const u = (s || '').toUpperCase().trim(); return !!u && u !== 'OFF' && !/AWAY|SICK|HOLIDAY|LEAVE/.test(u); };
const shiftPriority = s => {
    const u = (s || '').toUpperCase();
    if (/AWAY|SICK|HOLIDAY|LEAVE/.test(u)) return 5;
    if (/SUPPORT|SUPT|SUP/.test(u)) return 1;
    if (/DAY|\\(D\\)/.test(u) || u === 'D') return 2;
    if (/NIGHT|\\(N\\)/.test(u) || u === 'N') return 3;
    return 4;
};

function subscribeAdminDay() {
    adm.unsub && adm.unsub();
    $('attDate').value = adm.date;
    adm.unsub = onValue(ref(db, `attendanceLogs/${adm.date}`), snap => { adm.logs = snap.val() || {}; renderAdminDay(); },
        err => console.warn('attendanceLogs', err));
}

function openAdminAttendance() { fillPick(); subscribeAdminDay(); }

function moveAdm(n) { adm.date = addDays(adm.date, n); subscribeAdminDay(); }

function fillPick() {
    const s = $('attPick');
    if (!s) return;
    const cur = s.value;
    s.innerHTML = '<option value="">Open a log for...</option>' + state.employees.filter(e => e.status === 'active')
        .sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)))
        .map(e => `<option value="${esc(e.employeeId)}">${esc(fullNameOf(e))} (${esc(e.employeeId)})</option>`).join('');
    s.value = cur;
}

function renderAdminDay() {
    const box = $('attAdminBody');
    if (!box || !isAdmin()) return;

    const people = state.employees.filter(e => e.status === 'active').map(e => {
        const name = fullNameOf(e);
        return { eid: e.employeeId, name, fmt: formatOf(e.logType), group: groupFor(name), shift: shiftFor(name, adm.date), log: adm.logs[e.employeeId] };
    });

    const sel = $('attGroup');
    if (sel) {
        const groups = [...new Set(people.map(p => p.group))].sort();
        const cur = sel.value || 'ALL';
        sel.innerHTML = '<option value="ALL">All groups</option>' + groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
        sel.value = groups.includes(cur) ? cur : 'ALL';
        adm.group = sel.value;
    }

    const shown = people.filter(p => (p.log || isWorking(p.shift)) && (adm.group === 'ALL' || p.group === adm.group));
    const count = k => shown.filter(p => statusOf(p.log) === k).length;
    $('attSummary').innerHTML = `<span>Done: ${count('done')}</span><span>Active: ${count('active')}</span><span>On break: ${count('break')}</span><span>Not started: ${count('pending')}</span>`;

    if (!shown.length) { box.innerHTML = '<p class="md-empty">No scheduled or logged employees for this day.</p>'; return; }

    const groups = {};
    shown.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
    const replies = state.replyAlertMap[adm.date] || {};

    box.innerHTML = Object.keys(groups).sort().map(g => `
        <div class="att-group"><h4>${esc(g)}</h4>
        ${groups[g].sort((a, b) => shiftPriority(a.shift) - shiftPriority(b.shift) || a.name.localeCompare(b.name)).map(p => {
            const st = statusOf(p.log), [label, cls] = STATUS_UI[st], f = formatOf(p.log?.format || p.fmt);
            const inT = p.log?.[FIRST[f]], outT = p.log?.[FINAL[f]];
            const times = inT ? `${inT}${outT ? ' - ' + outT : ''} &middot; ${fmtHM(workedMinutes(p.log, f))}` : '';
            return `<div class="att-row" data-eid="${esc(p.eid)}">
                <img src="${avatar(p.name)}" alt="">
                <div class="att-main"><strong>${esc(p.name)}</strong><span>${esc(p.shift || 'Unscheduled')} &middot; <em class="att-chip">${f}</em></span></div>
                <div class="att-side"><span class="status-badge ${cls}">${label}</span><small>${times}</small></div>
                ${replies[p.eid] ? '<span class="att-reply" title="New reply from employee">&#128172;</span>' : ''}
            </div>`;
        }).join('')}</div>`).join('');
}

export function openLogModal(date, eid) {
    const emp = state.employees.find(e => e.employeeId === eid);
    if (!emp) return showToast('Employee not found', 'error');
    closeLogModal(true);
    const name = fullNameOf(emp);
    modalCtx = { date, eid, name, fmt: formatOf(emp.logType), group: groupFor(name), shift: shiftFor(name, date) };
    $('logModalTitle').textContent = `${name} · ${longDate(date)}`;
    modalUnsub = onValue(logRef(date, eid), snap => {
        const log = snap.val();
        modalCtx.fmt = formatOf(log?.format || emp.logType);
        const info = `<p class="md-hint" style="margin-bottom:.75rem;">${esc(modalCtx.shift || 'No scheduled shift')} &middot; ${modalCtx.fmt === 'SDI' ? 'SDI log' : 'Standard log'} &middot; corrections are saved as you change a time</p>`;
        safeRender($('logModalBody'), info + editorHTML(log, modalCtx.fmt, { mode: 'admin', canText: true }));
    });
    modalNotesUnsub = mountNotes($('logModalNotes'), date, eid, 'MANAGEMENT');
    $('logModal').classList.add('active');
}

export function closeLogModal(silent) {
    modalUnsub && modalUnsub(); modalNotesUnsub && modalNotesUnsub();
    modalUnsub = modalNotesUnsub = null;
    if (!silent) $('logModal').classList.remove('active');
}

// ==================== Init ====================
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: WORK_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export function initAttendance() {
    bindEditor($('myDayBody'), myCtx);
    bindEditor($('logModalBody'), () => modalCtx);

    on('myDayPrev', 'click', () => moveMy(-1));
    on('myDayNext', 'click', () => moveMy(1));
    on('myDayToday', 'click', () => { my.date = todayStr(); subscribeMyLog(); });
    $('myDayAlerts')?.addEventListener('click', e => {
        const b = e.target.closest('[data-date]');
        if (b) { my.date = b.dataset.date; subscribeMyLog(); }
    });

    on('attPrev', 'click', () => moveAdm(-1));
    on('attNext', 'click', () => moveAdm(1));
    on('attDate', 'change', e => { if (e.target.value) { adm.date = e.target.value; subscribeAdminDay(); } });
    on('attGroup', 'change', e => { adm.group = e.target.value; renderAdminDay(); });
    on('attOpenBtn', 'click', () => {
        const v = $('attPick').value;
        if (!v) return showToast('Choose an employee first', 'info');
        openLogModal(adm.date, v);
    });
    $('attAdminBody')?.addEventListener('click', e => {
        const row = e.target.closest('.att-row');
        if (row) openLogModal(adm.date, row.dataset.eid);
    });

    setInterval(() => { const c = $('myDayClock'); if (c) c.textContent = clockFmt.format(nowMs()); }, 1000);
    watchAlerts();

    bus.on('section', id => { if (id === 'myday') openMyDay(); else if (id === 'attendance') openAdminAttendance(); });
    bus.on('schedule:loaded', () => { renderMyDay(); renderAdminDay(); });
    bus.on('data:changed', () => { fillPick(); renderAdminDay(); });
}
