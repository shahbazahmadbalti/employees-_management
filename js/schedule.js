import {
    db, ref, get, update, onValue, serverTimestamp, GOOGLE_SCRIPT_URL, MONTHS,
    state, bus, $, on, esc, sameName, profileKey, isAdmin, isManager, todayStr, addDays,
    fullNameOf, fmtDateTime, showToast, auditLog
} from './core.js';

const CHECK_EVERY_MS = 10 * 60 * 1000;

const S = {
    raw: {},
    locations: {},
    meta: null,
    subscribed: false,
    ready: false,
    fallbackDone: false,
    syncing: false,
    syncStarted: false,
    warnedUnmatched: false
};

// ==================== Public helpers ====================

export function shiftFor(name, dateStr) {
    const key = Object.keys(state.schedule || {}).find(k => sameName(k, name));
    if (!key) return '';

    const [year, month, day] = dateStr.split('-');
    const monthKey = MONTHS[Number(month) - 1];
    const area = state.schedule[key]?.[year]?.[monthKey]?.[Number(day)]?.area;

    return area ? String(area).trim() : '';
}

export function groupFor(name) {
    const fromDirectory = Object.values(state.directory || {})
        .find(person => sameName(person.name, name));

    if (fromDirectory?.group) {
        return String(fromDirectory.group).split(',')[0].trim() || 'General';
    }

    const key = Object.keys(state.employeeLocations || {})
        .find(locationName => sameName(locationName, name));

    let location = key ? state.employeeLocations[key] : null;

    if (!location) {
        location = state.profiles.find(profile => profile.id === profileKey(name))?.location;
    }

    return String([].concat(location || [])[0] || 'General')
        .split(',')[0]
        .trim() || 'General';
}

// ==================== Shift and group styles ====================

function shiftStyle(value) {
    const label = String(value || '').trim();
    const shift = label.toUpperCase();

    /* Personal holiday / annual leave: green */
    if (
        shift.includes('P.HOLIDAY') ||
        shift.includes('PERSONAL HOLIDAY') ||
        shift.includes('ANNUAL LEAVE') ||
        shift.includes('HOLIDAY') ||
        shift.includes('AWAY') ||
        shift.includes('LEAVE')
    ) {
        return {
            bg: '#dcfce7',
            fg: '#166534',
            border: '#86efac',
            type: 'holiday'
        };
    }

    /* Sick leave: red */
    if (shift.includes('SICK')) {
        return {
            bg: '#fee2e2',
            fg: '#991b1b',
            border: '#fca5a5',
            type: 'sick'
        };
    }

    /* Non-working day */
    if (shift === 'OFF' || shift === 'REST' || shift === 'R') {
        return {
            bg: '#f1f5f9',
            fg: '#64748b',
            border: '#cbd5e1',
            type: 'off'
        };
    }

    /* Night shift: dark */
    if (
        shift === 'N' ||
        shift.includes('(N)') ||
        shift.includes('NIGHT') ||
        /\bN\b/.test(shift)
    ) {
        return {
            bg: '#312e81',
            fg: '#eef2ff',
            border: '#4338ca',
            type: 'night'
        };
    }

    /* Day shift: light */
    if (
        shift === 'D' ||
        shift.includes('(D)') ||
        shift.includes('DAY') ||
        /\bD\b/.test(shift)
    ) {
        return {
            bg: '#fef3c7',
            fg: '#92400e',
            border: '#fde68a',
            type: 'day'
        };
    }

    /* Working-area / operational shift colours */
    if (shift.includes('FA')) {
        return {
            bg: '#dbeafe',
            fg: '#1e40af',
            border: '#93c5fd',
            type: 'fa'
        };
    }

    if (shift.includes('P2') || shift.includes('P1')) {
        return {
            bg: '#d1fae5',
            fg: '#065f46',
            border: '#6ee7b7',
            type: 'p2'
        };
    }

    if (shift.includes('AD') || shift.includes('SUP')) {
        return {
            bg: '#ffedd5',
            fg: '#9a3412',
            border: '#fdba74',
            type: 'support'
        };
    }

    return {
        bg: '#e0e7ff',
        fg: '#3730a3',
        border: '#a5b4fc',
        type: 'other'
    };
}

