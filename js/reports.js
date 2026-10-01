import { state, $, on, fullNameOf, todayStr, nowMs, WORK_TZ, showToast, formatCurrency, formatDate, enableFeature } from './core.js';
import { formatOf, workedMinutes, breakMinutes, logsInRange } from './attendance.js';

// ==================== Libraries (loaded the first time a report is made) ====================
const LIBS = [
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.3/dist/jspdf.plugin.autotable.min.js'
];
const FONT_URLS = {
    regular: 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf',
    bold: 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf'
};
const scriptPromises = {};
const loadScript = url => scriptPromises[url] || (scriptPromises[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + url));
    document.head.appendChild(s);
}));

const toBase64 = buf => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
};

let fontCache = null;           // null = not tried, false = unavailable
async function loadFonts() {
    if (fontCache !== null) return fontCache;
    try {
        const [regular, bold] = await Promise.all([FONT_URLS.regular, FONT_URLS.bold].map(async url => {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Font download failed');
            return toBase64(await res.arrayBuffer());
        }));
        fontCache = { regular, bold };
    } catch (err) {
        console.warn('Unicode font unavailable, using the built-in font', err);
        fontCache = false;
    }
    return fontCache;
}

let logoCache;
async function loadLogo() {
    if (logoCache !== undefined) return logoCache;
    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i); i.onerror = reject; i.src = 'logo.png';
        });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        logoCache = { data: c.toDataURL('image/png'), ratio: img.naturalWidth / img.naturalHeight };
    } catch (err) { logoCache = null; }
    return logoCache;
}

// ==================== Helpers ====================
const companyName = () => {
    try { return (JSON.parse(localStorage.getItem('ems_settings') || '{}').companyName || '').trim() || 'Duna Networks KFT'; }
    catch (e) { return 'Duna Networks KFT'; }
};
const stamp = () => new Date(nowMs()).toLocaleString('en-GB', {
    timeZone: WORK_TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const FOLD = { 'ő': 'ö', 'Ő': 'Ö', 'ű': 'ü', 'Ű': 'Ü' };
const fold = s => String(s ?? '').replace(/[őŐűŰ]/g, c => FOLD[c]).replace(/[^\x00-\xFF]/g, '?');
const selectedMonth = () => $('reportMonth')?.value || todayStr().slice(0, 7);
const monthLabel = ym => new Date(ym + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const sum = (list, fn) => list.reduce((s, x) => s + (Number(fn(x)) || 0), 0);

// ==================== PDF drawing ====================
function drawHeader(doc, ctx, pageW) {
    doc.setFillColor(79, 70, 229); doc.rect(0, 0, pageW, 26, 'F');
    doc.setFillColor(251, 191, 36); doc.rect(0, 26, pageW, 1.2, 'F');
    let x = 12;
    if (ctx.logo) {
        const h = 13, w = Math.min(h * ctx.logo.ratio, 30);
        doc.setFillColor(255, 255, 255); doc.roundedRect(10, 5.5, w + 4, h + 3, 2, 2, 'F');
        doc.addImage(ctx.logo.data, 'PNG', 12, 7, w, h);
        x = 12 + w + 8;
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont(ctx.font, 'bold'); doc.setFontSize(15); doc.text(ctx.company, x, 12.5);
    doc.setFont(ctx.font, 'normal'); doc.setFontSize(10); doc.text(ctx.title, x, 19.5);
    doc.setFontSize(8.5);
    doc.text(ctx.generated, pageW - 12, 12, { align: 'right' });
    doc.text(ctx.period, pageW - 12, 18, { align: 'right' });
}

function drawSummary(doc, ctx, items, y, pageW) {
    const gap = 4, left = 12, w = (pageW - 24 - gap * (items.length - 1)) / items.length, h = 17;
    items.forEach((it, i) => {
        const x = left + i * (w + gap);
        doc.setFillColor(243, 244, 250); doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, y, w, h, 2, 2, 'FD');
        doc.setTextColor(107, 114, 128); doc.setFont(ctx.font, 'normal'); doc.setFontSize(7.5);
        doc.text(String(it.label).toUpperCase(), x + 3, y + 6);
        doc.setTextColor(31, 41, 55); doc.setFont(ctx.font, 'bold'); doc.setFontSize(12);
        doc.text(String(it.value), x + 3, y + 13.5);
    });
    return y + h + 6;
}

function drawFooters(doc, ctx, pageW, pageH) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240); doc.line(12, pageH - 12, pageW - 12, pageH - 12);
        doc.setFont(ctx.font, 'normal'); doc.setFontSize(7.5); doc.setTextColor(107, 114, 128);
        doc.text(`${ctx.company}  ·  Confidential  ·  Generated by ${ctx.user}`, 12, pageH - 7);
        doc.text(`Page ${i} of ${n}`, pageW - 12, pageH - 7, { align: 'right' });
    }
}

