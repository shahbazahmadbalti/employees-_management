import {
    db, ref, get, update, onValue, serverTimestamp, GOOGLE_SCRIPT_URL, MONTHS,
    state, bus, $, on, esc, sameName, profileKey, isAdmin, isManager, todayStr, addDays, fullNameOf, fmtDateTime, showToast, auditLog
} from './core.js';

const COLORS = { FA: ['#bfdbfe', '#1e40af'], P2: ['#bbf7d0', '#166534'], AD: ['#fed7aa', '#9a3412'], DEFAULT: ['#c7d2fe', '#3730a3'] };
const CHECK_EVERY_MS = 10 * 60 * 1000;      // how often an open admin session checks the sheet
const START_KEYS = ['start', 'in', 'checkIn', 'from', 'begin'];
const END_KEYS = ['end', 'out', 'checkOut', 'to', 'finish'];

// Everything about the sync lives here
const S = { raw: {}, locations: {}, meta: null, subscribed: false, ready: false, fallbackDone: false, syncing: false, syncStarted: false, warnedUnmatched: false };

// ==================== Lookups used by other modules ====================
// Scheduled shift label for a person on a date (YYYY-MM-DD)
export function shiftFor(name, dateStr) {
    const key = Object.keys(state.schedule || {}).find(k => sameName(k, name));
    if (!key) return '';
    const [y, m, d] = dateStr.split('-');
    const area = state.schedule[key]?.[y]?.[MONTHS[Number(m) - 1]]?.[Number(d)]?.area;
    return area ? String(area).trim() : '';
}

// First group/segment of a person: directory first, then sheet location, then profile location
export function groupFor(name) {
    const entry = Object.values(state.directory || {}).find(p => sameName(p.name, name));
    if (entry && entry.group) return entry.group;
    const key = Object.keys(state.employeeLocations || {}).find(k => sameName(k, name));
    let loc = key ? state.employeeLocations[key] : null;
    if (!loc) loc = state.profiles.find(p => p.id === profileKey(name))?.location;
    return String([].concat(loc || [])[0] || 'General').split(',')[0].trim() || 'General';
}