function groupColour(groupName) {
    const group = String(groupName || 'General').trim().toUpperCase();

    const known = {
        SK: {
            bg: '#dbeafe',
            fg: '#1e3a8a',
            border: '#60a5fa',
            accent: '#2563eb'
        },
        SDI: {
            bg: '#ede9fe',
            fg: '#5b21b6',
            border: '#a78bfa',
            accent: '#7c3aed'
        },
        FA: {
            bg: '#ffedd5',
            fg: '#9a3412',
            border: '#fb923c',
            accent: '#ea580c'
        },
        AD: {
            bg: '#ccfbf1',
            fg: '#115e59',
            border: '#2dd4bf',
            accent: '#0d9488'
        },
        P2: {
            bg: '#dcfce7',
            fg: '#166534',
            border: '#4ade80',
            accent: '#16a34a'
        },
        P1: {
            bg: '#ecfccb',
            fg: '#3f6212',
            border: '#a3e635',
            accent: '#65a30d'
        },
        MCS: {
            bg: '#fce7f3',
            fg: '#9d174d',
            border: '#f472b6',
            accent: '#db2777'
        },
        GENERAL: {
            bg: '#f1f5f9',
            fg: '#334155',
            border: '#94a3b8',
            accent: '#64748b'
        }
    };

    if (known[group]) return known[group];

    /* Stable generated colour for every future group */
    let hash = 0;

    for (let i = 0; i < group.length; i++) {
        hash = group.charCodeAt(i) + ((hash << 5) - hash);
        hash |= 0;
    }

    const hue = Math.abs(hash) % 360;

    return {
        bg: `hsl(${hue}, 80%, 93%)`,
        fg: `hsl(${hue}, 65%, 27%)`,
        border: `hsl(${hue}, 70%, 65%)`,
        accent: `hsl(${hue}, 70%, 45%)`
    };
}

function employeeGroup(name) {
    const locations = [].concat(state.employeeLocations?.[name] || []);
    const rawGroup = locations[0] || groupFor(name) || 'General';

    return String(rawGroup).split(',')[0].trim() || 'General';
}

// ==================== Sync helpers ====================

const fetchSheet = async () => {
    const response = await fetch(GOOGLE_SCRIPT_URL);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
};

const stable = value => {
    if (Array.isArray(value)) {
        return `[${value.map(stable).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map(key => `${JSON.stringify(key)}:${stable(value[key])}`)
            .join(',')}}`;
    }

    return JSON.stringify(value === undefined ? null : value);
};

async function sha256(text) {
    const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(text)
    );

    return [...new Uint8Array(hashBuffer)]
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

const pidCache = {};

async function pidOf(employeeId) {
    if (pidCache[employeeId]) return pidCache[employeeId];

    const result = (await sha256(String(employeeId))).slice(0, 16);
    pidCache[employeeId] = result;

    return result;
}

const normTime = value => {
    const match = String(value ?? '').match(/(\d{1,2}):(\d{2})/);

    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
};

function pickTime(entry, keys) {
    for (const key of keys) {
        const time = normTime(entry?.[key]);

        if (time) return time;
    }

    return null;
}

function isWorkingLabel(label) {
    const shift = String(label || '').toUpperCase().trim();

    return !!shift &&
        shift !== 'OFF' &&
        !/AWAY|SICK|HOLIDAY|LEAVE/.test(shift);
}

function setStatus(text) {
    const element = $('scheduleStatus');

    if (element) element.textContent = text;
}

