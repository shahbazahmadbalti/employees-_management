import { query, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
    db, ref, get, set, push, remove, onValue, serverTimestamp, WORK_TZ, beep,
    state, bus, $, on, esc, avatar, isAdmin, fullNameOf, profileKey, showToast, closeModal
} from './core.js';
import { groupFor } from './schedule.js';

const EMOJIS = ['👍', '❤️', '😂', '😮', '🙏'];
const C = {
    dir: {}, settings: { visibility: 'ALL', canCreateGroups: true },
    rooms: {}, reads: {}, msgs: {}, ready: {}, metaUnsubs: {},
    active: null, msgUnsub: null, stick: true
};
const me = () => state.currentUser.employeeId;
const roomRef = id => ref(db, `chats/rooms/${id}`);
const directId = (a, b) => [a, b].sort().join('~');
const byName = (a, b) => String(a.name).localeCompare(String(b.name));

const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('en-GB', { timeZone: WORK_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '...';
const dayKey = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: WORK_TZ });
const dayLabel = ts => {
    const k = dayKey(ts), today = dayKey(Date.now());
    if (k === today) return 'Today';
    if (k === dayKey(Date.now() - 86400000)) return 'Yesterday';
    return new Date(ts).toLocaleDateString('en-GB', { timeZone: WORK_TZ, day: 'numeric', month: 'long' });
};
const listTime = ts => !ts ? '' : (dayKey(ts) === dayKey(Date.now()) ? fmtTime(ts) : new Date(ts).toLocaleDateString('en-GB', { timeZone: WORK_TZ, day: 'numeric', month: 'short' }));

// ---------- Directory (admin keeps it in sync; everyone reads it) ----------
let syncTimer = null;
function syncDirectory() {
    if (!isAdmin()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
        const obj = {};
        state.employees.forEach(e => {
            if (!e.employeeId) return;
            const name = fullNameOf(e);
            const prof = state.profiles.find(p => p.id === profileKey(name));
            const r = String(prof?.role || 'USER').toUpperCase();
            obj[e.employeeId] = {
                name, group: groupFor(name), status: e.status || 'active', logType: e.logType || 'Logs',
                role: r === 'ADMIN' || r === 'LEADER' ? r : 'USER'
            };
        });
        const u = state.currentUser;
        if (u.employeeId && !obj[u.employeeId]) obj[u.employeeId] = { name: u.name, group: 'General', status: 'active', role: 'ADMIN', logType: 'Logs' };
        try { await set(ref(db, 'directory'), obj); } catch (err) { console.warn('Directory sync failed', err); }
    }, 600);
}

// ---------- Who may chat with whom ----------
function canChat(person, myDir) {
    if (isAdmin() || person.role === 'ADMIN' || person.role === 'LEADER') return true;
    const v = C.settings.visibility;
    if (v === 'ALL') return true;
    if (v === 'GROUP') return !!person.group && person.group === myDir.group;
    return false;
}
const allowedPeople = () => {
    const myDir = C.dir[me()] || {};
    return Object.entries(C.dir)
        .filter(([eid, p]) => eid !== me() && p.status !== 'inactive' && canChat(p, myDir))
        .map(([eid, p]) => ({ eid, ...p })).sort(byName);
};

// ---------- Rooms ----------
function roomTitle(meta) {
    if (meta.type === 'group') return meta.name || 'Group';
    const other = Object.keys(meta.members || {}).find(k => k !== me());
    return C.dir[other]?.name || other || 'Chat';
}
const isUnread = (id, meta) => !!meta.lastBy && meta.lastBy !== me() && (meta.lastTs || 0) > (C.reads[id] || 0);

function updateBadge() {
    const n = Object.entries(C.rooms).filter(([id, m]) => isUnread(id, m) && id !== C.active).length;
    const b = $('navChatBadge');
    if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
}

function maybeToast(id, prev, meta) {
    const first = !C.ready[id];
    C.ready[id] = true;
    if (first || meta.lastBy === me() || !meta.lastBy || prev?.lastTs === meta.lastTs) return;
    if (C.active === id && $('messages').classList.contains('active')) return;
    showToast(`New message from ${C.dir[meta.lastBy]?.name || meta.lastBy}`, 'info');
    beep();
}