const STATUS_COLORS = [
    [['paid', 'approved', 'present', 'done', 'active'], [5, 150, 105]],
    [['pending', 'late'], [180, 83, 9]],
    [['rejected', 'absent', 'inactive'], [185, 28, 28]]
];

async function renderPdf(def) {
    await LIBS.reduce((p, url) => p.then(() => loadScript(url)), Promise.resolve());
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: def.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });

    const fonts = await loadFonts();
    let font = 'helvetica';
    if (fonts) {
        doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
        doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
        doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
        doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
        font = 'DejaVu';
    }
    const T = s => (fonts ? String(s ?? '') : fold(s));

    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    const ctx = {
        font, company: T(companyName()), title: T(def.title), logo: await loadLogo(),
        generated: `Generated ${stamp()}`, period: T(def.period), user: T(state.currentUser.name)
    };

    let y = 34;
    if (def.summary?.length) y = drawSummary(doc, ctx, def.summary.map(s => ({ label: T(s.label), value: T(s.value) })), y, pageW);

    const statusCols = new Set(def.columns.map((c, i) => (c.status ? i : -1)).filter(i => i >= 0));
    doc.autoTable({
        startY: y,
        head: [def.columns.map(c => T(c.header))],
        body: def.rows.map(r => r.map(T)),
        foot: def.foot ? [def.foot.map(T)] : undefined,
        showFoot: 'lastPage',
        margin: { top: 34, bottom: 18, left: 12, right: 12 },
        theme: 'grid',
        styles: { font, fontSize: 8, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.1, textColor: [31, 41, 55], overflow: 'linebreak' },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', halign: 'left' },
        footStyles: { fillColor: [238, 242, 255], textColor: [49, 46, 129], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: Object.fromEntries(def.columns.map((c, i) => [i, { halign: c.align || 'left' }])),
        didParseCell: d => {
            if (d.section !== 'body' || !statusCols.has(d.column.index)) return;
            const v = String(d.cell.raw || '').toLowerCase();
            const hit = STATUS_COLORS.find(([names]) => names.includes(v));
            if (hit) { d.cell.styles.textColor = hit[1]; d.cell.styles.fontStyle = 'bold'; }
        },
        didDrawPage: () => drawHeader(doc, ctx, pageW)
    });
    drawFooters(doc, ctx, pageW, pageH);

    const safe = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save(`${safe(companyName())}-${safe(def.title)}-${todayStr()}.pdf`);
}