function updateStatus() {
    if (S.syncing) return;

    if (S.meta?.updatedAt) {
        const unmatched = (S.meta.unmatched || []).length;
        setStatus(
            `Synced ${fmtDateTime(S.meta.updatedAt)}${
                isAdmin() && unmatched ? ` · ${unmatched} name(s) not matched` : ''
            }`
        );
    } else {
        setStatus('');
    }
}

const nameOfEid = employeeId =>
    state.directory?.[employeeId]?.name ||
    fullNameOf(state.employees.find(employee => employee.employeeId === employeeId) || {}) ||
    (employeeId === state.currentUser.employeeId ? state.currentUser.name : employeeId);

// ==================== Firebase schedule to state ====================

function applySchedule() {
    const schedule = {};
    const names = [];
    const locations = {};

    Object.entries(S.raw).forEach(([employeeId, data]) => {
        if (!data) return;

        const name = nameOfEid(employeeId);
        schedule[name] = data;
        names.push(name);

        if (S.locations[employeeId]) {
            locations[name] = S.locations[employeeId];
        }
    });

    state.schedule = schedule;
    state.masterEmployees = names;
    state.employeeLocations = locations;

    populateScheduleFilters();
    renderSchedule();
    bus.emit('schedule:loaded');
}

async function fallbackFromSheet() {
    if (S.fallbackDone) return;

    S.fallbackDone = true;

    try {
        const data = await fetchSheet();

        state.schedule = data.schedule || {};
        state.masterEmployees = data.employees || [];
        state.employeeLocations = data.employeeLocations || {};

        populateScheduleFilters();
        renderSchedule();
        bus.emit('schedule:loaded');

        setStatus('Loaded from Google Sheets (not synced to Firebase yet)');
    } catch (error) {
        console.error('Failed to fetch schedule', error);

        const loading = $('scheduleLoading');
        loading.style.display = 'block';
        loading.textContent = 'Failed to load the schedule. Reload the page to retry.';
    }
}

function subscribe() {
    if (S.subscribed) return;

    S.subscribed = true;

    const employeeId = state.currentUser.employeeId;
    const manager = isManager();
    const ready = { meta: false, data: false };

    const maybeApply = () => {
        if (!ready.meta || !ready.data) return;

        S.ready = true;

        if (S.meta || Object.keys(S.raw).length) {
            applySchedule();
        } else {
            fallbackFromSheet();
        }
    };

    onValue(
        ref(db, 'scheduleData/meta'),
        snapshot => {
            S.meta = snapshot.val();
            ready.meta = true;
            updateStatus();
            maybeApply();
        },
        error => {
            console.warn('schedule meta', error);
            ready.meta = true;
            maybeApply();
        }
    );

    onValue(
        ref(
            db,
            manager
                ? 'scheduleData/schedule'
                : `scheduleData/schedule/${employeeId}`
        ),
        snapshot => {
            const data = snapshot.val();

            S.raw = manager
                ? (data || {})
                : (data ? { [employeeId]: data } : {});

            ready.data = true;
            maybeApply();
        },
        error => {
            console.warn('schedule read', error);
            ready.data = true;
            maybeApply();
        }
    );

    if (manager) {
        onValue(
            ref(db, 'scheduleData/locations'),
            snapshot => {
                S.locations = snapshot.val() || {};

                if (S.ready) applySchedule();
            },
            error => console.warn('schedule locations', error)
        );
    }
}

// ==================== Convert Google Sheets schedule ====================

function mapSheet(sheet) {
    const sheetSchedule = sheet.schedule || {};
    const sheetLocations = sheet.employeeLocations || {};

    const byEmployeeId = {};
    const locations = {};
    const unmatched = [];

    Object.keys(sheetSchedule).forEach(name => {
        const employee = state.employees.find(item => sameName(fullNameOf(item), name));

        if (!employee?.employeeId) {
            unmatched.push(name);
            return;
        }

        byEmployeeId[employee.employeeId] = JSON.parse(
            JSON.stringify(sheetSchedule[name])
        );

        const location = [].concat(sheetLocations[name] || []).join(', ');

        if (location) {
            locations[employee.employeeId] = location;
        }
    });

    return { byEmployeeId, locations, unmatched };
}

