import { state, bus, $, on, esc, isAdmin, isLeader, isManager, showSection, fullNameOf } from './core.js';

const SEEN_KEY = 'ems_seen_leave';
let seen = null, current = [], isOpen = false, lastCount = -1, dataReady = false, panel = null;

const nameOf = eid => state.directory?.[eid]?.name || fullNameOf(state.employees.find(e => e.employeeId === eid) || {}) || eid;
const myGroupMember = eid => state.employees.some(e => e.employeeId === eid);
const inMyGroups = eid => { const g = state.directory?.[eid]?.group; return !!g && state.currentUser.leaderGroups.includes(g); };

function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.round(m / 60)}h`;
    return `${Math.round(m / 1440)}d`;
}

// Own leave decisions the person has not looked at yet. Decisions that existed before the
// first run are treated as already seen, so nobody gets a pile of old alerts.
function ensureSeen() {
    if (seen) return;
    const raw = localStorage.getItem(SEEN_KEY);
    seen = new Set(JSON.parse(raw || '[]'));
    if (raw === null) {
        ownDecisions().forEach(l => seen.add(`${l.id}:${l.status}`));
        saveSeen();
    }
}
const saveSeen = () => localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)));
const ownDecisions = () => state.leave.filter(l => (l.status === 'approved' || l.status === 'rejected') &&
    (l.employeeId === state.currentUser.employeeId));

function buildItems() {
    const items = [];
    const u = state.currentUser;

    (state.chatUnread || []).forEach(c => items.push({
        type: 'chat', icon: 'fa-comment', title: `Message from ${c.title}`, text: c.text, ts: c.ts,
        go: () => { bus.emit('chat:open', c.id); showSection('messages'); }
    }));

    (state.noticeUnread || []).forEach(n => items.push({
        type: 'notice', icon: 'fa-bullhorn', title: `Notice: ${n.title}`, text: n.byName ? `from ${n.byName}` : '', ts: n.ts,
        go: () => showSection('notices')
    }));

    (state.noteAlertDates || []).forEach(d => items.push({
        type: 'note', icon: 'fa-note-sticky', title: 'Management left a note on your day', text: d,
        ts: (state.noteAlertTimes && state.noteAlertTimes[d]) || Date.parse(d + 'T12:00:00Z'),
        go: () => { bus.emit('myday:open', d); showSection('myday'); }
    }));

    if (isManager()) {
        Object.entries(state.replyAlertMap || {}).forEach(([date, map]) => {
            Object.entries(map || {}).forEach(([eid, ts]) => {
                if (!isAdmin() && !myGroupMember(eid)) return;
                items.push({
                    type: 'reply', icon: 'fa-reply', title: `${nameOf(eid)} replied to your note`, text: date, ts: Number(ts) || 0,
                    go: () => { bus.emit('attendance:open', { date, eid }); showSection('attendance'); }
                });
            });
        });

        state.leave.filter(l => l.status === 'pending').forEach(l => {
            const decidable = isAdmin() || (isLeader() && l.employeeId !== u.employeeId && inMyGroups(l.employeeId));
            if (!decidable) return;
            items.push({
                type: 'leave', icon: 'fa-plane-departure', title: `${l.employee} requested leave`,
                text: `${l.days} day(s) · ${l.type} · ${l.fromDate}`, ts: Date.parse((l.fromDate || '') + 'T12:00:00Z') || 0,
                go: () => showSection('leave')
            });
        });
    }

    if (dataReady) {
        ensureSeen();
        ownDecisions().filter(l => !seen.has(`${l.id}:${l.status}`)).forEach(l => items.push({
            type: 'leave', icon: l.status === 'approved' ? 'fa-circle-check' : 'fa-circle-xmark',
            title: `Your ${l.type} leave was ${l.status}`, text: `${l.days} day(s) from ${l.fromDate}`,
            ts: Date.parse((l.fromDate || '') + 'T12:00:00Z') || 0,
            go: () => { ownDecisions().forEach(x => seen.add(`${x.id}:${x.status}`)); saveSeen(); showSection('leave'); refresh(); }
        }));
    }

    return items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function render() {
    panel.innerHTML = `<div class="notif-head"><strong>Notifications</strong><span>${current.length} new</span></div>` +
        (current.length ? current.map((it, i) => `
            <div class="notif-item" data-i="${i}">
                <div class="notif-ico ${it.type}"><i class="fas ${it.icon}"></i></div>
                <div class="notif-main"><strong>${esc(it.title)}</strong><span>${esc(it.text)}</span></div>
                <small>${it.ts ? ago(it.ts) : ''}</small>
            </div>`).join('') : '<div class="notif-empty"><i class="fas fa-circle-check"></i><br>You are all caught up</div>');
}

function position() {
    const header = document.querySelector('.header');
    panel.style.top = ((header ? header.getBoundingClientRect().bottom : 70) + 6) + 'px';
}

function refresh() {
    current = buildItems();
    lastCount = current.length;
    const el = $('notifCount');
    if (el) {
        if (el.textContent !== String(lastCount)) el.textContent = lastCount;
        el.style.display = lastCount ? '' : 'none';
    }
    if (isOpen) render();
}

function close() { isOpen = false; panel.style.display = 'none'; }

export function initNotifications() {
    panel = document.createElement('div');
    panel.id = 'notifPanel';
    panel.className = 'notif-panel';
    document.body.appendChild(panel);

    on('notifications', 'click', e => {
        e.stopPropagation();
        if (isOpen) { close(); return; }
        refresh();
        isOpen = true;
        render();
        position();
        panel.style.display = 'block';
    });
    panel.addEventListener('click', e => {
        const item = e.target.closest('.notif-item');
        if (!item) return;
        const it = current[Number(item.dataset.i)];
        close();
        if (it) it.go();
    });
    document.addEventListener('click', e => { if (isOpen && !e.target.closest('#notifPanel')) close(); });
    window.addEventListener('resize', () => { if (isOpen) position(); });

    // Other modules also write the bell number directly: keep it equal to this list's count
    const el = $('notifCount');
    if (el) new MutationObserver(() => { if (el.textContent !== String(lastCount)) refresh(); })
        .observe(el, { childList: true, characterData: true, subtree: true });

    bus.on('data:changed', () => { dataReady = true; refresh(); });
    ['alerts:changed', 'schedule:loaded', 'section'].forEach(evt => bus.on(evt, refresh));
    refresh();
}