// ==================== Report definitions ====================
const REPORTS = {
    async attendance() {
        const ym = selectedMonth();
        const logs = await logsInRange(`${ym}-01`, `${ym}-31`);
        const rows = [];
        let totalMin = 0;
        const people = new Set();
        Object.keys(logs).sort().forEach(date => {
            Object.entries(logs[date] || {}).forEach(([eid, log]) => {
                const f = formatOf(log.format), worked = workedMinutes(log, f);
                if (worked != null) totalMin += worked;
                people.add(eid);
                rows.push([
                    date, eid, log.name || '', log.group || '', log.shift || '', f,
                    log[f === 'SDI' ? 'lineIn' : 'checkIn'] || '', log[f === 'SDI' ? 'lineOut' : 'checkOut'] || '',
                    breakMinutes(log, f) || '', worked == null ? '' : (worked / 60).toFixed(2),
                    String(log.remarks || log.comments || '').slice(0, 140)
                ]);
            });
        });
        rows.sort((a, b) => a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]));
        const shifts = rows.filter(r => r[9] !== '').length;
        return {
            title: 'Attendance Report', period: `Period: ${monthLabel(ym)}`, landscape: true, rows,
            columns: [
                { header: 'Date' }, { header: 'ID' }, { header: 'Name' }, { header: 'Group' }, { header: 'Shift' }, { header: 'Log' },
                { header: 'In' }, { header: 'Out' }, { header: 'Breaks (min)', align: 'right' }, { header: 'Hours', align: 'right' }, { header: 'Shift report' }
            ],
            summary: [
                { label: 'Records', value: rows.length }, { label: 'Employees', value: people.size },
                { label: 'Total hours', value: (totalMin / 60).toFixed(1) },
                { label: 'Avg hours / shift', value: shifts ? (totalMin / 60 / shifts).toFixed(2) : '-' }
            ]
        };
    },

    async performance() {
        const list = [...state.performance].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const scores = list.map(p => Number(p.score) || 0);
        return {
            title: 'Performance Report', period: 'All reviews', landscape: false,
            columns: [{ header: 'Employee' }, { header: 'Department' }, { header: 'Period' }, { header: 'Score', align: 'right' }, { header: 'Date' }, { header: 'Comments' }],
            rows: list.map(p => [p.name, p.department, p.period, p.score, p.date, String(p.comments || '').slice(0, 160)]),
            summary: [
                { label: 'Reviews', value: list.length },
                { label: 'Average score', value: scores.length ? (sum(scores, x => x) / scores.length).toFixed(1) : '-' },
                { label: 'Highest', value: scores.length ? Math.max(...scores) : '-' },
                { label: 'Below 60', value: scores.filter(s => s < 60).length }
            ]
        };
    },

    async payroll() {
        const ym = selectedMonth(), [y, m] = ym.split('-').map(Number);
        const list = state.payroll.filter(p => Number(p.month) === m && Number(p.year) === y);
        const paid = list.filter(p => p.status === 'paid').length;
        return {
            title: 'Payroll Report', period: `Period: ${monthLabel(ym)}`, landscape: false,
            columns: [
                { header: 'ID' }, { header: 'Employee' }, { header: 'Department' },
                { header: 'Basic', align: 'right' }, { header: 'Allowances', align: 'right' }, { header: 'Deductions', align: 'right' },
                { header: 'Net salary', align: 'right' }, { header: 'Status', status: true }
            ],
            rows: list.map(p => [p.employeeId, p.name, p.department, formatCurrency(p.basicSalary), formatCurrency(p.allowances), formatCurrency(p.deductions), formatCurrency(p.netSalary), p.status]),
            foot: list.length ? ['', 'Total', '', formatCurrency(sum(list, p => p.basicSalary)), formatCurrency(sum(list, p => p.allowances)), formatCurrency(sum(list, p => p.deductions)), formatCurrency(sum(list, p => p.netSalary)), ''] : null,
            summary: [
                { label: 'Employees', value: list.length }, { label: 'Total net pay', value: formatCurrency(sum(list, p => p.netSalary)) },
                { label: 'Paid', value: paid }, { label: 'Pending', value: list.length - paid }
            ]
        };
    },

    async leave() {
        const ym = selectedMonth();
        const list = state.leave.filter(l => String(l.fromDate || '').slice(0, 7) === ym || String(l.toDate || '').slice(0, 7) === ym)
            .sort((a, b) => String(a.fromDate).localeCompare(String(b.fromDate)));
        const count = s => list.filter(l => l.status === s).length;
        return {
            title: 'Leave Report', period: `Period: ${monthLabel(ym)}`, landscape: false,
            columns: [{ header: 'Employee' }, { header: 'Type' }, { header: 'From' }, { header: 'To' }, { header: 'Days', align: 'right' }, { header: 'Status', status: true }, { header: 'Reason' }],
            rows: list.map(l => [l.employee, l.type, l.fromDate, l.toDate, l.days, l.status, String(l.reason || '').slice(0, 120)]),
            summary: [
                { label: 'Requests', value: list.length },
                { label: 'Approved days', value: sum(list.filter(l => l.status === 'approved'), l => l.days) },
                { label: 'Pending', value: count('pending') }, { label: 'Rejected', value: count('rejected') }
            ]
        };
    },

    async department() {
        const list = [...state.departments].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const count = d => state.employees.filter(e => e.department === d.name).length;
        return {
            title: 'Department Report', period: 'Current structure', landscape: false,
            columns: [{ header: 'Department' }, { header: 'Code' }, { header: 'Head' }, { header: 'Employees', align: 'right' }, { header: 'Budget', align: 'right' }],
            rows: list.map(d => [d.name, d.code, d.head, count(d), formatCurrency(d.budget)]),
            foot: list.length ? ['Total', '', '', sum(list, count), formatCurrency(sum(list, d => d.budget))] : null,
            summary: [
                { label: 'Departments', value: list.length }, { label: 'Employees', value: state.employees.length },
                { label: 'Total budget', value: formatCurrency(sum(list, d => d.budget)) }
            ]
        };
    },

    // Salaries are left out on purpose: this list is meant for sharing. They are in the Payroll report.
    async employee() {
        const list = [...state.employees].sort((a, b) => fullNameOf(a).localeCompare(fullNameOf(b)));
        return {
            title: 'Employee Directory', period: 'Current staff', landscape: true,
            columns: [
                { header: 'ID' }, { header: 'Name' }, { header: 'Email' }, { header: 'Department' }, { header: 'Position' },
                { header: 'Joined' }, { header: 'Type' }, { header: 'Log type' }, { header: 'Status', status: true }
            ],
            rows: list.map(e => [e.employeeId, fullNameOf(e), e.email, e.department, e.position, formatDate(e.joinDate), e.employmentType, e.logType === 'Logs_SDI' ? 'SDI' : 'Standard', e.status]),
            summary: [
                { label: 'Employees', value: list.length },
                { label: 'Active', value: list.filter(e => e.status === 'active').length },
                { label: 'Inactive', value: list.filter(e => e.status !== 'active').length },
                { label: 'Departments', value: new Set(list.map(e => e.department).filter(Boolean)).size }
            ]
        };
    }
};