// ==================== Public login roster ====================

async function syncPublicRoster(byEmployeeId, locations) {
    const today = todayStr();
    const dates = [
        addDays(today, -1),
        today,
        addDays(today, 1)
    ];

    const roster = {};

    for (const date of dates) {
        const [year, month, day] = date.split('-');
        const monthKey = MONTHS[Number(month) - 1];
        const dayRoster = {};

        for (const [employeeId, employeeSchedule] of Object.entries(byEmployeeId)) {
            const entry = employeeSchedule?.[year]?.[monthKey]?.[Number(day)];
            const area = entry?.area ? String(entry.area).trim() : '';

            if (!isWorkingLabel(area)) continue;

            const location = String(
                locations[employeeId] ||
                state.directory?.[employeeId]?.group ||
                'General'
            )
                .split(',')[0]
                .trim();

            dayRoster[await pidOf(employeeId)] = {
                a: area,
                g: location || 'General',
                s: pickTime(entry, ['start', 'in', 'checkIn', 'from', 'begin']),
                e: pickTime(entry, ['end', 'out', 'checkOut', 'to', 'finish'])
            };
        }

        if (Object.keys(dayRoster).length) {
            roster[date] = dayRoster;
        }
    }

    const hash = await sha256(stable({ dates, roster }));
    const oldHash = (await get(ref(db, 'publicRosterMeta/hash'))).val();

    if (oldHash === hash) return false;

    await update(ref(db), {
        publicRoster: Object.keys(roster).length
            ? JSON.parse(JSON.stringify(roster))
            : null,
        publicRosterMeta: {
            hash,
            dates,
            updatedAt: serverTimestamp()
        }
    });

    return true;
}

// ==================== Admin sync ====================

export async function syncFromSheet({ silent = false } = {}) {
    if (!isAdmin() || S.syncing) return;

    S.syncing = true;

    if (!silent) {
        setStatus('Checking the Google Sheet...');
    }

    try {
        const sheet = await fetchSheet();
        const { byEmployeeId, locations, unmatched } = mapSheet(sheet);

        if (!Object.keys(byEmployeeId).length) {
            throw new Error('The sheet returned no schedule rows that match your employees.');
        }

        const hash = await sha256(stable({ byEmployeeId, locations }));

        if (unmatched.length && (!silent || !S.warnedUnmatched)) {
            S.warnedUnmatched = true;

            showToast(
                `Not matched to an employee: ${unmatched.slice(0, 5).join(', ')}${
                    unmatched.length > 5 ? '...' : ''
                }`,
                'info'
            );
        }

        const remoteHash = (await get(ref(db, 'scheduleData/meta/hash'))).val();
        const scheduleChanged = remoteHash !== hash;

        if (scheduleChanged) {
            const rowHashes = (await get(ref(db, 'scheduleData/hashes'))).val() || {};
            const changes = {};
            let changedPeople = 0;

            for (const [employeeId, data] of Object.entries(byEmployeeId)) {
                const rowHash = await sha256(stable(data));

                if (rowHashes[employeeId] !== rowHash) {
                    changes[`schedule/${employeeId}`] = data;
                    changes[`hashes/${employeeId}`] = rowHash;
                    changedPeople++;
                }

                changes[`locations/${employeeId}`] = locations[employeeId] || null;
            }

            Object.keys(rowHashes).forEach(employeeId => {
                if (!byEmployeeId[employeeId]) {
                    changes[`schedule/${employeeId}`] = null;
                    changes[`hashes/${employeeId}`] = null;
                    changes[`locations/${employeeId}`] = null;
                    changedPeople++;
                }
            });

            changes.meta = {
                hash,
                updatedAt: serverTimestamp(),
                updatedBy: state.currentUser.name,
                source: 'browser',
                employees: Object.keys(byEmployeeId).length,
                changed: changedPeople,
                unmatched
            };

            await update(ref(db, 'scheduleData'), changes);

            showToast(
                `Schedule updated from Google Sheets (${changedPeople} ${
                    changedPeople === 1 ? 'person' : 'people'
                } changed)`,
                'success'
            );

            auditLog(
                'Schedule synced',
                `${changedPeople} changed, ${Object.keys(byEmployeeId).length} employees`
            );
        }

        const rosterChanged = await syncPublicRoster(byEmployeeId, locations);

        if (!scheduleChanged && !silent) {
            showToast(
                rosterChanged
                    ? 'Login roster refreshed'
                    : 'Schedule is already up to date',
                'success'
            );
        }
    } catch (error) {
        console.error('Schedule sync failed', error);

        if (!silent) {
            showToast(`Schedule sync failed: ${error.message}`, 'error');
        }
    } finally {
        S.syncing = false;
        updateStatus();
    }
}