function syncRoomSubs(ids) {
    Object.keys(C.metaUnsubs).forEach(id => {
        if (!ids.includes(id)) { C.metaUnsubs[id](); delete C.metaUnsubs[id]; delete C.rooms[id]; delete C.ready[id]; }
    });
    ids.forEach(id => {
        if (C.metaUnsubs[id]) return;
        C.metaUnsubs[id] = onValue(roomRef(id), snap => {
            const meta = snap.val();
            if (!meta) { delete C.rooms[id]; }
            else {
                const prev = C.rooms[id];
                C.rooms[id] = meta;
                maybeToast(id, prev, meta);
                if (C.active === id && isUnread(id, meta)) markRead(id);
            }
            renderChatList(); updateBadge();
        }, err => console.warn('room read failed', id, err));
    });
    renderChatList();
}

function renderChatList() {
    const box = $('chatList');
    if (!box) return;
    const q = ($('chatSearch').value || '').toLowerCase();
    const rows = Object.entries(C.rooms)
        .map(([id, m]) => ({ id, m, title: roomTitle(m) }))
        .filter(r => !q || r.title.toLowerCase().includes(q))
        .sort((a, b) => (b.m.lastTs || 0) - (a.m.lastTs || 0));
    box.innerHTML = rows.map(({ id, m, title }) => {
        const unread = isUnread(id, m) && id !== C.active;
        const last = m.lastMsg ? `${m.lastBy === me() ? 'You: ' : ''}${esc(m.lastMsg)}` : 'No messages yet';
        return `<div class="chat-item ${unread ? 'unread' : ''} ${id === C.active ? 'active' : ''}" data-room="${esc(id)}">
            <img src="${avatar(title, m.type === 'group' ? '10B981' : '4F46E5')}" alt="">
            <div class="chat-item-main">
                <div class="chat-item-top"><strong>${esc(title)}${m.type === 'group' ? ' <i class="fas fa-users" style="font-size:.7rem;color:var(--gray-400)"></i>' : ''}</strong><small>${listTime(m.lastTs)}</small></div>
                <div class="chat-item-last">${last}</div>
            </div>${unread ? '<span class="chat-dot"></span>' : ''}</div>`;
    }).join('') || '<p class="md-hint" style="text-align:center;padding:1rem">No chats yet. Tap "New" to start one.</p>';
}

function markRead(id) {
    set(ref(db, `chats/reads/${me()}/${id}`), serverTimestamp()).catch(() => {});
}

function openRoom(id) {
    const meta = C.rooms[id];
    if (!meta) return;
    C.active = id; C.stick = true;
    C.msgUnsub && C.msgUnsub();
    $('chatShell').classList.add('room-open');
    $('chatEmpty').style.display = 'none';
    $('chatRoom').style.display = 'flex';
    $('chatRoomTitle').textContent = roomTitle(meta);
    const other = meta.type === 'direct' ? C.dir[Object.keys(meta.members || {}).find(k => k !== me())] : null;
    $('chatRoomSub').textContent = meta.type === 'group'
        ? `${Object.keys(meta.members || {}).length} members`
        : (other ? `${other.group || ''}${other.role === 'ADMIN' || other.role === 'LEADER' ? ' · Management' : ''}` : '');
    $('chatDeleteBtn').style.display = (meta.type === 'group' && (isAdmin() || meta.createdBy === me())) ? '' : 'none';
    C.msgUnsub = onValue(query(ref(db, `chats/messages/${id}`), limitToLast(150)), snap => {
        C.msgs[id] = snap.val() || {};
        renderMessages();
        if (isUnread(id, C.rooms[id] || {})) markRead(id);
    }, err => showToast('Could not load messages: ' + err.message, 'error'));
    markRead(id);
    renderChatList(); updateBadge();
}

function closeRoomView() {
    C.msgUnsub && C.msgUnsub(); C.msgUnsub = null; C.active = null;
    $('chatShell').classList.remove('room-open');
    $('chatRoom').style.display = 'none';
    $('chatEmpty').style.display = '';
    renderChatList(); updateBadge();
}

