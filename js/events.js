import {
    db, ref, get, set, update, remove, push, onValue, serverTimestamp,
    state, bus, $, on, esc, isAdmin, todayStr, fmtDateTime, showSection, showToast, closeModal, beep, auditLog
} from './core.js';

export const features = [];

const E = { inbox: {}, events: {}, subs: {}, rsvpSubs: {}, rsvps: {}, announced: new Set(), dir: null, startedAt: Date.now() };
const me = () => state.currentUser.employeeId;
const canManage = ev => isAdmin() || ev.by === me();
const myAnswer = id => E.inbox[id]?.answer || '';
const safeKey = g => String(g).replace(/[.#$\\[\\]\/]/g, '_');

function injectUI() {
    const ul = document.querySelector('.menu ul');
    const li = document.createElement('li');
    li.dataset.section = 'events';
    li.innerHTML = '<a href="#"><i class="fas fa-calendar-day"></i> Events <span class="nav-badge" id="navEventBadge" style="display:none"></span></a>';
    li.addEventListener('click', e => { e.preventDefault(); showSection('events'); });
    const anchor = ul.querySelector('[data-section="tasks"]') || ul.querySelector('[data-section="notices"]') || ul.querySelector('[data-section="messages"]');
    if (anchor) anchor.after(li); else ul.appendChild(li);

    const sec = document.createElement('section');
    sec.id = 'events';
    sec.className = 'content-section';
    sec.innerHTML = `
        <div class="section-header">
            <div class="filter-group">
                <select id="eventFilter"><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All</option></select>
            </div>
            <button class="btn btn-primary manager-only" id="newEventBtn"><i class="fas fa-calendar-plus"></i> New event</button>
        </div>
        <div id="eventList" class="event-list"></div>`;
    document.querySelector('.main-content').appendChild(sec);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'eventModal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header"><h3>New event</h3><button class="modal-close" onclick="closeModal('eventModal')">&times;</button></div>
            <div class="modal-body">
                <form id="eventForm">
                    <div class="form-group"><label>Title *</label><input type="text" name="title" required maxlength="100" class="form-control"></div>
                    <div class="form-row">
                        <div class="form-group"><label>Date *</label><input type="date" name="date" required class="form-control"></div>
                        <div class="form-group"><label>Time</label><input type="time" name="time" class="form-control"></div>
                    </div>
                    <div class="form-group"><label>Location</label><input type="text" name="location" maxlength="100" class="form-control"></div>
                    <div class="form-group"><label>Description</label><textarea name="description" rows="3" class="form-control"></textarea></div>
                    <div class="form-group"><label>Invite</label>
                        <select name="audience" id="eventAudience" class="form-control"><option value="ALL">Everyone</option><option value="GROUPS">Selected groups</option></select></div>
                    <div class="form-group" id="eventGroupsRow" style="display:none"><label>Groups</label><div id="eventGroups" class="checkbox-group"></div></div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeModal('eventModal')">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create event</button>
                    </div>
                </form>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// ---------- Live data ----------
function watchRsvps(id) {
    if (E.rsvpSubs[id]) return;
    E.rsvpSubs[id] = onValue(ref(db, `eventRsvp/${id}`), s => { E.rsvps[id] = s.val() || {}; render(); },
        err => console.warn('eventRsvp', id, err));
}

function announce(id, ev) {
    if (E.announced.has(id)) return;
    E.announced.add(id);
    if (Date.now() - E.startedAt > 3000 && ev.by !== me() && !E.inbox[id]?.seenAt) {
        showToast(`New event: ${ev.title}`, 'info');
        beep();
    }
}

function syncSubs() {
    Object.keys(E.subs).forEach(id => {
        if (!E.inbox[id]) {
            E.subs[id](); delete E.subs[id];
            if (!isAdmin()) { delete E.events[id]; E.rsvpSubs[id]?.(); delete E.rsvpSubs[id]; delete E.rsvps[id]; }
        }
    });
    if (isAdmin()) return;
    Object.keys(E.inbox).forEach(id => {
        if (E.subs[id]) return;
        E.subs[id] = onValue(ref(db, `events/${id}`), snap => {
            const ev = snap.val();
            if (!ev) { delete E.events[id]; }
            else { E.events[id] = ev; announce(id, ev); if (ev.by === me()) watchRsvps(id); }
            render(); publishAlerts();
        }, err => console.warn('event read', id, err));
    });
}

// Bell: events that are new to me, plus reminders for events happening today
function publishAlerts() {
    const today = todayStr(), alerts = [];
    Object.entries(E.events).forEach(([id, ev]) => {
        const inInbox = !!E.inbox[id];
        if (inInbox && ev.by !== me() && !E.inbox[id].seenAt) alerts.push({ kind: 'new', id, title: ev.title, date: ev.date, time: ev.time, ts: ev.ts || 0 });
        if (inInbox && ev.date === today && myAnswer(id) !== 'no') alerts.push({ kind: 'today', id, title: ev.title, date: ev.date, time: ev.time, ts: Date.now() });
    });
    state.eventAlerts = alerts;
    const b = $('navEventBadge');
    if (b) { b.textContent = alerts.length; b.style.display = alerts.length ? '' : 'none'; }
    bus.emit('alerts:changed');
}

function markSeen() {
    Object.entries(E.events).forEach(([id, ev]) => {
        if (E.inbox[id] && !E.inbox[id].seenAt) update(ref(db, `eventInbox/${me()}/${id}`), { seenAt: serverTimestamp() }).catch(() => {});
    });
}

// ---------- Rendering ----------
function render() {
    const box = $('eventList');
    if (!box) return;
    const today = todayStr(), filter = $('eventFilter').value;
    let items = Object.entries(E.events).filter(([id]) => E.inbox[id] || isAdmin());
    if (filter === 'upcoming') items = items.filter(([, ev]) => ev.date >= today);
    if (filter === 'past') items = items.filter(([, ev]) => ev.date < today);
    items.sort((a, b) => filter === 'past'
        ? (b[1].date + (b[1].time || '')).localeCompare(a[1].date + (a[1].time || ''))
        : (a[1].date + (a[1].time || '')).localeCompare(b[1].date + (b[1].time || '')));

    box.innerHTML = items.map(([id, ev]) => {
        const d = new Date(ev.date + 'T12:00:00Z');
        const day = d.getUTCDate(), mon = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
        const ans = myAnswer(id), unseen = E.inbox[id] && !E.inbox[id].seenAt && ev.by !== me();
        const past = ev.date < today;
        const rsvps = Object.values(E.rsvps[id] || {});
        const count = a => rsvps.filter(r => r.answer === a).length;
        const audience = ev.audience === 'GROUPS' ? Object.keys(ev.groups || {}).join(', ') : 'Everyone';
        return `<div class="event ${unseen ? 'unseen' : ''}" data-event="${esc(id)}">
            <div class="event-date"><strong>${day}</strong><span>${mon}</span></div>
            <div class="event-body">
                <div class="event-head"><div><h3>${esc(ev.title)}</h3>
                    <div class="task-meta">${ev.time ? esc(ev.time) + ' &middot; ' : ''}${ev.location ? esc(ev.location) + ' &middot; ' : ''}by ${esc(ev.byName || ev.by)} &middot; ${esc(audience)}</div></div>
                    ${ev.date === today ? '<span class="prio-badge" style="color:#9d174d;background:#fce7f3">Today</span>' : ''}</div>
                ${ev.description ? `<div class="event-desc">${esc(ev.description)}</div>` : ''}
                <div class="event-actions">
                    ${past || !E.inbox[id] ? '' : ['yes|Going', 'maybe|Maybe', 'no|Can\'t'].map(x => { const [v, l] = x.split('|');
                        return `<button class="btn btn-outline rsvp-btn ${ans === v ? 'active' : ''}" data-act="rsvp" data-v="${v}" data-id="${esc(id)}">${l}</button>`; }).join('')}
                    ${canManage(ev) ? `<span class="task-meta">${count('yes')} going &middot; ${count('maybe')} maybe &middot; ${count('no')} can't</span>
                        <button class="btn btn-outline" data-act="delete" data-id="${esc(id)}"><i class="fas fa-trash"></i> Delete</button>` : ''}
                </div>
            </div></div>`;
    }).join('') || '<p class="md-empty" style="text-align:center">No events to show.</p>';
}

// ---------- Actions ----------
async function rsvp(id, answer) {
    try {
        await update(ref(db, `eventInbox/${me()}/${id}`), { answer, seenAt: serverTimestamp() });
        await set(ref(db, `eventRsvp/${id}/${me()}`), { answer, name: state.currentUser.name, ts: serverTimestamp() });
    } catch (err) { showToast('Could not save your answer: ' + err.message, 'error'); }
}

async function removeEvent(id) {
    const ev = E.events[id];
    if (!confirm(`Delete the event "${ev?.title || ''}" for everyone?`)) return;
    try {
        const rec = (await get(ref(db, `eventRecipients/${id}`))).val();   // not stored; fall back to the directory
        const dir = (await get(ref(db, 'directory'))).val() || {};
        const people = Object.keys(rec || dir);
        await Promise.all(people.map(e => remove(ref(db, `eventInbox/${e}/${id}`)).catch(() => {})));
        await remove(ref(db, `eventRsvp/${id}`));
        await remove(ref(db, `events/${id}`));
        showToast('Event deleted', 'success');
        auditLog('Event deleted', ev?.title || id);
    } catch (err) { showToast('Could not delete: ' + err.message, 'error'); }
}

// ---------- Creating an event ----------
function toggleGroupsRow() { $('eventGroupsRow').style.display = $('eventAudience').value === 'GROUPS' ? '' : 'none'; }

async function openComposer() {
    $('eventForm').reset();
    const sel = $('eventAudience');
    sel.querySelector('option[value="ALL"]').disabled = !isAdmin();
    sel.value = isAdmin() ? 'ALL' : 'GROUPS';
    try { E.dir = (await get(ref(db, 'directory'))).val() || {}; } catch (err) { E.dir = {}; }
    let groups = [...new Set(Object.values(E.dir).map(p => p.group).filter(Boolean))].sort();
    if (!isAdmin()) groups = groups.filter(g => (state.currentUser.leaderGroups || []).includes(g));
    $('eventGroups').innerHTML = groups.map(g => `<label><input type="checkbox" value="${esc(g)}"> ${esc(g)}</label>`).join('') || '<span class="md-hint">No groups available for you.</span>';
    toggleGroupsRow();
    $('eventModal').classList.add('active');
}

async function publish() {
    const F = $('eventForm').elements;
    const title = F.title.value.trim(), audience = F.audience.value;
    const groups = [...$('eventGroups').querySelectorAll('input:checked')].map(i => i.value);
    if (!title || !F.date.value) return showToast('Title and date are required', 'error');
    if (audience === 'ALL' && !isAdmin()) return showToast('Only admins can invite everyone', 'error');
    if (audience === 'GROUPS' && !groups.length) return showToast('Choose at least one group', 'error');
    try {
        const dir = E.dir || (E.dir = (await get(ref(db, 'directory'))).val() || {});
        const recipients = Object.entries(dir)
            .filter(([, p]) => p.status !== 'inactive' && (audience === 'ALL' || groups.includes(p.group)))
            .map(([eid]) => eid);
        if (!recipients.includes(me())) recipients.push(me());

        const id = push(ref(db, 'events')).key;
        await set(ref(db, `events/${id}`), {
            title, date: F.date.value, time: F.time.value || null, location: F.location.value.trim() || null,
            description: F.description.value.trim() || null, audience,
            groups: audience === 'GROUPS' ? Object.fromEntries(groups.map(g => [safeKey(g), true])) : null,
            by: me(), byName: state.currentUser.name, ts: serverTimestamp()
        });
        await Promise.all(recipients.map(e => set(ref(db, `eventInbox/${e}/${id}`),
            e === me() ? { ts: serverTimestamp(), seenAt: serverTimestamp() } : { ts: serverTimestamp() })));
        closeModal('eventModal');
        showToast(`Event sent to ${recipients.length} people`, 'success');
        auditLog('Event created', `${title} on ${F.date.value} (${recipients.length})`);
    } catch (err) { showToast('Could not create the event: ' + err.message, 'error'); }
}

// ---------- Init (called by main.js) ----------
export async function init() {
    if (!me()) return {};
    injectUI();

    onValue(ref(db, `eventInbox/${me()}`), snap => { E.inbox = snap.val() || {}; syncSubs(); render(); publishAlerts(); },
        err => console.warn('event inbox', err));

    if (isAdmin()) {
        onValue(ref(db, 'events'), snap => {
            const all = snap.val() || {};
            Object.keys(E.events).forEach(id => { if (!all[id]) { delete E.events[id]; E.rsvpSubs[id]?.(); delete E.rsvpSubs[id]; delete E.rsvps[id]; } });
            Object.entries(all).forEach(([id, ev]) => { E.events[id] = ev; announce(id, ev); watchRsvps(id); });
            render(); publishAlerts();
        }, err => console.warn('events', err));
    }

    on('eventFilter', 'change', render);
    on('newEventBtn', 'click', openComposer);
    on('eventAudience', 'change', toggleGroupsRow);
    on('eventForm', 'submit', e => { e.preventDefault(); publish(); });
    $('eventList').addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'rsvp') rsvp(b.dataset.id, b.dataset.v);
        else if (b.dataset.act === 'delete') removeEvent(b.dataset.id);
    });

    bus.on('section', id => {
        if (id !== 'events') return;
        $('pageTitle').textContent = 'Events';
        render();
        setTimeout(markSeen, 600);
    });
    return {};
}