// ==================== Start schedule loading ====================

export function fetchSchedule() {
    subscribe();

    if (isAdmin() && !S.syncStarted) {
        S.syncStarted = true;

        setTimeout(() => {
            syncFromSheet({ silent: true });
        }, 2500);

        setInterval(() => {
            if (!document.hidden) {
                syncFromSheet({ silent: true });
            }
        }, CHECK_EVERY_MS);
    }
}

// ==================== Schedule page controls ====================

function populateScheduleFilters() {
    const locationSelect = $('schedLocation');
    const employeeSelect = $('schedEmployee');

    const oldLocation = locationSelect.value || 'All';
    const oldEmployee = employeeSelect.value || 'All';

    const locations = [
        ...new Set(
            Object.values(state.employeeLocations || {})
                .flat()
                .filter(Boolean)
        )
    ].sort();

    let names = (state.masterEmployees || []).filter(Boolean);

    if (!names.length) {
        names = Object.keys(state.schedule || {});
    }

    names = [...new Set(names)].sort();

    if (!isManager()) {
        names = names.filter(name => sameName(name, state.currentUser.name));
    }

    locationSelect.innerHTML =
        '<option value="All">All</option>' +
        locations.map(location => `<option value="${esc(location)}">${esc(location)}</option>`).join('');

    employeeSelect.innerHTML =
        '<option value="All">All</option>' +
        names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');

    locationSelect.value = locations.includes(oldLocation) ? oldLocation : 'All';
    employeeSelect.value = names.includes(oldEmployee) ? oldEmployee : 'All';
}