function renderMessages() {
    const box = $('chatMessages'), id = C.active;
    if (!id) { box.innerHTML = ''; return; }
    const isGroup = C.rooms[id]?.type === 'group';
    const items = Object.entries(C.msgs[id] || {}).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    let lastDay = '';
    const open = box.querySelector('.show-react')?.dataset.mid;

    box.innerHTML = items.map(([mid, m]) => {
        let sep = '';
        if (m.ts) { const d = dayLabel(m.ts); if (d !== lastDay) { sep = `<div class="chat-day">${d}</div>`; lastDay = d; } }
        if (m.system) return sep + `<div class="chat-system">${esc(m.text)}</div>`;
        const mine = m.from === me();
        const counts = {};
        Object.values(m.reactions || {}).forEach(e => { counts[e] = (counts[e] || 0) + 1; });
        const myReact = (m.reactions || {})[me()];
        const reacts = Object.entries(counts).map(([e, n]) => `<span class="${e === myReact ? 'mine' : ''}" data-react="${e}" data-mid="${mid}">${e} ${n}</span>`).join('');
        return sep + `<div class="chat-row ${mine ? 'mine' : ''}"><div class="chat-bubble ${open === mid ? 'show-react' : ''}" data-mid="${mid}">
            ${isGroup && !mine ? `<div class="chat-sender">${esc(m.fromName || m.from)}</div>` : ''}
            <div>${esc(m.text).replace(/\n/g, '<br>')}</div>
            ${reacts ? `<div class="chat-reacts">${reacts}</div>` : ''}
            <div class="chat-react-bar">${EMOJIS.map(e => `<button type="button" data-react="${e}" data-mid="${mid}">${e}</button>`).join('')}</div>
            <div class="chat-meta">${fmtTime(m.ts)}${mine ? `<button type="button" data-del="${mid}" title="Delete"><i class="fas fa-trash"></i></button>` : ''}</div>
        </div></div>`;
    }).join('') || '<p class="md-hint" style="text-align:center;padding:1rem">No messages yet. Say hello!</p>';

    if (C.stick || nearBottom) box.scrollTop = box.scrollHeight;
    C.stick = false;
}

async function sendMessage() {
    const input = $('chatInput'), text = input.value.trim(), id = C.active;
    if (!text || !id) return;
    input.value = ''; input.style.height = 'auto';
    C.stick = true;
    try {
        await push(ref(db, `chats/messages/${id}`), { from: me(), fromName: state.currentUser.name, text, ts: serverTimestamp() });
        await set(ref(db, `chats/rooms/${id}/lastMsg`), text.slice(0, 80));
        await set(ref(db, `chats/rooms/${id}/lastBy`), me());
        await set(ref(db, `chats/rooms/${id}/lastTs`), serverTimestamp());
    } catch (err) {
        input.value = text;
        showToast('Message not sent: ' + err.message, 'error');
    }
}

async function react(mid, emoji) {
    const current = (C.msgs[C.active]?.[mid]?.reactions || {})[me()];
    const r = ref(db, `chats/messages/${C.active}/${mid}/reactions/${me()}`);
    try { await (current === emoji ? remove(r) : set(r, emoji)); }
    catch (err) { showToast('Could not react: ' + err.message, 'error'); }
}

// ---------- Starting chats ----------
function renderPickList() {
    const q = ($('chatPickSearch').value || '').toLowerCase();
    const people = allowedPeople().filter(p => !q || p.name.toLowerCase().includes(q));
    $('chatPickList').innerHTML = people.map(p => `
        <div class="pick-item" data-eid="${esc(p.eid)}"><img src="${avatar(p.name)}" alt="">
        <div><strong>${esc(p.name)}</strong><small>${esc(p.group || '')}${p.role === 'ADMIN' || p.role === 'LEADER' ? ' · Management' : ''}</small></div></div>`).join('')
        || '<p class="md-hint">No one available to message.</p>';
}

async function startDirect(other) {
    const id = directId(me(), other);
    closeModal('chatPickModal');
    try {
        const snap = await get(roomRef(id));
        if (!snap.exists()) {
            await set(roomRef(id), { type: 'direct', members: { [me()]: true, [other]: true }, createdBy: me(), lastTs: serverTimestamp() });
        }
        await Promise.all([set(ref(db, `chats/userRooms/${me()}/${id}`), true), set(ref(db, `chats/userRooms/${other}/${id}`), true)]);
        C.rooms[id] = C.rooms[id] || { type: 'direct', members: { [me()]: true, [other]: true }, createdBy: me() };
        openRoom(id);
    } catch (err) { showToast('Could not start chat: ' + err.message, 'error'); }
}

function openGroupModal() {
    if (!isAdmin() && !C.settings.canCreateGroups) return showToast('Creating groups is turned off', 'info');
    $('groupName').value = '';
    $('groupMembers').innerHTML = allowedPeople().map(p => `
        <label class="pick-item"><img src="${avatar(p.name)}" alt=""><div><strong>${esc(p.name)}</strong><small>${esc(p.group || '')}</small></div>
        <input type="checkbox" class="grp-member" value="${esc(p.eid)}"></label>`).join('') || '<p class="md-hint">No one available.</p>';
    $('groupModal').classList.add('active');
}

