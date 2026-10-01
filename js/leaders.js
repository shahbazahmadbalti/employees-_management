import { db, ref, onValue, state, bus, $, isLeader } from './core.js';

export const features = ['leader'];

export async function init() {
    // Admin: show "Leader of groups" only while Role = Leader
    const roleSel = document.querySelector('#employeeForm select[name="role"]');
    const row = $('leaderGroupsRow');
    if (roleSel && row) {
        const sync = () => { row.style.display = roleSel.value === 'LEADER' ? '' : 'none'; };
        roleSel.addEventListener('change', sync);
        new MutationObserver(sync).observe($('employeeModal'), { attributes: true, attributeFilter: ['class'] });
        sync();
    }

    const me = state.currentUser.employeeId;
    if (!me) return {};

    // Everyone: keep the directory in state (leave.js and schedule.js read it)
    onValue(ref(db, 'directory'), snap => {
        const dir = snap.val() || {};
        state.directory = dir;
        if (!isLeader()) return;

        // Leaders only know the people of their groups (plus themselves)
        const mine = state.currentUser.leaderGroups;
        state.employees = Object.entries(dir)
            .filter(([eid, p]) => eid === me || (p.status !== 'inactive' && mine.includes(p.group)))
            .map(([eid, p]) => ({
                id: eid, employeeId: eid, firstName: p.name || eid, lastName: '',
                status: p.status || 'active', logType: p.logType || 'Logs', department: p.group || ''
            }));
        bus.emit('data:changed');
    }, err => console.warn('directory', err));

    // Leaders: bell = notes + notices + employee replies (core only counts notes for non-admins)
    if (isLeader()) {
        const refresh = () => {
            const el = $('notifCount'), a = state.alerts;
            if (!el) return;
            const n = a.notes + a.replies + (a.notices || 0);
            el.textContent = n;
            el.style.display = n ? '' : 'none';
        };
        bus.on('alerts:changed', refresh);
        bus.on('data:changed', refresh);
        bus.on('section', refresh);
    }
    return {};
}
