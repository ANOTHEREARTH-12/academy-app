(function (App) {
  'use strict';
  const U = App.U, ui = App.ui, P = App.paths;
  App.views = App.views || {};
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const V = {};

  const hourOpts = (from, to, sel) => {
    let o = '';
    for (let h = from; h <= to; h++) o += `<option value="${h}"${h === sel ? ' selected' : ''}>${h === 24 ? '12:00 AM (midnight)' : U.fmt12(h * 60)}</option>`;
    return o;
  };
  const timeOpts = (sel) => {
    let o = '';
    for (let m = 0; m <= 24 * 60; m += 30) {
      const t = U.toTime(m);
      o += `<option value="${t}"${t === sel ? ' selected' : ''}>${m === 1440 ? '12:00 AM (midnight)' : U.fmt12(m)}</option>`;
    }
    return o;
  };

  V.render = function (root) {
    V.root = root;
    V.s = JSON.parse(JSON.stringify(App.state.settings));
    const s = V.s;
    root.innerHTML = `
      <section class="toolbar"><h1>Settings</h1><span class="spacer"></span>
        <button type="button" class="btn primary" data-save>Save settings</button></section>
      <form class="settings" data-form novalidate autocomplete="off">
        <section class="card"><h2>Academy</h2>
          <div class="form-grid g2">
            <label>Academy name<input name="academyName" maxlength="80"></label>
            <label>Currency symbol<input name="currency" maxlength="4"></label>
          </div></section>

        <section class="card"><h2>Opening hours</h2>
          <div class="form-grid g3">
            <label>Opens at<select name="openHour">${hourOpts(0, 23, s.openHour)}</select></label>
            <label>Closes at<select name="closeHour">${hourOpts(1, 24, s.closeHour)}</select></label>
            <label>Slot length<select name="slotMinutes"><option value="60">1 hour</option><option value="30">30 minutes</option></select></label>
          </div>
          <p class="hint">Changing hours never deletes bookings. Any booking outside the new hours is listed under the day's grid.</p></section>

        <section class="card"><h2>Courts</h2>
          <div class="rows" data-courts></div>
          <button type="button" class="btn ghost" data-addcourt>+ Add court</button>
          <p class="hint">Switch a court off (for example during repairs) instead of removing it, so its past bookings keep their name.</p></section>

        <section class="card"><h2>Court rates</h2>
          <label class="narrow">Standard rate per hour (${U.esc(s.currency)})<input type="number" name="defaultRate" min="0" step="any"></label>
          <h3>Special rates <span class="muted">(optional)</span></h3>
          <p class="hint">For peak hours, weekends or early morning. If two special rates overlap, the one higher in the list is used. Every other time uses the standard rate.</p>
          <div class="rows" data-rules></div>
          <button type="button" class="btn ghost" data-addrule>+ Add special rate</button></section>

        <section class="card"><h2>Membership plans</h2>
          <div class="rows" data-plans></div>
          <button type="button" class="btn ghost" data-addplan>+ Add plan</button>
          <p class="hint">Switch a plan off to stop selling it. Memberships already sold on it are not affected.</p>
          <label class="narrow">Show “expiring soon” this many days before the end<input type="number" name="expiringDays" min="1" max="60"></label>
        </section>

        <section class="card"><h2>Expense categories</h2>
          <div class="rows" data-cats></div>
          <button type="button" class="btn ghost" data-addcat>+ Add category</button>
          <p class="hint">Renaming a category does not change expenses already recorded.</p>
        </section>
      </form>
      <section class="card"><h2>Connection</h2><div data-conn></div></section>`;

    const f = root.querySelector('[data-form]');
    f.elements.academyName.value = s.academyName;
    f.elements.currency.value = s.currency;
    f.elements.slotMinutes.value = String(s.slotMinutes);
    f.elements.defaultRate.value = s.defaultRate;
    f.elements.expiringDays.value = s.expiringDays;
    f.addEventListener('submit', (e) => e.preventDefault());

    drawCourts();
    drawRules();
    drawPlans();
    drawCats();
    drawConnection();

    root.querySelector('[data-addplan]').addEventListener('click', () => {
      sync();
      V.s.plans.push({ id: U.id('plan'), name: '', durationValue: 1, durationUnit: 'months', price: '', active: true, _new: true });
      drawPlans();
      const rows = V.root.querySelectorAll('[data-plan] [data-k=name]');
      rows[rows.length - 1].focus();
    });
    root.querySelector('[data-plans]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rmplan]');
      if (!b) return;
      sync();
      V.s.plans.splice(Number(b.dataset.rmplan), 1);
      drawPlans();
    });
    root.querySelector('[data-addcat]').addEventListener('click', () => {
      sync();
      V.s.expenseCategories.push('');
      drawCats();
      const rows = V.root.querySelectorAll('[data-cat] input');
      rows[rows.length - 1].focus();
    });
    root.querySelector('[data-cats]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rmcat]');
      if (!b) return;
      sync();
      V.s.expenseCategories.splice(Number(b.dataset.rmcat), 1);
      drawCats();
    });

    root.querySelector('[data-addcourt]').addEventListener('click', () => {
      sync();
      V.s.courts.push({ id: U.id('court'), name: `Court ${V.s.courts.length + 1}`, active: true, _new: true });
      drawCourts();
    });
    root.querySelector('[data-addrule]').addEventListener('click', () => {
      sync();
      V.s.rateRules.push({ id: U.id('rate'), label: 'Peak', days: [0, 1, 2, 3, 4, 5, 6], from: '17:00', to: '22:00', rate: U.num(V.s.defaultRate) });
      drawRules();
    });
    root.querySelector('[data-courts]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rmcourt]');
      if (!b) return;
      sync();
      V.s.courts.splice(Number(b.dataset.rmcourt), 1);
      drawCourts();
    });
    root.querySelector('[data-rules]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rmrule]');
      if (!b) return;
      sync();
      V.s.rateRules.splice(Number(b.dataset.rmrule), 1);
      drawRules();
    });
    root.querySelector('[data-save]').addEventListener('click', (e) => save(e.currentTarget));
  };

  function drawCourts() {
    V.root.querySelector('[data-courts]').innerHTML = V.s.courts.map((c, i) => `
      <div class="row-item" data-court="${i}">
        <input data-k="name" value="${U.esc(c.name)}" maxlength="40" aria-label="Court name">
        <label class="switch"><input type="checkbox" data-k="active"${c.active ? ' checked' : ''}> <span>In use</span></label>
        ${c._new ? `<button type="button" class="icon-btn" data-rmcourt="${i}" aria-label="Remove court">✕</button>` : ''}
      </div>`).join('');
  }

  function drawRules() {
    const box = V.root.querySelector('[data-rules]');
    if (!V.s.rateRules.length) { box.innerHTML = '<p class="muted">No special rates — every slot uses the standard rate.</p>'; return; }
    box.innerHTML = V.s.rateRules.map((r, i) => `
      <div class="rule" data-rule="${i}">
        <div class="rule-top">
          <input data-k="label" value="${U.esc(r.label)}" placeholder="Name, e.g. Peak" maxlength="30" aria-label="Rate name">
          <button type="button" class="icon-btn" data-rmrule="${i}" aria-label="Remove this special rate">✕</button>
        </div>
        <div class="days">${DAYS.map((d, di) => `<label class="chip"><input type="checkbox" data-day="${di}"${(r.days || []).includes(di) ? ' checked' : ''}><span>${d}</span></label>`).join('')}</div>
        <div class="form-grid g3">
          <label>From<select data-k="from">${timeOpts(r.from)}</select></label>
          <label>To<select data-k="to">${timeOpts(r.to)}</select></label>
          <label>Rate per hour<input type="number" data-k="rate" min="0" step="any" value="${U.esc(r.rate)}"></label>
        </div>
      </div>`).join('');
  }

  function drawPlans() {
    const box = V.root.querySelector('[data-plans]');
    if (!V.s.plans.length) { box.innerHTML = '<p class="muted">No plans yet. Add your monthly, quarterly or yearly memberships here.</p>'; return; }
    box.innerHTML = V.s.plans.map((p, i) => `
      <div class="plan-row" data-plan="${i}">
        <label>Plan name<input data-k="name" value="${U.esc(p.name)}" maxlength="40" placeholder="e.g. Monthly – mornings"></label>
        <label>Length<span class="inline">
          <input type="number" data-k="durationValue" min="1" max="999" value="${U.esc(p.durationValue)}">
          <select data-k="durationUnit"><option value="months"${p.durationUnit === 'months' ? ' selected' : ''}>months</option><option value="days"${p.durationUnit === 'days' ? ' selected' : ''}>days</option></select>
        </span></label>
        <label>Price (${U.esc(V.s.currency)})<input type="number" data-k="price" min="0" step="any" value="${U.esc(p.price)}"></label>
        <label class="switch"><input type="checkbox" data-k="active"${p.active ? ' checked' : ''}> <span>On sale</span></label>
        ${p._new ? `<button type="button" class="icon-btn" data-rmplan="${i}" aria-label="Remove plan">✕</button>` : ''}
      </div>`).join('');
  }

  function drawCats() {
    V.root.querySelector('[data-cats]').innerHTML = V.s.expenseCategories.map((c, i) => `
      <div class="row-item" data-cat="${i}">
        <input value="${U.esc(c)}" maxlength="40" aria-label="Category name">
        <button type="button" class="icon-btn" data-rmcat="${i}" aria-label="Remove category">✕</button>
      </div>`).join('');
  }

  function drawConnection() {
    const cfg = App.config.load() || {};
    const box = V.root.querySelector('[data-conn]');
    if (App.store.isDemo) {
      box.innerHTML = `<p>Demo mode. Data is kept only in this browser and is not shared with other devices.</p>
        <div class="row"><button type="button" class="btn ghost" data-disconnect>Connect to GitHub instead</button>
        <button type="button" class="btn danger ghost" data-reset>Clear demo data</button></div>`;
      box.querySelector('[data-reset]').addEventListener('click', async () => {
        if (!(await ui.confirm('Delete all demo data in this browser?', { okText: 'Clear', danger: true }))) return;
        App.store.clear();
        location.reload();
      });
    } else {
      box.innerHTML = `<dl class="kv">
          <dt>Data repository</dt><dd>${U.esc(cfg.owner)}/${U.esc(cfg.repo)}</dd>
          <dt>Branch</dt><dd>${U.esc(cfg.branch || 'main')}</dd>
          <dt>Access token</dt><dd>Saved on this device (hidden)</dd></dl>
        <div class="row"><button type="button" class="btn ghost" data-disconnect>Disconnect this device</button></div>
        <p class="hint">Disconnecting removes the token from this browser. The data on GitHub is not touched. Do this before handing over or selling a device.</p>`;
    }
    box.querySelector('[data-disconnect]').addEventListener('click', async () => {
      const msg = App.store.isDemo ? 'Leave demo mode? Demo data stays in this browser.' : 'Remove the access token from this device? You will need to enter it again to use the app here.';
      if (!(await ui.confirm(msg, { okText: 'Disconnect' }))) return;
      App.config.clear();
      location.hash = '';
      location.reload();
    });
  }

  // Read the form back into V.s
  function sync() {
    const f = V.root.querySelector('[data-form]');
    const s = V.s;
    s.academyName = f.elements.academyName.value.trim();
    s.currency = f.elements.currency.value.trim();
    s.openHour = U.num(f.elements.openHour.value);
    s.closeHour = U.num(f.elements.closeHour.value);
    s.slotMinutes = U.num(f.elements.slotMinutes.value);
    s.defaultRate = f.elements.defaultRate.value === '' ? '' : U.num(f.elements.defaultRate.value);
    V.root.querySelectorAll('[data-court]').forEach((row) => {
      const c = s.courts[Number(row.dataset.court)];
      c.name = row.querySelector('[data-k=name]').value.trim();
      c.active = row.querySelector('[data-k=active]').checked;
    });
    V.root.querySelectorAll('[data-rule]').forEach((row) => {
      const r = s.rateRules[Number(row.dataset.rule)];
      r.label = row.querySelector('[data-k=label]').value.trim();
      r.from = row.querySelector('[data-k=from]').value;
      r.to = row.querySelector('[data-k=to]').value;
      const rate = row.querySelector('[data-k=rate]').value;
      r.rate = rate === '' ? '' : U.num(rate);
      r.days = Array.from(row.querySelectorAll('[data-day]')).filter((x) => x.checked).map((x) => Number(x.dataset.day));
    });
    s.expiringDays = U.num(f.elements.expiringDays.value) || 7;
    V.root.querySelectorAll('[data-plan]').forEach((row) => {
      const p = s.plans[Number(row.dataset.plan)];
      p.name = row.querySelector('[data-k=name]').value.trim();
      p.durationValue = Math.round(U.num(row.querySelector('[data-k=durationValue]').value));
      p.durationUnit = row.querySelector('[data-k=durationUnit]').value;
      const price = row.querySelector('[data-k=price]').value;
      p.price = price === '' ? '' : U.num(price);
      p.active = row.querySelector('[data-k=active]').checked;
    });
    V.root.querySelectorAll('[data-cat]').forEach((row) => {
      s.expenseCategories[Number(row.dataset.cat)] = row.querySelector('input').value.trim();
    });
  }

  function validate(s) {
    if (!s.academyName) return 'Enter the academy name.';
    if (!s.currency) return 'Enter a currency symbol, for example ₹.';
    if (s.closeHour <= s.openHour) return 'Closing time must be after opening time.';
    if (s.defaultRate === '' || s.defaultRate < 0) return 'Enter the standard rate per hour.';
    if (s.courts.some((c) => !c.name)) return 'Every court needs a name.';
    const names = s.courts.map((c) => c.name.toLowerCase());
    if (new Set(names).size !== names.length) return 'Two courts have the same name.';
    if (!s.courts.some((c) => c.active)) return 'At least one court must be in use.';
    for (const r of s.rateRules) {
      const n = r.label || 'a special rate';
      if (!r.days.length) return `Pick at least one day for ${n}.`;
      if (U.toMin(r.to) <= U.toMin(r.from)) return `For ${n}, the "To" time must be after the "From" time.`;
      if (r.rate === '' || r.rate < 0) return `Enter the rate per hour for ${n}.`;
    }
    for (const p of s.plans) {
      if (!p.name) return 'Every membership plan needs a name.';
      if (!(p.durationValue >= 1)) return `Enter the length of the plan "${p.name}".`;
      if (p.price === '' || p.price < 0) return `Enter the price of the plan "${p.name}".`;
    }
    const pn = s.plans.map((p) => p.name.toLowerCase());
    if (new Set(pn).size !== pn.length) return 'Two membership plans have the same name.';
    s.expenseCategories = s.expenseCategories.filter((c) => c);
    if (!s.expenseCategories.length) return 'Keep at least one expense category.';
    const cn = s.expenseCategories.map((c) => c.toLowerCase());
    if (new Set(cn).size !== cn.length) return 'Two expense categories have the same name.';
    return null;
  }

  async function save(btn) {
    sync();
    const err = validate(V.s);
    if (err) { ui.toast(err, 'error', 6000); return; }
    const clean = JSON.parse(JSON.stringify(V.s));
    clean.courts.forEach((c) => { delete c._new; });
    clean.plans.forEach((p) => { delete p._new; });
    clean.rateRules.forEach((r) => { if (!r.label) r.label = 'Special rate'; });
    try {
      await ui.busy(btn, () => App.store.transact([P.settings], (data) => { data[P.settings] = clean; }, 'Update settings'));
      App.state.settings = App.normalizeSettings(clean);
      App.applyBranding();
      ui.toast('Settings saved', 'success');
      V.render(V.root);
    } catch (ex) { ui.err(ex); }
  }

  App.views.settings = V;
})(window.App);
