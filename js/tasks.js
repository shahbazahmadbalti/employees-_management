import {
    db, ref, get, set, update, remove, push, onValue, serverTimestamp,
    state, bus, $, on, esc, isAdmin, todayStr, fmtDateTime, showSection, showToast, closeModal, beep, auditLog
} from './core.js';
import { uploadTaskFile, openTaskFile, deleteTaskFile, humanSize, ACCEPT } from './files.js';

export const features = [];

const T = {
    inbox: {}, tasks: {}, taskSubs: {}, statusSubs: {}, statuses: {}, fileSubs: {}, files: {},
    announced: new Set(), dir: null, startedAt: Date.now(), focus: null
};
const me = () => state.currentUser.employeeId;
const PRIORITY = { high: ['High', '#b91c1c', '#fee2e2'], normal: ['Normal', '#1e40af', '#dbeafe'], low: ['Low', '#4b5563', '#f3f4f6'] };
const isMine = t => !!(t.assignees && t.assignees[me()]);
const canManage = t => isAdmin() || t.by === me();
const overdue = t => !!t.due && t.due < todayStr();
const myStatus = id => T.inbox[id]?.status || 'todo';
const overallDone = id => { const s = Object.values(T.statuses[id] || {}); return s.length > 0 && s.every(x => x.status === 'done'); };
const fileIcon = type => /^image\//.test(type) ? 'fa-file-image' : /pdf/.test(type) ? 'fa-file-pdf' : /word/.test(type) ? 'fa-file-word'
    : /sheet|excel/.test(type) ? 'fa-file-excel' : /zip/.test(type) ? 'fa-file-zipper' : 'fa-file';

