import {
    db, ref, get, set, update, remove, push, onValue, serverTimestamp,
    state, bus, $, on, esc, isAdmin, isLeader, todayStr, fmtDateTime, showToast, closeModal, beep, auditLog
} from './core.js';

export const features = ['notices'];

const N = { inbox: {}, notices: {}, subs: {}, announced: new Set(), dir: null, startedAt: Date.now() };
const me = () => state.currentUser.employeeId;
const isExpired = n => !!n.expires && n.expires < todayStr();
const canManage = n => isAdmin() || n.by === me();
const isUnread = id => !N.inbox[id]?.readAt;
const safeKey = g => String(g).replace(/[.#$\\[\\]\/]/g, '_');

// Notices this person should currently see
function visibleEntries() {
    return Object.entries(N.notices).filter(([id, n]) => N.inbox[id] && (!isExpired(n) || canManage(n)));
}

function updateBadge() {
    const count = visibleEntries().filter(([id, n]) => isUnread(id) && !isExpired(n)).length;
    state.alerts.notices = count;
    bus.emit('alerts:changed');
    const b = $('navNoticeBadge');
    if (b) { b.textContent = count; b.style.display = count ? '' : 'none'; }
}

// One live listener per notice in my inbox
function syncSubs() {
    Object.keys(N.subs).forEach(id => {
        if (!N.inbox[id]) { N.subs[id](); delete N.subs[id]; delete N.notices[id]; }
    });
    Object.keys(N.inbox).forEach(id => {
        if (N.subs[id]) return;
        N.subs[id] = onValue(ref(db, `notices/${id}`), snap => {
            const n = snap.val();
            if (!n) { delete N.notices[id]; }
            else {
                N.notices[id] = n;
                if (!N.announced.has(id)) {
                    N.announced.add(id);
                    if (Date.now() - N.startedAt > 3000 && n.by !== me() && isUnread(id)) {
                        showToast(`New notice: ${n.title}`, 'info');
                        beep();
                    }
                }
            }
            render(); updateBadge();
        }, err => console.warn('notice read failed', id, err));
    });
}

function render() {
    const box = $('noticeList');
    if (!box) return;
    const filter = $('noticeFilter').value;
    let items = visibleEntries();
    if (filter === 'unread') items = items.filter(([id]) => isUnread(id));
    if (filter === 'pinned') items = items.filter(([, n]) => n.pinned);
    items.sort((a, b) => (b[1].pinned ? 1 : 0) - (a[1].pinned ? 1 : 0) || (b[1].ts || 0) - (a[1].ts || 0));

    box.innerHTML = items.map(([id, n]) => {
        const unread = isUnread(id);
        const audience = n.audience === 'GROUPS' ? Object.keys(n.groups || {}).join(', ') : 'Everyone';
        return `<div class="notice ${unread ? 'unread' : ''} ${n.pinned ? 'pinned' : ''}">
            <div class="notice-head">
                <div>
                    <h3>${n.pinned ? '<i class="fas fa-thumbtack" style="color:#d97706"></i> ' : ''}${esc(n.title)}</h3>
                    <div class="notice-meta">${esc(n.byName || n.by)} &middot; ${fmtDateTime(n.ts)}${n.expires ? ` &middot; until ${esc(n.expires)}` : ''}</div>
                </div>
                <div>
                    <span class="notice-tag">${esc(audience)}</span>
                    ${isExpired(n) ? '<span class="notice-tag" style="background:#fee2e2;color:#b91c1c">Expired</span>' : ''}
                </div>
            </div>
            <div class="notice-body">${esc(n.body)}</div>
            <div class="notice-actions">
                ${unread ? `<button class="btn btn-primary" data-act="read" data-id="${esc(id)}"><i class="fas fa-check"></i> Mark as read</button>` : '<span class="notice-meta"><i class="fas fa-circle-check"></i> Read</span>'}
                ${canManage(n) ? `<button class="btn btn-outline" data-act="readers" data-id="${esc(id)}"><i class="fas fa-eye"></i> Read receipts</button>
                <button class="btn btn-outline" data-act="delete" data-id="${esc(id)}"><i class="fas fa-trash"></i> Delete</button>` : ''}
            </div>
        </div>`;
    }).join('') || '<p class="md-empty" style="text-align:center">No notices to show.</p>';
}

async function markRead(id) {
    try {
        await update(ref(db, `noticeInbox/${me()}/${id}`), { readAt: serverTimestamp() });
        await set(ref(db, `noticeReads/${id}/${me()}`), serverTimestamp());
    } catch (err) { showToast('Could not mark as read: ' + err.message, 'error'); }
}

// ---------- Publishing ----------
function toggleGroupsRow() {
    $('noticeGroupsRow').style.display = $('noticeAudience').value === 'GROUPS' ? '' : 'none';
}

async function loadDirectory() {
    if (!N.dir) N.dir = (await get(ref(db, 'directory'))).val() || {};
    return N.dir;
}

async function openComposer() {
    $('noticeForm').reset();
    const sel = $('noticeAudience');
    sel.querySelector('option[value="ALL"]').disabled = !isAdmin();     // leaders may only target their own groups
    sel.value = isAdmin() ? 'ALL' : 'GROUPS';

    let groups = [];
    try {
        N.dir = null;
        const dir = await loadDirectory();
        groups = [...new Set(Object.values(dir).map(p => p.group).filter(Boolean))].sort();
    } catch (err) { console.warn('directory read failed', err); }
    if (isLeader()) groups = groups.filter(g => state.currentUser.leaderGroups.includes(g));

    $('noticeGroups').innerHTML = groups.map(g => `<label><input type="checkbox" value="${esc(g)}"> ${esc(g)}</label>`).join('')
        || '<span class="md-hint">No groups available for you.</span>';
    toggleGroupsRow();
    $('noticeModal').classList.add('active');
}

async function publish() {
    const F = $('noticeForm').elements;
    const title = F.title.value.trim(), body = F.body.value.trim(), audience = F.audience.value;
    const groups = [...$('noticeGroups').querySelectorAll('input:checked')].map(i => i.value);

    if (!title || !body) return showToast('Title and message are required', 'error');
    if (audience === 'ALL' && !isAdmin()) return showToast('Only admins can send to everyone', 'error');
    if (audience === 'GROUPS' && !groups.length) return showToast('Choose at least one group', 'error');

    try {
        const dir = await loadDirectory();
        const recipients = Object.entries(dir)
            .filter(([, p]) => p.status !== 'inactive' && (audience === 'ALL' || groups.includes(p.group)))
            .map(([eid]) => eid);
        if (!recipients.includes(me())) recipients.push(me());

        const id = push(ref(db, 'notices')).key;
        await set(ref(db, `notices/${id}`), {
            title, body, audience,
            groups: audience === 'GROUPS' ? Object.fromEntries(groups.map(g => [safeKey(g), true])) : null,
            pinned: F.pinned.checked, expires: F.expires.value || null,
            by: me(), byName: state.currentUser.name, ts: serverTimestamp()
        });
        await set(ref(db, `noticeRecipients/${id}`), Object.fromEntries(recipients.map(e => [e, true])));
        await Promise.all(recipients.map(e => set(ref(db, `noticeInbox/${e}/${id}`),
            e === me() ? { ts: serverTimestamp(), readAt: serverTimestamp() } : { ts: serverTimestamp() })));

        closeModal('noticeModal');
        showToast(`Notice published to ${recipients.length} people`, 'success');
        auditLog('Notice published', `${title} -> ${audience === 'ALL' ? 'everyone' : groups.join(', ')} (${recipients.length})`);
    } catch (err) { showToast('Could not publish: ' + err.message, 'error'); }
}

// ---------- Read receipts + delete ----------
async function showReaders(id) {
    try {
        const [rec, reads, dir] = await Promise.all([
            get(ref(db, `noticeRecipients/${id}`)), get(ref(db, `noticeReads/${id}`)), get(ref(db, 'directory'))
        ]);
        const recipients = Object.keys(rec.val() || {}), readMap = reads.val() || {}, names = dir.val() || {};
        const nameOf = e => names[e]?.name || e;
        const read = recipients.filter(e => readMap[e]).sort((a, b) => readMap[a] - readMap[b]);
        const unread = recipients.filter(e => !readMap[e]).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

        $('noticeReadersBody').innerHTML = `
            <p class="notice-meta" style="margin-bottom:.75rem">${read.length} of ${recipients.length} have read this notice</p>
            <div class="readers-list"><h4>Read (${read.length})</h4>
                ${read.map(e => `<div class="reader"><span>${esc(nameOf(e))}</span><span>${fmtDateTime(readMap[e])}</span></div>`).join('') || '<p class="md-hint">Nobody yet.</p>'}
            </div>
            <div class="readers-list"><h4>Not yet read (${unread.length})</h4>
                ${unread.map(e => `<div class="reader"><span>${esc(nameOf(e))}</span><span>&mdash;</span></div>`).join('') || '<p class="md-hint">Everyone has read it.</p>'}
            </div>`;
        $('noticeReadersModal').classList.add('active');
    } catch (err) { showToast('Could not load read receipts: ' + err.message, 'error'); }
}

async function removeNotice(id) {
    const n = N.notices[id];
    if (!confirm(`Delete the notice "${n?.title || ''}" for everyone?`)) return;
    try {
        const rec = (await get(ref(db, `noticeRecipients/${id}`))).val() || {};
        await Promise.all(Object.keys(rec).map(e => remove(ref(db, `noticeInbox/${e}/${id}`))));
        await remove(ref(db, `noticeReads/${id}`));
        await remove(ref(db, `noticeRecipients/${id}`));
        await remove(ref(db, `notices/${id}`));
        showToast('Notice deleted', 'success');
        auditLog('Notice deleted', n?.title || id);
    } catch (err) { showToast('Could not delete: ' + err.message, 'error'); }
}

// ---------- Init (called by main.js) ----------
export async function init() {
    if (!me()) return {};
    onValue(ref(db, `noticeInbox/${me()}`), snap => {
        N.inbox = snap.val() || {};
        syncSubs(); render(); updateBadge();
    }, err => console.warn('notice inbox', err));

    on('noticeFilter', 'change', render);
    on('newNoticeBtn', 'click', openComposer);
    on('noticeAudience', 'change', toggleGroupsRow);
    on('noticeForm', 'submit', e => { e.preventDefault(); publish(); });
    $('noticeList').addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'read') markRead(b.dataset.id);
        else if (b.dataset.act === 'readers') showReaders(b.dataset.id);
        else if (b.dataset.act === 'delete') removeNotice(b.dataset.id);
    });
    bus.on('section', id => { if (id === 'notices') render(); });
    return {};
}