async function createGroup() {
    const name = $('groupName').value.trim();
    const picked = [...document.querySelectorAll('.grp-member:checked')].map(c => c.value);
    if (!name) return showToast('Group name is required', 'error');
    if (!picked.length) return showToast('Choose at least one member', 'error');
    const members = { [me()]: true };
    picked.forEach(e => { members[e] = true; });
    try {
        const r = push(ref(db, 'chats/rooms')), id = r.key;
        await set(r, { type: 'group', name, members, createdBy: me(), lastTs: serverTimestamp() });
        await Promise.all(Object.keys(members).map(e => set(ref(db, `chats/userRooms/${e}/${id}`), true)));
        await push(ref(db, `chats/messages/${id}`), { from: me(), fromName: 'System', system: true, text: `Group "${name}" created`, ts: serverTimestamp() });
        closeModal('groupModal');
        C.rooms[id] = { type: 'group', name, members, createdBy: me() };
        openRoom(id);
        showToast('Group created', 'success');
    } catch (err) { showToast('Could not create group: ' + err.message, 'error'); }
}

async function deleteGroup() {
    const id = C.active, meta = C.rooms[id];
    if (!meta || !confirm(`Delete the group "${meta.name}" for everyone?`)) return;
    try {
        await Promise.all(Object.keys(meta.members || {}).map(e => remove(ref(db, `chats/userRooms/${e}/${id}`))));
        await remove(ref(db, `chats/messages/${id}`));
        await remove(roomRef(id));
        closeRoomView();
        showToast('Group deleted', 'success');
    } catch (err) { showToast('Could not delete group: ' + err.message, 'error'); }
}

// ---------- Admin chat settings ----------
function fillSettingsForm() {
    if ($('adminChatVisibility')) $('adminChatVisibility').value = C.settings.visibility;
    if ($('adminChatGroups')) $('adminChatGroups').value = String(C.settings.canCreateGroups);
}
async function saveChatSettings() {
    try {
        await set(ref(db, 'settings/chat'), { visibility: $('adminChatVisibility').value, canCreateGroups: $('adminChatGroups').value === 'true' });
        showToast('Chat settings saved', 'success');
    } catch (err) { showToast('Could not save: ' + err.message, 'error'); }
}

// ---------- Init ----------
export function initChat() {
    if (!me()) return;

    onValue(ref(db, 'directory'), s => { C.dir = s.val() || {}; renderChatList(); });
    onValue(ref(db, 'settings/chat'), s => {
        C.settings = { visibility: 'ALL', canCreateGroups: true, ...(s.val() || {}) };
        $('newGroupBtn').style.display = (isAdmin() || C.settings.canCreateGroups) ? '' : 'none';
        fillSettingsForm();
    });
    onValue(ref(db, `chats/reads/${me()}`), s => { C.reads = s.val() || {}; renderChatList(); updateBadge(); });
    onValue(ref(db, `chats/userRooms/${me()}`), s => syncRoomSubs(Object.keys(s.val() || {})), err => console.warn('userRooms', err));

    on('newChatBtn', 'click', () => { $('chatPickSearch').value = ''; renderPickList(); $('chatPickModal').classList.add('active'); });
    on('newGroupBtn', 'click', openGroupModal);
    on('groupCreateBtn', 'click', createGroup);
    on('chatPickSearch', 'input', renderPickList);
    on('chatSearch', 'input', renderChatList);
    on('chatBack', 'click', closeRoomView);
    on('chatDeleteBtn', 'click', deleteGroup);
    on('saveChatSettingsBtn', 'click', saveChatSettings);

    $('chatPickList').addEventListener('click', e => { const it = e.target.closest('.pick-item'); if (it) startDirect(it.dataset.eid); });
    $('chatList').addEventListener('click', e => { const it = e.target.closest('.chat-item'); if (it) openRoom(it.dataset.room); });

    $('chatMessages').addEventListener('click', e => {
        const del = e.target.closest('[data-del]');
        if (del) { if (confirm('Delete this message?')) remove(ref(db, `chats/messages/${C.active}/${del.dataset.del}`)).catch(err => showToast(err.message, 'error')); return; }
        const r = e.target.closest('[data-react]');
        if (r) { react(r.dataset.mid, r.dataset.react); return; }
        const bubble = e.target.closest('.chat-bubble');
        document.querySelectorAll('.chat-bubble.show-react').forEach(b => { if (b !== bubble) b.classList.remove('show-react'); });
        if (bubble) bubble.classList.toggle('show-react');
    });

    const input = $('chatInput');
    $('chatForm').addEventListener('submit', e => { e.preventDefault(); sendMessage(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });

    bus.on('section', id => { if (id === 'messages') { renderChatList(); if (C.active) { C.stick = true; renderMessages(); } } });
    bus.on('data:changed', syncDirectory);
}
