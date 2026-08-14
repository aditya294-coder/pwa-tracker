/**
 * app.js
 * -----------------------------------------------------------------------
 * Bootstraps the single-page app: registers the service worker, waits for
 * the Dexie database to be ready, mounts the dashboard and log-entry
 * (override-modal) views into their containers, wires the tab switcher,
 * and hooks up the Export/Import data buttons.
 * -----------------------------------------------------------------------
 */

import { mountDashboard } from './dashboard.js';
import { mountOverrideModal } from './override-modal.js';
import { exportData, importData } from './backup.js';

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[app] Service worker registration failed:', err);
    });
  });
}

function wireTabs(views) {
  const tabButtons = document.querySelectorAll('[data-tab]');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      tabButtons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('bg-[var(--db-gold)]', active);
        b.classList.toggle('text-[var(--db-ink)]', active);
        b.classList.toggle('text-[var(--db-muted)]', !active);
      });
      Object.entries(views).forEach(([name, el]) => {
        el.classList.toggle('hidden', name !== target);
      });
    });
  });
}

function wireBackupControls(db, dashboardHandle) {
  const exportBtn = document.getElementById('export-btn');
  const importInput = document.getElementById('import-input');
  const statusEl = document.getElementById('backup-status');

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    try {
      const backup = await exportData(db);
      statusEl.textContent = `Exported ${backup.entry_items.length} log entries.`;
    } catch (err) {
      statusEl.textContent = `Export failed: ${err.message}`;
    } finally {
      exportBtn.disabled = false;
    }
  });

  importInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const confirmed = window.confirm(
      'Importing will overwrite any existing logs/profile with matching dates or IDs. Continue?'
    );
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    statusEl.textContent = 'Importing...';
    try {
      const result = await importData(db, file);
      statusEl.textContent = `Restored ${result.entryItemsRestored} entries, ${result.dailyLogsRestored} days, ${result.customFoodsRestored + result.customWorkoutsRestored} custom items.`;
      await dashboardHandle.refresh();
    } catch (err) {
      statusEl.textContent = `Import failed: ${err.message}`;
    } finally {
      e.target.value = '';
    }
  });
}

async function boot() {
  registerServiceWorker();

  await window.dbReady;
  const db = window.db;

  const dashboardRoot = document.getElementById('dashboard-root');
  const logRoot = document.getElementById('log-root');

  const dashboardHandle = mountDashboard(dashboardRoot, { db });
  mountOverrideModal(logRoot, {
    db,
    onSaved: () => dashboardHandle.refresh(),
  });

  wireTabs({ dashboard: dashboardRoot, log: logRoot });
  wireBackupControls(db, dashboardHandle);
}

boot().catch((err) => {
  console.error('[app] Failed to start:', err);
  document.body.innerHTML = `<div class="p-6 text-red-400 db-font-body">Something went wrong starting the app: ${err.message}</div>`;
});