// ==================== Small helpers ====================
const fetchSheet = async () => {
    const res = await fetch(GOOGLE_SCRIPT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
};

// Same text for the same data, whatever the key order
const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
    : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
    : JSON.stringify(v === undefined ? null : v);

async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const pidCache = {};
const pidOf = async eid => pidCache[eid] || (pidCache[eid] = (await sha256(String(eid))).slice(0, 16));

const normTime = v => { const m = String(v ?? '').match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };
const pickTime = (entry, keys) => { for (const k of keys) { const v = normTime(entry[k]); if (v) return v; } return null; };
const isWorkingLabel = s => { const u = String(s || '').toUpperCase().trim(); return !!u && u !== 'OFF' && !/AWAY|SICK|HOLIDAY|LEAVE/.test(u); };

const setStatus = text => { const el = $('scheduleStatus'); if (el) el.textContent = text; };
function updateStatus() {
    if (S.syncing) return;
    if (S.meta?.updatedAt) {
        const un = (S.meta.unmatched || []).length;
        setStatus(`Synced ${fmtDateTime(S.meta.updatedAt)}${isAdmin() && un ? ` · ${un} name(s) not matched` : ''}`);
    } else setStatus('');
}

const nameOfEid = eid =>
    state.directory?.[eid]?.name
    || fullNameOf(state.employees.find(e => e.employeeId === eid) || {})
    || (eid === state.currentUser.employeeId ? state.currentUser.name : eid);

// ==================== Firebase -> the app ====================
// state.schedule keeps its old shape: { <name>: { <year>: { <MON>: { <day>: {...} } } } }
function applySchedule() {
    const sched = {}, names = [], locs = {};
    Object.entries(S.raw).forEach(([eid, data]) => {
        if (!data) return;
        const name = nameOfEid(eid);
        sched[name] = data;
        names.push(name);
        if (S.locations[eid]) locs[name] = S.locations[eid];
    });
    state.schedule = sched;
    state.masterEmployees = names;
    state.employeeLocations = locs;
    populateScheduleFilters();
    renderSchedule();
    bus.emit('schedule:loaded');
}

// Used only until the first sync has put the schedule into Firebase
async function fallbackFromSheet() {
    if (S.fallbackDone) return;
    S.fallbackDone = true;
    try {
        const d = await fetchSheet();
        state.schedule = d.schedule || {};
        state.masterEmployees = d.employees || [];
        state.employeeLocations = d.employeeLocations || {};
        populateScheduleFilters();
        renderSchedule();
        bus.emit('schedule:loaded');
        setStatus('Loaded from Google Sheets (not synced to Firebase yet)');
    } catch (err) {
        console.error('Failed to fetch schedule', err);
        const loading = $('scheduleLoading');
        loading.style.display = 'block';
        loading.textContent = 'Failed to load the schedule. Reload the page to retry.';
    }
}

function subscribe() {
    if (S.subscribed) return;
    S.subscribed = true;
    const me = state.currentUser.employeeId, manager = isManager();
    const got = { meta: false, data: false };
    const maybeApply = () => {
        if (!(got.meta && got.data)) return;
        S.ready = true;
        if (S.meta || Object.keys(S.raw).length) applySchedule(); else fallbackFromSheet();
    };

    onValue(ref(db, 'scheduleData/meta'), snap => { S.meta = snap.val(); got.meta = true; updateStatus(); maybeApply(); },
        err => { console.warn('schedule meta', err); got.meta = true; maybeApply(); });

    // Managers get every row; everyone else just their own
    onValue(ref(db, manager ? 'scheduleData/schedule' : `scheduleData/schedule/${me}`), snap => {
        const v = snap.val();
        S.raw = manager ? (v || {}) : (v ? { [me]: v } : {});
        got.data = true; maybeApply();
    }, err => { console.warn('schedule read', err); got.data = true; maybeApply(); });

    if (manager) {
        onValue(ref(db, 'scheduleData/locations'), snap => { S.locations = snap.val() || {}; if (S.ready) applySchedule(); },
            err => console.warn('schedule locations', err));
    }
}

// ==================== Google Sheet -> Firebase (admins) ====================
function mapSheet(sheet) {
    const schedule = sheet.schedule || {}, locs = sheet.employeeLocations || {};
    const byEid = {}, locations = {}, unmatched = [];
    Object.keys(schedule).forEach(name => {
        const emp = state.employees.find(e => sameName(fullNameOf(e), name));
        if (!emp || !emp.employeeId) { unmatched.push(name); return; }
        byEid[emp.employeeId] = JSON.parse(JSON.stringify(schedule[name]));
        const loc = [].concat(locs[name] || []).join(', ');
        if (loc) locations[emp.employeeId] = loc;
    });
    return { byEid, locations, unmatched };
}

// The public roster for the login page: yesterday, today and tomorrow, no names.
// Rewritten only when its content (or the date window) changes.
async function syncRoster(byEid, locations) {
    const today = todayStr();
    const dates = [addDays(today, -1), today, addDays(today, 1)];
    const roster = {};
    for (const date of dates) {
        const [y, m, d] = date.split('-');
        const day = {};
        for (const [eid, data] of Object.entries(byEid)) {
            const entry = data?.[y]?.[MONTHS[Number(m) - 1]]?.[Number(d)];
            const area = entry && entry.area ? String(entry.area).trim() : '';
            if (!isWorkingLabel(area)) continue;
            const group = String(locations[eid] || '').split(',')[0].trim() || state.directory?.[eid]?.group || 'General';
            day[await pidOf(eid)] = { a: area, g: group, s: pickTime(entry, START_KEYS), e: pickTime(entry, END_KEYS) };
        }
        if (Object.keys(day).length) roster[date] = day;
    }
    const hash = await sha256(stable({ dates, roster }));
    if ((await get(ref(db, 'publicRosterMeta/hash'))).val() === hash) return false;
    await update(ref(db), {
        publicRoster: Object.keys(roster).length ? JSON.parse(JSON.stringify(roster)) : null,
        publicRosterMeta: { hash, dates, updatedAt: serverTimestamp() }
    });
    return true;
}

export async function syncFromSheet({ silent = false } = {}) {
    if (!isAdmin() || S.syncing) return;
    S.syncing = true;
    if (!silent) setStatus('Checking the Google Sheet...');
    try {
        const { byEid, locations, unmatched } = mapSheet(await fetchSheet());
        if (!Object.keys(byEid).length) throw new Error('The sheet returned no schedule rows that match your employees.');
        const hash = await sha256(stable({ byEid, locations }));

        if (unmatched.length && (!silent || !S.warnedUnmatched)) {
            S.warnedUnmatched = true;
            showToast(`Not matched to an employee: ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? '...' : ''}`, 'info');
        }

        const remoteHash = (await get(ref(db, 'scheduleData/meta/hash'))).val();
        const scheduleChanged = remoteHash !== hash;

        if (scheduleChanged) {
            // Write only the people whose rows changed, in one atomic update
            const hashes = (await get(ref(db, 'scheduleData/hashes'))).val() || {};
            const updates = {};
            let changed = 0;
            for (const [eid, data] of Object.entries(byEid)) {
                const h = await sha256(stable(data));
                if (hashes[eid] !== h) { updates[`schedule/${eid}`] = data; updates[`hashes/${eid}`] = h; changed++; }
                updates[`locations/${eid}`] = locations[eid] || null;
            }
            Object.keys(hashes).forEach(eid => {
                if (!byEid[eid]) { updates[`schedule/${eid}`] = null; updates[`hashes/${eid}`] = null; updates[`locations/${eid}`] = null; changed++; }
            });
            updates.meta = {
                hash, updatedAt: serverTimestamp(), updatedBy: state.currentUser.name, source: 'browser',
                employees: Object.keys(byEid).length, changed, unmatched
            };
            await update(ref(db, 'scheduleData'), updates);
            showToast(`Schedule updated from Google Sheets (${changed} ${changed === 1 ? 'person' : 'people'} changed)`, 'success');
            auditLog('Schedule synced', `${changed} changed, ${Object.keys(byEid).length} employees`);
        }

        // The login-page roster has its own check (it also changes when the day changes)
        const rosterChanged = await syncRoster(byEid, locations);
        if (!scheduleChanged && !silent) showToast(rosterChanged ? 'Login roster refreshed' : 'Schedule is already up to date', 'success');
    } catch (err) {
        console.error('Schedule sync failed', err);
        if (!silent) showToast('Schedule sync failed: ' + err.message, 'error');
    } finally {
        S.syncing = false;
        updateStatus();
    }
}

// Called by main.js after the data has loaded
export function fetchSchedule() {
    subscribe();
    if (isAdmin() && !S.syncStarted) {
        S.syncStarted = true;
        setTimeout(() => syncFromSheet({ silent: true }), 2500);
        setInterval(() => { if (!document.hidden) syncFromSheet({ silent: true }); }, CHECK_EVERY_MS);
    }
}

// ==================== Schedule page ====================
function populateScheduleFilters() {
    const locSel = $('schedLocation'), empSel = $('schedEmployee');
    const prevLoc = locSel.value || 'All', prevEmp = empSel.value || 'All';
    const locations = [...new Set(Object.values(state.employeeLocations || {}).flat().filter(Boolean))].sort();
    let names = (state.masterEmployees || []).filter(Boolean);
    if (!names.length) names = Object.keys(state.schedule);
    names = [...new Set(names)].sort();
    if (!isManager()) names = names.filter(n => sameName(n, state.currentUser.name));
    locSel.innerHTML = '<option value="All">All</option>' + locations.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    empSel.innerHTML = '<option value="All">All</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    locSel.value = locations.includes(prevLoc) ? prevLoc : 'All';
    empSel.value = names.includes(prevEmp) ? prevEmp : 'All';
}

export function renderSchedule() {
    $('scheduleLoading').style.display = 'none';
    $('scheduleTable').style.display = 'table';
    const tbody = $('scheduleBody'), theadRow = $('scheduleHead').querySelector('tr');
    const selMonth = $('schedMonth').value, selYear = $('schedYear').value;
    const selLoc = $('schedLocation').value, selEmp = $('schedEmployee').value;
    const days = new Date(Number(selYear), MONTHS.indexOf(selMonth) + 1, 0).getDate();

    let head = '<th style="position: sticky; left: 0; background: #f8fafc; z-index: 2; width: 150px; text-align: left;">EMPLOYEE NAME</th>';
    for (let i = 1; i <= days; i++) head += `<th style="text-align: center;">${i}</th>`;
    head += '<th style="text-align: center; width: 80px;">TOTAL HOURS</th>';
    theadRow.innerHTML = head;

    let names = Object.keys(state.schedule || {});
    if (!isManager()) names = names.filter(n => sameName(n, state.currentUser.name));
    if (selEmp !== 'All') names = names.filter(n => n === selEmp);
    if (selLoc !== 'All') names = names.filter(n => [].concat(state.employeeLocations?.[n] || []).includes(selLoc));
    names.sort((a, b) => a.localeCompare(b));

    if (!names.length) {
        tbody.innerHTML = `<tr><td colspan="${days + 2}" style="text-align: center; padding: 16px;">No schedule data available</td></tr>`;
        return;
    }

    tbody.innerHTML = names.map(name => {
        let total = 0, cells = '';
        const sched = state.schedule[name]?.[selYear]?.[selMonth] || {};
        for (let i = 1; i <= days; i++) {
            const d = sched[i];
            if (d && d.area) {
                const label = String(d.area);
                const [bg, fg] = label.includes('FA') ? COLORS.FA : label.includes('P2') ? COLORS.P2 : label.includes('AD') ? COLORS.AD : COLORS.DEFAULT;
                cells += `<td style="padding: 2px;"><div style="font-size: 10px; font-weight: bold; border-radius: 4px; padding: 4px; text-align: center; white-space: nowrap; background: ${bg}; color: ${fg};">${esc(label)}</div></td>`;
                total += Number(d.hours) > 0 ? Number(d.hours) : 8;
            } else cells += '<td></td>';
        }
        return `<tr>
            <td style="position: sticky; left: 0; background: white; z-index: 1; font-weight: 500; text-transform: uppercase;">${esc(name)}</td>
            ${cells}
            <td style="text-align: center; font-weight: bold;">${total || '-'}</td></tr>`;
    }).join('');
}

export function initSchedule() {
    const [, month] = todayStr().split('-');
    $('schedMonth').value = MONTHS[Number(month) - 1];
    $('schedYear').value = todayStr().slice(0, 4);

    // A small "last synced" line next to the button; the button becomes "Sync now" for admins, hidden for everyone else
    const btn = $('refreshScheduleBtn');
    if (btn) {
        const status = document.createElement('span');
        status.id = 'scheduleStatus';
        status.style.cssText = 'font-size:12px; opacity:.8; margin-left:auto;';
        btn.before(status);
        btn.style.marginLeft = '0';
        if (isAdmin()) {
            btn.innerHTML = '<i class="fas fa-sync"></i> Sync now';
            btn.addEventListener('click', () => syncFromSheet({ silent: false }));
        } else btn.style.display = 'none';
    }
    ['schedMonth', 'schedYear', 'schedLocation', 'schedEmployee'].forEach(id => on(id, 'change', renderSchedule));
    bus.on('data:changed', () => { if (S.ready) applySchedule(); });   // names may have arrived late (directory)
}