export async function generateReport(type) {
    const build = REPORTS[type];
    if (!build) return;
    showToast('Preparing your PDF...', 'info');
    try {
        const def = await build();
        if (!def.rows.length) return showToast('No data for this report', 'error');
        await renderPdf(def);
        showToast('Report downloaded', 'success');
    } catch (err) {
        console.error('Report failed', err);
        showToast('Report failed: ' + err.message, 'error');
    }
}

// ==================== Settings & data export ====================
function downloadFile(filename, content, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadSettings() {
    const form = $('companySettingsForm');
    if (!form) return;
    let s = null;
    try { s = JSON.parse(localStorage.getItem('ems_settings')); } catch (e) { /* ignore */ }
    if (!s) return;
    form.elements.companyName.value = s.companyName ?? '';
    form.elements.industry.value = s.industry ?? '';
    form.elements.startTime.value = s.startTime ?? '09:00';
    form.elements.endTime.value = s.endTime ?? '18:00';
    form.querySelectorAll('input[name="workDays"]').forEach(cb => { cb.checked = (s.workDays || []).includes(cb.value); });
}

function saveSettings() {
    const form = $('companySettingsForm');
    localStorage.setItem('ems_settings', JSON.stringify({
        companyName: form.elements.companyName.value, industry: form.elements.industry.value,
        startTime: form.elements.startTime.value, endTime: form.elements.endTime.value,
        workDays: [...form.querySelectorAll('input[name="workDays"]:checked')].map(cb => cb.value)
    }));
    showToast('Settings saved successfully!', 'success');
}

function exportData() {
    const { employees, departments, performance, payroll, leave } = state;
    downloadFile(`ems-backup-${todayStr()}.json`, JSON.stringify({ employees, departments, performance, payroll, leave }, null, 2), 'application/json');
    showToast('Data exported', 'success');
}

export function initReports() {
    loadSettings();
    enableFeature('reports-month');                       // month picker on the Reports page
    if ($('reportMonth')) $('reportMonth').value = todayStr().slice(0, 7);
    on('companySettingsForm', 'submit', e => { e.preventDefault(); saveSettings(); });
    on('exportDataBtn', 'click', exportData);
    on('backupDataBtn', 'click', exportData);
    on('clearCacheBtn', 'click', () => { localStorage.removeItem('ems_settings'); showToast('Saved settings cleared', 'success'); });
}
