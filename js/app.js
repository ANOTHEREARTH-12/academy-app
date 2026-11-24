(function (App) {
  'use strict';
  const U = App.U, ui = App.ui, P = App.paths;
  App.state = { settings: null, customers: [] };
  const VIEWS = ['bookings', 'members', 'customers', 'collections', 'expenses', 'reports', 'settings'];
  const main = () => document.getElementById('view');

  App.normalizeSettings = function (s) {
    const d = App.defaultSettings();
    const o = Object.assign({}, d, s || {});
    if (!Array.isArray(o.courts) || !o.courts.length) o.courts = d.courts;
    if (!Array.isArray(o.rateRules)) o.rateRules = [];
    o.openHour = Math.min(23, Math.max(0, U.num(o.openHour)));
    o.closeHour = Math.min(24, Math.max(o.openHour + 1, U.num(o.closeHour)));
    o.slotMinutes = [30, 60].includes(U.num(o.slotMinutes)) ? U.num(o.slotMinutes) : 60;
    o.defaultRate = U.num(o.defaultRate);
    if (!Array.isArray(o.plans)) o.plans = [];
    if (!Array.isArray(o.expenseCategories) || !o.expenseCategories.length) o.expenseCategories = App.DEFAULT_EXPENSE_CATEGORIES.slice();
    o.expiringDays = Math.max(1, U.num(o.expiringDays) || 7);
    return o;
  };

  App.applyBranding = function () {
    const n = (App.state.settings && App.state.settings.academyName) || 'Court Manager';
    document.getElementById('brandName').textContent = n;
    document.title = n + ' · Court Manager';
  };

  App.loadBase = async function () {
    const r = await App.store.read([P.settings, P.customers]);
    App.state.settings = App.normalizeSettings(r[P.settings]);
    App.state.customers = Array.isArray(r[P.customers]) ? r[P.customers] : [];
    App.applyBranding();
  };

  function route() {
    if (!App.store || !App.state.settings) return;
    const name = (location.hash || '#bookings').slice(1);
    const key = VIEWS.includes(name) ? name : 'bookings';
    document.querySelectorAll('#tabs a').forEach((a) => {
      const on = a.dataset.view === key;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    const r = App.views[key].render(main());
    if (r && r.catch) r.catch(ui.err);
  }
  App.route = route;

  App.showSetup = function (prefill) {
    document.getElementById('topbar').hidden = true;
    App.store = null;
    App.state.settings = null;
    App.views.setup.render(main(), prefill);
  };

  App.start = async function (cfgOverride) {
    const cfg = cfgOverride || App.config.load();
    if (!cfg) { App.showSetup(); return; }
    App.store = App.makeStore(cfg);
    main().innerHTML = '<div class="loading center">Loading academy data…</div>';
    try {
      await App.loadBase();
    } catch (e) {
      main().innerHTML = `
        <section class="card narrow-card">
          <h2>Could not load the academy data</h2>
          <p>${U.esc(e.message)}</p>
          <div class="row"><button type="button" class="btn primary" data-retry>Try again</button>
          <button type="button" class="btn ghost" data-reconnect>Enter a new token</button></div>
        </section>`;
      main().querySelector('[data-retry]').addEventListener('click', () => App.start(cfgOverride));
      main().querySelector('[data-reconnect]').addEventListener('click', () => {
        App.config.clear();
        App.showSetup({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch });
      });
      return;
    }
    document.getElementById('topbar').hidden = false;
    const badge = document.getElementById('connBadge');
    badge.textContent = App.store.isDemo ? 'Demo' : cfg.repo;
    badge.className = 'badge ' + (App.store.isDemo ? 'warn' : 'ok');
    badge.title = App.store.label;
    route();
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('hashchange', route);
    document.getElementById('refreshBtn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try {
        await ui.busy(btn, App.loadBase, '');
        route();
        ui.toast('Up to date', 'success', 1500);
      } catch (err) { ui.err(err); }
    });
    App.start();
  });
})(window.App);