// ---------- Page, menu item and dialog are built here (no index.html change needed) ----------
function injectUI() {
    const ul = document.querySelector('.menu ul');
    const li = document.createElement('li');
    li.dataset.section = 'tasks';
    li.innerHTML = '<a href="#"><i class="fas fa-list-check"></i> Tasks <span class="nav-badge" id="navTaskBadge" style="display:none"></span></a>';
    li.addEventListener('click', e => { e.preventDefault(); showSection('tasks'); });
    const anchor = ul.querySelector('[data-section="notices"]') || ul.querySelector('[data-section="messages"]');
    if (anchor) anchor.after(li); else ul.appendChild(li);

    const sec = document.createElement('section');
    sec.id = 'tasks';
    sec.className = 'content-section';
    sec.innerHTML = `
        <div class="section-header">
            <div class="filter-group">
                <select id="taskScope">
                    <option value="mine">Assigned to me</option>
                    <option value="created">Created by me</option>
                    ${isAdmin() ? '<option value="all">All tasks</option>' : ''}
                </select>
                <select id="taskFilter"><option value="open">Open</option><option value="done">Done</option><option value="all">All</option></select>
            </div>
            <button class="btn btn-primary manager-only" id="newTaskBtn"><i class="fas fa-plus"></i> New task</button>
        </div>
        <div id="taskList" class="task-list"></div>`;
    document.querySelector('.main-content').appendChild(sec);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'taskModal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header"><h3>New task</h3><button class="modal-close" onclick="closeModal('taskModal')">&times;</button></div>
            <div class="modal-body">
                <form id="taskForm">
                    <div class="form-group"><label>Title *</label><input type="text" name="title" required maxlength="100" class="form-control"></div>
                    <div class="form-group"><label>Description</label><textarea name="description" rows="3" class="form-control"></textarea></div>
                    <div class="form-row">
                        <div class="form-group"><label>Priority</label>
                            <select name="priority" class="form-control"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></div>
                        <div class="form-group"><label>Due date</label><input type="date" name="due" class="form-control"></div>
                    </div>
                    <div class="form-group"><label>Attach files (optional)</label>
                        <input type="file" id="taskFiles" multiple accept="${ACCEPT}" class="form-control">
                        <div id="taskFileList" class="md-hint"></div></div>
                    <div class="form-group"><label>Assign to *</label>
                        <div class="group-chips" id="taskGroupChips"></div>
                        <div class="pick-list" id="taskPeople"></div></div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeModal('taskModal')">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="taskSubmitBtn">Create task</button>
                    </div>
                </form>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// ---------- Live data ----------
function watchStatuses(id) {
    if (T.statusSubs[id]) return;
    T.statusSubs[id] = onValue(ref(db, `taskStatus/${id}`), s => { T.statuses[id] = s.val() || {}; render(); publishAlerts(); },
        err => console.warn('taskStatus', id, err));
}
function watchFiles(id) {
    if (T.fileSubs[id]) return;
    T.fileSubs[id] = onValue(ref(db, `taskFiles/${id}`), s => { T.files[id] = s.val() || {}; render(); publishAlerts(); },
        err => console.warn('taskFiles', id, err));
}
function forget(id) {
    delete T.tasks[id];
    [T.statusSubs, T.fileSubs].forEach(m => { m[id]?.(); delete m[id]; });
    delete T.statuses[id]; delete T.files[id];
}

function announce(id, t) {
    if (T.announced.has(id)) return;
    T.announced.add(id);
    if (Date.now() - T.startedAt > 3000 && isMine(t) && t.by !== me() && !T.inbox[id]?.seenAt) {
        showToast(`New task: ${t.title}`, 'info');
        beep();
    }
}

function syncSubs() {
    Object.keys(T.taskSubs).forEach(id => {
        if (!T.inbox[id]) { T.taskSubs[id](); delete T.taskSubs[id]; if (!isAdmin()) forget(id); }
    });
    if (isAdmin()) return;                                   // admins read every task in one go (see init)
    Object.keys(T.inbox).forEach(id => {
        if (T.taskSubs[id]) return;
        T.taskSubs[id] = onValue(ref(db, `tasks/${id}`), snap => {
            const t = snap.val();
            if (!t) { forget(id); }
            else {
                T.tasks[id] = t;
                announce(id, t);
                watchFiles(id);
                if (t.by === me()) watchStatuses(id);
            }
            render(); publishAlerts();
        }, err => console.warn('task read', id, err));
    });
}

// What the bell shows
function publishAlerts() {
    const alerts = [];
    Object.entries(T.tasks).forEach(([id, t]) => {
        const inbox = T.inbox[id];
        if (isMine(t) && t.by !== me() && inbox && !inbox.seenAt) {
            alerts.push({ kind: 'assigned', id, title: t.title, byName: t.byName, due: t.due, ts: t.ts || 0 });
        } else if (isMine(t) && t.by !== me() && inbox && inbox.filesSeen === false) {
            alerts.push({ kind: 'files', id, title: t.title, byName: t.byName, ts: inbox.filesAt || 0 });
        }
        if (t.by === me()) {
            Object.entries(T.statuses[id] || {}).forEach(([eid, s]) => {
                if (s.status === 'done' && !s.seenByOwner && eid !== me()) {
                    alerts.push({ kind: 'done', id, eid, title: t.title, who: s.name || eid, ts: s.updatedAt || 0 });
                }
            });
            Object.values(T.files[id] || {}).forEach(f => {
                if (f.role === 'deliverable' && !f.seen && f.by !== me()) {
                    alerts.push({ kind: 'file', id, title: t.title, who: f.byName, name: f.name, ts: f.ts || 0 });
                }
            });
        }
    });
    state.taskAlerts = alerts;
    const b = $('navTaskBadge');
    if (b) { b.textContent = alerts.length; b.style.display = alerts.length ? '' : 'none'; }
    bus.emit('alerts:changed');
}

function markSeen() {
    Object.entries(T.tasks).forEach(([id, t]) => {
        const inbox = T.inbox[id];
        if (isMine(t) && inbox && (!inbox.seenAt || inbox.filesSeen === false)) {
            update(ref(db, `taskInbox/${me()}/${id}`), { seenAt: serverTimestamp(), filesSeen: true }).catch(() => {});
        }
        if (t.by === me()) {
            Object.entries(T.statuses[id] || {}).forEach(([eid, s]) => {
                if (s.status === 'done' && !s.seenByOwner) update(ref(db, `taskStatus/${id}/${eid}`), { seenByOwner: true }).catch(() => {});
            });
            Object.entries(T.files[id] || {}).forEach(([fid, f]) => {
                if (f.role === 'deliverable' && !f.seen) update(ref(db, `taskFiles/${id}/${fid}`), { seen: true }).catch(() => {});
            });
        }
    });
}

// ---------- Rendering ----------
function fileRow(id, fid, f, t) {
    return `<div class="file-row">
        <i class="fas ${fileIcon(f.type)}"></i>
        <div class="file-info"><strong>${esc(f.name)}</strong><small>${humanSize(f.size || 0)} &middot; ${esc(f.byName || f.by)} &middot; ${fmtDateTime(f.ts)}</small></div>
        <button class="btn btn-outline" data-act="file-open" data-id="${esc(id)}" data-fid="${esc(fid)}"><i class="fas fa-up-right-from-square"></i> Open</button>
        ${(f.by === me() || canManage(t)) ? `<button class="btn-icon" title="Delete file" data-act="file-del" data-id="${esc(id)}" data-fid="${esc(fid)}"><i class="fas fa-xmark"></i></button>` : ''}
    </div>`;
}

function filesBlock(id, t) {
    const all = Object.entries(T.files[id] || {}).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
    const attachments = all.filter(([, f]) => f.role === 'attachment');
    const uploads = all.filter(([, f]) => f.role === 'deliverable' && (canManage(t) || f.by === me()));
    let html = '';
    if (attachments.length) html += `<div class="file-group"><h5>Attachments</h5>${attachments.map(([fid, f]) => fileRow(id, fid, f, t)).join('')}</div>`;
    if (uploads.length) html += `<div class="file-group"><h5>${canManage(t) ? 'Files uploaded back' : 'Your uploads'}</h5>${uploads.map(([fid, f]) => fileRow(id, fid, f, t)).join('')}</div>`;
    return html;
}

function card(id, t, scope) {
    const [pLabel, pColor, pBg] = PRIORITY[t.priority] || PRIORITY.normal;
    const mineView = scope === 'mine';
    const st = mineView ? myStatus(id) : (overallDone(id) ? 'done' : 'open');
    const unseen = mineView && isMine(t) && t.by !== me() && !T.inbox[id]?.seenAt;
    const statuses = T.statuses[id] || {};
    const doneCount = Object.values(statuses).filter(s => s.status === 'done').length, total = Object.keys(statuses).length;

    let actions = '';
    if (mineView && isMine(t)) {
        actions += st === 'done'
            ? `<button class="btn btn-outline" data-act="reopen" data-id="${esc(id)}"><i class="fas fa-rotate-left"></i> Reopen</button>`
            : `${st === 'todo' ? `<button class="btn btn-outline" data-act="start" data-id="${esc(id)}"><i class="fas fa-play"></i> Start</button>` : ''}
               <button class="btn btn-success" data-act="done" data-id="${esc(id)}"><i class="fas fa-check"></i> Mark done</button>`;
        actions += `<label class="btn btn-outline"><i class="fas fa-upload"></i> Upload file
            <input type="file" multiple hidden accept="${ACCEPT}" data-upload="${esc(id)}" data-role="deliverable"></label>`;
    }
    if (canManage(t)) {
        actions += `<label class="btn btn-outline"><i class="fas fa-paperclip"></i> Add file
            <input type="file" multiple hidden accept="${ACCEPT}" data-upload="${esc(id)}" data-role="attachment"></label>
            <button class="btn btn-outline" data-act="delete" data-id="${esc(id)}"><i class="fas fa-trash"></i> Delete</button>`;
    }

    const chips = !mineView ? `<div class="assignee-chips">${Object.entries(statuses).map(([eid, s]) =>
        `<span class="${esc(s.status)}">${esc(s.name || eid)} · ${esc(s.status)}</span>`).join('')}</div>` : '';

    return `<div class="task ${st === 'done' ? 'done' : ''} ${overdue(t) && st !== 'done' ? 'overdue' : ''} ${unseen ? 'unseen' : ''}" data-task="${esc(id)}">
        <div class="task-head">
            <div><h3>${esc(t.title)}</h3>
                <div class="task-meta">From ${esc(t.byName || t.by)} &middot; ${fmtDateTime(t.ts)}${t.due ? ` &middot; due ${esc(t.due)}` : ''}${overdue(t) && st !== 'done' ? ' &middot; <strong style="color:var(--danger-color)">overdue</strong>' : ''}</div></div>
            <div><span class="prio-badge" style="color:${pColor};background:${pBg}">${pLabel}</span>
                ${mineView ? `<span class="status-badge ${st === 'done' ? 'present' : st === 'doing' ? 'approved' : 'pending'}">${st}</span>` : `<span class="status-badge ${st === 'done' ? 'present' : 'pending'}">${doneCount}/${total} done</span>`}</div>
        </div>
        ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ''}
        ${chips}
        ${filesBlock(id, t)}
        <div class="task-actions">${actions}</div></div>`;
}

function render() {
    const box = $('taskList');
    if (!box) return;
    const scope = $('taskScope').value, filter = $('taskFilter').value;
    let items = Object.entries(T.tasks).filter(([id, t]) =>
        scope === 'created' ? t.by === me() : scope === 'all' ? true : isMine(t));
    const isDone = ([id]) => (scope === 'mine' ? myStatus(id) === 'done' : overallDone(id));
    if (filter === 'open') items = items.filter(x => !isDone(x));
    if (filter === 'done') items = items.filter(isDone);
    items.sort((a, b) => (a[1].due || '9999').localeCompare(b[1].due || '9999') || (b[1].ts || 0) - (a[1].ts || 0));
    box.innerHTML = items.map(([id, t]) => card(id, t, scope)).join('') || '<p class="md-empty" style="text-align:center">No tasks here.</p>';
    if (T.focus) {
        const el = box.querySelector(`[data-task="${T.focus}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); T.focus = null; }
    }
}

// ---------- Files ----------
async function uploadAll(taskId, files, role) {
    let ok = 0;
    for (const file of files) {
        try {
            showToast(`Uploading ${file.name}...`, 'info');
            await uploadTaskFile(taskId, file, role);
            ok++;
        } catch (err) { showToast(err.message, 'error'); }
    }
    if (!ok) return;
    showToast(`${ok} file${ok > 1 ? 's' : ''} uploaded`, 'success');
    const t = T.tasks[taskId];
    if (role === 'attachment' && t) {      // tell the assignees there is something new on their task
        Object.keys(t.assignees || {}).filter(e => e !== me()).forEach(e =>
            update(ref(db, `taskInbox/${e}/${taskId}`), { filesAt: serverTimestamp(), filesSeen: false }).catch(() => {}));
    }
    auditLog(role === 'deliverable' ? 'Task file uploaded' : 'Task file attached', `${t?.title || taskId}: ${ok} file(s)`);
}

async function openFile(id, fid) {
    const meta = T.files[id]?.[fid];
    if (!meta) return;
    try { await openTaskFile(id, fid, meta); } catch (err) { showToast('Could not open the file: ' + err.message, 'error'); }
}

async function removeFile(id, fid) {
    const meta = T.files[id]?.[fid];
    if (!meta || !confirm(`Delete "${meta.name}"?`)) return;
    try { await deleteTaskFile(id, fid, meta); showToast('File deleted', 'success'); }
    catch (err) { showToast('Could not delete the file: ' + err.message, 'error'); }
}

// ---------- Actions ----------
async function setStatus(id, status) {
    const t = T.tasks[id];
    try {
        await update(ref(db, `taskInbox/${me()}/${id}`), { status, seenAt: serverTimestamp() });
        await set(ref(db, `taskStatus/${id}/${me()}`), { status, name: state.currentUser.name, updatedAt: serverTimestamp(), seenByOwner: false });
        if (status === 'done') { showToast('Task marked as done', 'success'); auditLog('Task completed', t?.title || id); }
    } catch (err) { showToast('Could not update the task: ' + err.message, 'error'); }
}

async function removeTask(id) {
    const t = T.tasks[id];
    if (!confirm(`Delete the task "${t?.title || ''}" and its files for everyone?`)) return;
    try {
        await Promise.all(Object.entries(T.files[id] || {}).map(([fid, f]) => deleteTaskFile(id, fid, f).catch(() => {})));
        await remove(ref(db, `taskFiles/${id}`));
        await remove(ref(db, `taskFileData/${id}`));
        const people = new Set([...Object.keys(t?.assignees || {}), t?.by || me()]);
        await Promise.all([...people].map(e => remove(ref(db, `taskInbox/${e}/${id}`))));
        await remove(ref(db, `taskStatus/${id}`));
        await remove(ref(db, `tasks/${id}`));
        showToast('Task deleted', 'success');
        auditLog('Task deleted', t?.title || id);
    } catch (err) { showToast('Could not delete: ' + err.message, 'error'); }
}

// ---------- Creating a task ----------
async function openComposer() {
    $('taskForm').reset();
    $('taskFileList').textContent = '';
    try { T.dir = (await get(ref(db, 'directory'))).val() || {}; } catch (err) { T.dir = {}; }
    const mine = state.currentUser.leaderGroups || [];
    const people = Object.entries(T.dir)
        .filter(([, p]) => p.status !== 'inactive' && (isAdmin() || mine.includes(p.group)))
        .map(([eid, p]) => ({ eid, ...p })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const groups = [...new Set(people.map(p => p.group).filter(Boolean))].sort();

    $('taskGroupChips').innerHTML = groups.map(g => `<button type="button" class="group-chip" data-group="${esc(g)}">+ ${esc(g)}</button>`).join('');
    $('taskPeople').innerHTML = people.map(p => `
        <label class="pick-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.group || '')}</small></div>
        <input type="checkbox" class="task-person" value="${esc(p.eid)}" data-group="${esc(p.group || '')}"></label>`).join('')
        || '<p class="md-hint">No one available to assign.</p>';
    $('taskModal').classList.add('active');
}

async function publish() {
    const F = $('taskForm').elements;
    const title = F.title.value.trim();
    const picked = [...document.querySelectorAll('.task-person:checked')].map(c => c.value);
    const files = [...($('taskFiles').files || [])];
    if (!title) return showToast('A title is required', 'error');
    if (!picked.length) return showToast('Choose at least one person', 'error');
    const btn = $('taskSubmitBtn');
    btn.disabled = true;
    try {
        const id = push(ref(db, 'tasks')).key;
        await set(ref(db, `tasks/${id}`), {
            title, description: F.description.value.trim(), priority: F.priority.value, due: F.due.value || null,
            by: me(), byName: state.currentUser.name, ts: serverTimestamp(),
            assignees: Object.fromEntries(picked.map(e => [e, true]))
        });
        const everyone = [...new Set([...picked, me()])];
        await Promise.all(everyone.map(e => set(ref(db, `taskInbox/${e}/${id}`),
            picked.includes(e) ? (e === me() ? { ts: serverTimestamp(), status: 'todo', seenAt: serverTimestamp() } : { ts: serverTimestamp(), status: 'todo' })
                               : { ts: serverTimestamp(), owner: true, seenAt: serverTimestamp() })));
        await Promise.all(picked.map(e => set(ref(db, `taskStatus/${id}/${e}`),
            { status: 'todo', name: T.dir?.[e]?.name || e, updatedAt: serverTimestamp(), seenByOwner: true })));
        auditLog('Task created', `${title} -> ${picked.length} people`);

        closeModal('taskModal');
        showToast(`Task sent to ${picked.length} ${picked.length === 1 ? 'person' : 'people'}`, 'success');
        if (files.length) {                       // files go up after the task exists (the rules need it)
            T.tasks[id] = T.tasks[id] || { assignees: {}, by: me() };
            await uploadAll(id, files, 'attachment');
        }
    } catch (err) { showToast('Could not create the task: ' + err.message, 'error'); }
    btn.disabled = false;
}

// ---------- Init (called by main.js) ----------
export async function init() {
    if (!me()) return {};
    injectUI();

    onValue(ref(db, `taskInbox/${me()}`), snap => { T.inbox = snap.val() || {}; syncSubs(); render(); publishAlerts(); },
        err => console.warn('task inbox', err));

    if (isAdmin()) {      // admins see every task, its progress and its files
        onValue(ref(db, 'tasks'), snap => {
            const all = snap.val() || {};
            Object.keys(T.tasks).forEach(id => { if (!all[id]) forget(id); });
            Object.entries(all).forEach(([id, t]) => { T.tasks[id] = t; announce(id, t); watchStatuses(id); watchFiles(id); });
            render(); publishAlerts();
        }, err => console.warn('tasks', err));
    }

    on('taskScope', 'change', render);
    on('taskFilter', 'change', render);
    on('newTaskBtn', 'click', openComposer);
    on('taskForm', 'submit', e => { e.preventDefault(); publish(); });
    $('taskFiles').addEventListener('change', e => {
        $('taskFileList').textContent = [...e.target.files].map(f => `${f.name} (${humanSize(f.size)})`).join(' · ');
    });
    $('taskGroupChips').addEventListener('click', e => {
        const chip = e.target.closest('[data-group]');
        if (!chip) return;
        document.querySelectorAll(`.task-person[data-group="${CSS.escape(chip.dataset.group)}"]`).forEach(c => { c.checked = true; });
    });
    $('taskList').addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const id = b.dataset.id;
        if (b.dataset.act === 'start') setStatus(id, 'doing');
        else if (b.dataset.act === 'done') setStatus(id, 'done');
        else if (b.dataset.act === 'reopen') setStatus(id, 'todo');
        else if (b.dataset.act === 'delete') removeTask(id);
        else if (b.dataset.act === 'file-open') openFile(id, b.dataset.fid);
        else if (b.dataset.act === 'file-del') removeFile(id, b.dataset.fid);
    });
    $('taskList').addEventListener('change', e => {
        const input = e.target.closest('input[data-upload]');
        if (!input || !input.files.length) return;
        const files = [...input.files];
        input.value = '';
        uploadAll(input.dataset.upload, files, input.dataset.role);
    });

    // Jump here from the bell list
    bus.on('tasks:open', ({ id, scope }) => {
        T.focus = id;
        if (scope && $('taskScope').querySelector(`option[value="${scope}"]`)) $('taskScope').value = scope;
        $('taskFilter').value = 'all';
    });
    bus.on('section', id => {
        if (id !== 'tasks') return;
        $('pageTitle').textContent = 'Tasks';
        render();
        setTimeout(markSeen, 600);
    });
    return {};
}