export function renderSchedule() {
    $('scheduleLoading').style.display = 'none';
    $('scheduleTable').style.display = 'table';

    const tbody = $('scheduleBody');
    const headerRow = $('scheduleHead').querySelector('tr');

    const selectedMonth = $('schedMonth').value;
    const selectedYear = $('schedYear').value;
    const selectedLocation = $('schedLocation').value;
    const selectedEmployee = $('schedEmployee').value;

    const daysInMonth = new Date(
        Number(selectedYear),
        MONTHS.indexOf(selectedMonth) + 1,
        0
    ).getDate();

    let headers = `
        <th class="schedule-name-head"
            style="position:sticky;left:0;background:#f8fafc;z-index:4;width:170px;min-width:170px;text-align:left;">
            EMPLOYEE NAME
        </th>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const jsDate = new Date(
            Number(selectedYear),
            MONTHS.indexOf(selectedMonth),
            day
        );

        const isWeekend = jsDate.getDay() === 0 || jsDate.getDay() === 6;

        headers += `
            <th class="${isWeekend ? 'schedule-weekend' : ''}"
                style="text-align:center;min-width:48px;">
                ${day}
            </th>`;
    }

    headers += `
        <th class="schedule-total-head"
            style="position:sticky;right:0;background:#f8fafc;z-index:4;text-align:center;width:84px;min-width:84px;">
            HOURS
        </th>`;

    headerRow.innerHTML = headers;

    let names = Object.keys(state.schedule || {});

    if (!isManager()) {
        names = names.filter(name => sameName(name, state.currentUser.name));
    }

    if (selectedEmployee !== 'All') {
        names = names.filter(name => name === selectedEmployee);
    }

    if (selectedLocation !== 'All') {
        names = names.filter(name =>
            [].concat(state.employeeLocations?.[name] || []).includes(selectedLocation)
        );
    }

    names.sort((a, b) => a.localeCompare(b));

    if (!names.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${daysInMonth + 2}" style="text-align:center;padding:24px;">
                    No schedule data available for the selected filters.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = names.map(name => {
        let totalHours = 0;
        let cells = '';

        const group = employeeGroup(name);
        const groupStyle = groupColour(group);

        const employeeSchedule =
            state.schedule[name]?.[selectedYear]?.[selectedMonth] || {};

        for (let day = 1; day <= daysInMonth; day++) {
            const dayData = employeeSchedule[day];
            const label = dayData?.area ? String(dayData.area).trim() : '';

            if (label) {
                const colour = shiftStyle(label);
                const hours = Number(dayData.hours);

                if (!Number.isNaN(hours) && hours > 0) {
                    totalHours += hours;
                } else if (!['holiday', 'sick', 'off'].includes(colour.type)) {
                    totalHours += 8;
                }

                cells += `
                    <td class="schedule-day-cell">
                        <div
                            class="shift-pill shift-${colour.type}"
                            title="${esc(label)}"
                            style="background:${colour.bg};color:${colour.fg};border-color:${colour.border};">
                            ${esc(label)}
                        </div>
                    </td>`;
            } else {
                cells += '<td class="schedule-day-cell schedule-empty-cell"></td>';
            }
        }

        return `
            <tr class="schedule-group-row" style="--group-accent:${groupStyle.accent};">
                <td class="schedule-name-cell"
                    style="
                        position:sticky;
                        left:0;
                        background:${groupStyle.bg};
                        color:${groupStyle.fg};
                        border-left:5px solid ${groupStyle.accent};
                        z-index:3;
                        font-weight:700;
                        text-transform:uppercase;
                        width:170px;
                        min-width:170px;">
                    <span class="schedule-employee-name">${esc(name)}</span>
                    <small class="schedule-group-tag"
                        style="
                            background:${groupStyle.bg};
                            color:${groupStyle.fg};
                            border-color:${groupStyle.border};">
                        ${esc(group)}
                    </small>
                </td>
                ${cells}
                <td class="schedule-total-cell"
                    style="
                        position:sticky;
                        right:0;
                        background:white;
                        z-index:3;
                        text-align:center;
                        font-weight:800;
                        width:84px;
                        min-width:84px;">
                    ${totalHours || '-'}
                </td>
            </tr>`;
    }).join('');
}

export function initSchedule() {
    const [, month] = todayStr().split('-');

    $('schedMonth').value = MONTHS[Number(month) - 1];
    $('schedYear').value = todayStr().slice(0, 4);

    const syncButton = $('refreshScheduleBtn');

    if (syncButton) {
        const status = document.createElement('span');

        status.id = 'scheduleStatus';
        status.style.cssText = 'font-size:12px; opacity:.8; margin-left:auto;';

        syncButton.before(status);
        syncButton.style.marginLeft = '0';

        if (isAdmin()) {
            syncButton.innerHTML = '<i class="fas fa-sync"></i> Sync now';
            syncButton.addEventListener('click', () => syncFromSheet({ silent: false }));
        } else {
            syncButton.style.display = 'none';
        }
    }

    ['schedMonth', 'schedYear', 'schedLocation', 'schedEmployee']
        .forEach(id => on(id, 'change', renderSchedule));

    bus.on('data:changed', () => {
        if (S.ready) applySchedule();
    });
}
