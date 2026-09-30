import { MOBILE_QUERY } from './core.js';

// Labels each cell with its column heading and marks the always-visible cells.
// The CSS shows only those cells on phones; tapping a row opens the rest.
export function watchTables() {
    const PRIMARY_HEADS = ['Status', 'Score', 'Net Salary'];

    const label = () => {
        document.querySelectorAll('.data-table:not(.schedule-grid)').forEach(table => {
            const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
            table.querySelectorAll('tbody tr').forEach(tr => {
                const cells = [...tr.children];
                if (!cells.length || cells[0].hasAttribute('colspan')) return;
                let hasPrimary = false;
                cells.forEach((td, i) => {
                    if (heads[i]) td.dataset.label = heads[i];
                    if (td.querySelector('.user-info') || PRIMARY_HEADS.includes(heads[i])) {
                        td.dataset.primary = '1';
                        hasPrimary = true;
                    } else {
                        delete td.dataset.primary;
                    }
                });
                if (!hasPrimary && cells[1]) cells[1].dataset.primary = '1';
                tr.classList.add('collapsible');
            });
        });
    };

    document.querySelectorAll('.data-table:not(.schedule-grid) tbody').forEach(tb => {
        new MutationObserver(label).observe(tb, { childList: true });
    });
    label();

    // One open row per table; buttons inside a row don't toggle it
    document.addEventListener('click', e => {
        if (!window.matchMedia(MOBILE_QUERY).matches) return;
        const tr = e.target.closest('.data-table:not(.schedule-grid) tbody tr.collapsible');
        if (!tr || e.target.closest('button, a, input, select, label')) return;
        const wasOpen = tr.classList.contains('open');
        tr.closest('tbody').querySelectorAll('tr.open').forEach(r => r.classList.remove('open'));
        if (!wasOpen) tr.classList.add('open');
    });
}
