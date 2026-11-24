(function (App) {
  'use strict';
  const U = App.U, ui = App.ui, P = App.paths;
  App.views = App.views || {};
  const V = { filter: 'current', q: '', list: [] };
  const DAY = 86400000;

  // ---------- membership helpers ----------
  App.planEnd = function (start, plan) {
    const n = Math.max(1, Math.round(U.num(plan.durationValue)));
    if (plan.durationUnit === 'days') return U.addDays(start, n - 1);
    const d = U.parseDate(start);
    const t = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    if (t.getDate() !== d.getDate()) { t.setDate(0); return U.dateStr(t); } // e.g. 31 Jan + 1 month → 28/29 Feb
    t.setDate(t.getDate() - 1);
    return U.dateStr(t);
  };
  App.planLength = (p) => `${p.durationValue} ${p.durationUnit === 'days' ? (p.durationValue == 1 ? 'day' : 'days') : (p.durationValue == 1 ? 'month' : 'months')}`;
  const daysBetween = (a, b) => Math.round((U.parseDate(b) - U.parseDate(a)) / DAY);

  App.memberState = function (m, today) {
    today = today || U.today();
    if (m.status === 'cancelled') return { key: 'cancelled', label: 'Cancelled' };
    if (m.start > today) return { key: 'upcoming', label: `Starts ${U.fmtDate(m.start, { day: 'numeric', month: 'short' })}` };
    if (m.end < today) {
      const n = daysBetween(m.end, today);
      return { key: 'expired', label: `Expired ${n} day${n === 1 ? '' : 's'} ago` };
    }
    const left = daysBetween(today, m.end);
    const warn = App.state.settings.expiringDays || 7;
    if (left <= warn) return { key: 'expiring', label: left === 0 ? 'Ends today' : `Ends in ${left} day${left === 1 ? '' : 's'}` };
    return { key: 'active', label: 'Active' };
  };
  App.memberDue = (m) => (m.status === 'cancelled' ? 0 : Math.max(0, U.round2(U.num(m.price) - U.num(m.paid))));
  const TAG = { active: 'paid', expiring: 'due', expired: 'noshow', cancelled: 'cancelled', upcoming: 'partial' };

  // Latest non-cancelled membership per customer
  function latestByCustomer(list) {
    const map = {};
    list.filter((m) => m.status !== 'cancelled').forEach((m) => {
      if (!map[m.customerId] || m.end > map[m.customerId].end) map[m.customerId] = m;
    });
    return map;
  }

  // ---------- view ----------
  V.render = async function (root) {
    V.root = root;
    root.innerHTML = `
      <section class="toolbar">
        <h1>Members</h1><span class="spacer"></span>
        <input type="search" class="search" placeholder="Search name or phone" data-q aria-label="Search members">
        <button type="button" class="btn primary" data-add>+ New membership</button>
      </section>
      <section class="stats" data-stats></section>
      <div class="seg wrap" role="group" aria-label="Show" data-filters>
        <button type="button" data-f="current">Current</button>
        <button type="button" data-f="expiring">Expiring soon</button>
        <button type="button" data-f="expired">Expired – not renewed</button>
        <button type="button" data-f="due">Payment due</button>
        <button type="button" data-f="all">All</button>
      </div>
      <section class="card"><div data-list><div class="loading">Loading…</div></div></section>`;
    const q = root.querySelector('[data-q]');
    q.value = V.q;
    q.addEventListener('input', () => { V.q = q.value; V.draw(); });
    root.querySelector('[data-add]').addEventListener('click', () => App.openMembershipModal({}, () => V.load()));
    root.querySelector('[data-filters]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) { V.filter = b.dataset.f; V.draw(); }
    });
    root.querySelector('[data-stats]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) { V.filter = b.dataset.f; V.draw(); }
    });
    const list = root.querySelector('[data-list]');
    const open = (e) => {
      const r = e.target.closest('[data-mid]');
      if (!r) return;
      const m = V.list.find((x) => x.id === r.dataset.mid);
      if (m) App.openMembershipModal({ membership: m }, () => V.load());
    };
    list.addEventListener('click', open);
    list.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    await V.load();
  };

  V.load = async function () {
    try {
      const r = await App.store.read([P.memberships, P.customers]);
      V.list = r[P.memberships];
      App.state.customers = r[P.customers];
    } catch (e) {
      V.root.querySelector('[data-list]').innerHTML = `<div class="error-box">${U.esc(e.message)}</div>`;
      return;
    }
    V.draw();
  };

  V.draw = function () {
    const today = U.today();
    const all = V.list.map((m) => Object.assign({ st: App.memberState(m, today) }, m));
    const latest = latestByCustomer(V.list);
    const current = all.filter((m) => ['active', 'expiring', 'upcoming'].includes(m.st.key));
    const expiring = all.filter((m) => m.st.key === 'expiring' && latest[m.customerId] && latest[m.customerId].id === m.id);
    const expired = all.filter((m) => m.st.key === 'expired' && latest[m.customerId] && latest[m.customerId].id === m.id);
    const due = all.filter((m) => App.memberDue(m) > 0);
    const activeCount = new Set(all.filter((m) => ['active', 'expiring'].includes(m.st.key)).map((m) => m.customerId)).size;

    V.root.querySelector('[data-stats]').innerHTML = `
      <button type="button" class="stat" data-f="current"><span>Active members</span><strong>${activeCount}</strong></button>
      <button type="button" class="stat" data-f="expiring"><span>Expiring soon</span><strong class="${expiring.length ? 'txt-warn' : ''}">${expiring.length}</strong></button>
      <button type="button" class="stat" data-f="expired"><span>Expired – not renewed</span><strong>${expired.length}</strong></button>
      <button type="button" class="stat" data-f="due"><span>Membership dues</span><strong class="${due.length ? 'txt-warn' : ''}">${U.money(U.sum(due, App.memberDue))}</strong></button>
      <div class="stat"><span>Plans on sale</span><strong>${App.state.settings.plans.filter((p) => p.active).length}</strong></div>`;

    V.root.querySelectorAll('[data-filters] [data-f]').forEach((b) => b.classList.toggle('active', b.dataset.f === V.filter));

    let rows = { current, expiring, expired, due, all }[V.filter] || current;
    const q = V.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    if (q) rows = rows.filter((m) => (m.customerName || '').toLowerCase().includes(q) || (qd.length >= 2 && U.normPhone(m.phone).includes(qd)));
    rows.sort((a, b) => (V.filter === 'all' ? b.start.localeCompare(a.start) : a.end.localeCompare(b.end)));

    const box = V.root.querySelector('[data-list]');
    if (!App.state.settings.plans.length) {
      box.innerHTML = '<div class="empty">No membership plans yet. Add your plans and prices in <a href="#settings">Settings → Membership plans</a> first.</div>';
      return;
    }
    if (!rows.length) {
      const msg = { current: 'No current memberships.', expiring: 'No memberships are ending soon.', expired: 'No expired memberships waiting for renewal.', due: 'No membership payments are due.', all: 'No memberships yet. Use “New membership” to add one.' }[V.filter];
      box.innerHTML = `<div class="empty">${q ? 'No matches.' : msg}</div>`;
      return;
    }
    box.innerHTML = `
      <p class="count">${rows.length} membership${rows.length === 1 ? '' : 's'}</p>
      <table class="table">
        <thead><tr><th>Member</th><th class="hide-sm">Plan</th><th>Period</th><th>Status</th><th class="num">Due</th></tr></thead>
        <tbody>${rows.map((m) => `<tr data-mid="${U.esc(m.id)}" tabindex="0">
          <td><strong>${U.esc(m.customerName)}</strong><div class="muted small">${U.esc(m.phone || '')}</div></td>
          <td class="hide-sm">${U.esc(m.planName)}</td>
          <td class="nowrap">${U.fmtDate(m.start, { day: 'numeric', month: 'short' })} – ${U.fmtDate(m.end, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
          <td><span class="tag ${TAG[m.st.key]}">${U.esc(m.st.label)}</span></td>
          <td class="num${App.memberDue(m) > 0 ? ' txt-warn' : ''}">${App.memberDue(m) > 0 ? U.money(App.memberDue(m)) : '—'}</td></tr>`).join('')}</tbody>
      </table>`;
  };

  // ---------- membership form ----------
  /**
   * opts: { membership } to view/edit, or { customerId, planId, start } for a new one (all optional).
   */
  App.openMembershipModal = function (opts, onSaved) {
    const s = App.state.settings;
    const isEdit = !!opts.membership;
    let m = isEdit ? JSON.parse(JSON.stringify(opts.membership)) : null;
    let customerId = isEdit ? m.customerId : (opts.customerId || null);
    let endTouched = isEdit, priceTouched = isEdit, changed = false;

    const plans = s.plans.filter((p) => p.active || (isEdit && p.id === m.planId));
    if (!plans.length && !isEdit) {
      ui.toast('Add a membership plan in Settings first.', 'error', 6000);
      location.hash = '#settings';
      return;
    }
    const planOpts = plans.map((p) => `<option value="${U.esc(p.id)}">${U.esc(p.name)} · ${App.planLength(p)} · ${U.money(p.price)}</option>`).join('')
      + (isEdit && !s.plans.some((p) => p.id === m.planId) ? `<option value="${U.esc(m.planId)}">${U.esc(m.planName)} (removed plan)</option>` : '');
    const methodOpts = App.METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    const body = `
      <div class="cust">
        <div class="form-grid g2">
          <label>Phone<input name="phone" inputmode="tel" placeholder="Type to search customers"></label>
          <label>Name<input name="name" required placeholder="Member name"></label>
        </div>
        <div class="suggest" data-suggest hidden></div>
        <div class="hint" data-custhint></div>
      </div>
      <label>Plan<select name="planId">${planOpts}</select></label>
      <div class="form-grid g3">
        <label>Starts<input type="date" name="start" required></label>
        <label>Ends<input type="date" name="end" required></label>
        <label>Price (${U.esc(s.currency)})<input type="number" name="price" min="0" step="any" required></label>
      </div>
      <div class="clash" data-clash hidden></div>
      ${isEdit ? '<label>Status<select name="status"><option value="active">Active</option><option value="cancelled">Cancelled</option></select></label>' : ''}
      <label>Notes<textarea name="notes" rows="2" placeholder="Optional — e.g. preferred time slot"></textarea></label>
      ${isEdit ? '<section class="pay-section" data-payments></section>' : `
      <fieldset class="paynow"><legend>Payment received now</legend>
        <div class="form-grid g2">
          <label>Amount paid<span class="inline"><input type="number" name="payAmount" min="0" step="any" value="0">
            <button type="button" class="btn ghost sm" data-full>Full</button></span></label>
          <label>Method<select name="payMethod">${methodOpts}</select></label>
        </div>
      </fieldset>`}`;
    const footer = `${isEdit ? '<button type="button" class="btn danger ghost" data-delete>Delete</button><button type="button" class="btn" data-renew>Renew</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-close>Close</button>
      <button type="submit" class="btn primary" data-save>${isEdit ? 'Save changes' : 'Save membership'}</button>`;

    const d = ui.modal({ title: isEdit ? 'Membership' : 'New membership', body, footer, wide: true });
    const f = d.querySelector('form');
    const el = (n) => f.elements[n];
    const sug = f.querySelector('[data-suggest]'), hint = f.querySelector('[data-custhint]'), clashBox = f.querySelector('[data-clash]');
    d.addEventListener('close', () => { if (changed && onSaved) onSaved(); });

    const planById = (id) => s.plans.find((p) => p.id === id);

    // initial values
    if (isEdit) {
      el('name').value = m.customerName || '';
      el('phone').value = m.phone || '';
      el('planId').value = m.planId;
      el('start').value = m.start;
      el('end').value = m.end;
      el('price').value = m.price;
      el('status').value = m.status || 'active';
      el('notes').value = m.notes || '';
    } else {
      const c = customerId && App.state.customers.find((x) => x.id === customerId);
      if (c) { el('name').value = c.name; el('phone').value = c.phone || ''; }
      if (opts.planId && plans.some((p) => p.id === opts.planId)) el('planId').value = opts.planId;
      el('start').value = opts.start || U.today();
    }

    function applyPlan() {
      const p = planById(el('planId').value);
      if (!p) return;
      if (!endTouched && U.isDate(el('start').value)) el('end').value = App.planEnd(el('start').value, p);
      if (!priceTouched) el('price').value = p.price;
    }

    // Other memberships of the same customer that overlap these dates
    let others = [];
    async function loadOthers() {
      try { others = (await App.store.read([P.memberships]))[P.memberships]; } catch (_) { others = []; }
      checkOverlap();
    }
    function findOverlap(list, cid, start, end, selfId) {
      return list.find((x) => x.id !== selfId && x.customerId === cid && x.status !== 'cancelled' && x.start <= end && start <= x.end);
    }
    function checkOverlap() {
      const msg = problem();
      clashBox.hidden = !msg;
      clashBox.textContent = msg || '';
    }
    function problem() {
      const start = el('start').value, end = el('end').value;
      if (!U.isDate(start) || !U.isDate(end)) return 'Choose the start and end dates.';
      if (end < start) return 'The end date is before the start date.';
      if (isEdit && el('status').value === 'cancelled') return null;
      const o = customerId && findOverlap(others, customerId, start, end, isEdit ? m.id : null);
      if (o) return `${o.customerName} already has “${o.planName}” from ${U.fmtDate(o.start)} to ${U.fmtDate(o.end)}. Start this one on ${U.fmtDate(U.addDays(o.end, 1))} or later.`;
      return null;
    }

    // customer search
    function showHint() {
      if (customerId) {
        const c = App.state.customers.find((x) => x.id === customerId);
        hint.textContent = c ? 'Existing customer' : '';
      } else hint.textContent = el('name').value.trim() ? 'New customer — will be added to Customers when you save.' : '';
    }
    function suggest(q) {
      q = q.trim().toLowerCase();
      const qd = q.replace(/\D/g, '');
      if (q.length < 2) { sug.hidden = true; return; }
      const list = App.state.customers.filter((c) => (qd.length >= 2 && U.normPhone(c.phone).includes(qd)) || (c.name || '').toLowerCase().includes(q)).slice(0, 6);
      if (!list.length) { sug.hidden = true; return; }
      sug.innerHTML = list.map((c) => `<button type="button" class="sug-item" data-cid="${U.esc(c.id)}"><strong>${U.esc(c.name)}</strong><span>${U.esc(c.phone || 'no phone')}</span></button>`).join('');
      sug.hidden = false;
    }
    ['phone', 'name'].forEach((n) => {
      el(n).addEventListener('input', () => { customerId = null; suggest(el(n).value); showHint(); checkOverlap(); });
      el(n).addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 200));
    });
    sug.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cid]');
      const c = b && App.state.customers.find((x) => x.id === b.dataset.cid);
      if (!c) return;
      customerId = c.id;
      el('name').value = c.name;
      el('phone').value = c.phone || '';
      sug.hidden = true;
      showHint();
      checkOverlap();
    });
    function resolveCustomer(customers, name, phone) {
      let c = customerId ? customers.find((x) => x.id === customerId) : null;
      const np = U.normPhone(phone);
      if (!c && np.length >= 6) c = customers.find((x) => U.normPhone(x.phone) === np);
      if (!c) { c = { id: U.id('cus'), name, phone, type: 'member', notes: '', createdAt: U.nowIso() }; customers.push(c); }
      c.type = 'member';
      return c;
    }

    el('planId').addEventListener('change', () => { endTouched = false; priceTouched = false; applyPlan(); checkOverlap(); });
    el('start').addEventListener('change', () => { endTouched = false; applyPlan(); checkOverlap(); });
    el('end').addEventListener('change', () => { endTouched = true; checkOverlap(); });
    el('price').addEventListener('input', () => { priceTouched = true; });
    if (isEdit) el('status').addEventListener('change', checkOverlap);
    else f.querySelector('[data-full]').addEventListener('click', () => { el('payAmount').value = el('price').value; });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = el('name').value.trim(), phone = el('phone').value.trim();
      if (!name) { ui.toast('Enter the member name.', 'error'); el('name').focus(); return; }
      const err = problem();
      if (err) { ui.toast(err, 'error', 7000); return; }
      const plan = planById(el('planId').value);
      const v = {
        planId: el('planId').value,
        planName: plan ? plan.name : (m && m.planName) || '',
        start: el('start').value, end: el('end').value,
        price: U.round2(el('price').value),
        notes: el('notes').value.trim(),
      };
      if (v.price < 0) { ui.toast('Price cannot be negative.', 'error'); return; }
      try {
        await ui.busy(f.querySelector('[data-save]'), () => (isEdit ? saveEdit(v, name, phone) : saveNew(v, name, phone)));
        changed = true;
        ui.toast(isEdit ? 'Membership updated' : 'Membership saved', 'success');
        d.close();
      } catch (ex) { ui.err(ex); loadOthers(); }
    });

    async function saveNew(v, name, phone) {
      const payAmt = Math.max(0, U.round2(el('payAmount').value));
      const method = el('payMethod').value;
      const today = U.today(), pp = P.payments(U.monthKey(today));
      const paths = [P.memberships, P.customers];
      if (payAmt > 0) paths.push(pp);
      const data = await App.store.transact(paths, (data) => {
        const c = resolveCustomer(data[P.customers], name, phone);
        const o = findOverlap(data[P.memberships], c.id, v.start, v.end, null);
        if (o) throw new Error(`${c.name} already has a membership from ${U.fmtDate(o.start)} to ${U.fmtDate(o.end)}. Use Renew on it, or change the dates.`);
        const now = U.nowIso();
        const rec = Object.assign({ id: U.id('mem'), customerId: c.id, customerName: c.name, phone: c.phone || phone }, v,
          { paid: 0, payments: [], status: 'active', renewedFrom: opts.renewedFrom || null, createdAt: now, updatedAt: now });
        if (payAmt > 0) {
          const p = { id: U.id('pay'), date: today, amount: payAmt, method, type: 'membership', membershipId: rec.id,
            customerId: c.id, customerName: c.name, note: `Membership · ${v.planName}`, createdAt: now };
          data[pp].push(p);
          rec.payments.push({ id: p.id, date: today, amount: payAmt, method });
          rec.paid = payAmt;
        }
        data[P.memberships].push(rec);
      }, `New membership ${v.planName} for ${name} (${v.start} to ${v.end})`);
      App.state.customers = data[P.customers];
    }

    async function saveEdit(v, name, phone) {
      const status = el('status').value;
      const data = await App.store.transact([P.memberships, P.customers], (data) => {
        const cur = data[P.memberships].find((x) => x.id === m.id);
        if (!cur) throw new Error('This membership was removed on another device. Press refresh (↻).');
        if (name !== cur.customerName || phone !== (cur.phone || '') || customerId !== cur.customerId) {
          const c = resolveCustomer(data[P.customers], name, phone);
          Object.assign(cur, { customerId: c.id, customerName: c.name, phone: c.phone || phone });
        }
        if (status !== 'cancelled') {
          const o = findOverlap(data[P.memberships], cur.customerId, v.start, v.end, cur.id);
          if (o) throw new Error(`This overlaps another membership (${U.fmtDate(o.start)} – ${U.fmtDate(o.end)}).`);
        }
        Object.assign(cur, v, { status, updatedAt: U.nowIso() });
      }, `Update membership of ${name}`);
      App.state.customers = data[P.customers];
    }

    if (isEdit) {
      const renderPayments = () => {
        const box = f.querySelector('[data-payments]');
        const pays = m.payments || [];
        const due = App.memberDue(m);
        box.innerHTML = `
          <h3>Payments</h3>
          ${pays.length ? `<ul class="pay-list">${pays.map((p) => `<li>
              <span>${U.fmtDate(p.date, { day: 'numeric', month: 'short' })}</span><span>${U.esc(App.methodLabel(p.method))}</span>
              <strong>${U.money(p.amount)}</strong>
              <button type="button" class="icon-btn" data-delpay="${U.esc(p.id)}" aria-label="Remove this payment" title="Remove this payment">✕</button></li>`).join('')}</ul>`
            : '<p class="muted">No payments yet.</p>'}
          <p class="pay-sum">Paid ${U.money(m.paid)} of ${U.money(m.price)} ·
            <strong class="${due > 0 ? 'txt-warn' : 'txt-ok'}">${due > 0 ? 'Due ' + U.money(due) : 'Fully paid'}</strong></p>
          <div class="form-grid g4 addpay">
            <label>Amount<input type="number" name="newPay" min="0" step="any" value="${due}"></label>
            <label>Method<select name="newPayMethod">${methodOpts}</select></label>
            <label>Date<input type="date" name="newPayDate" value="${U.today()}"></label>
            <div class="btn-cell"><button type="button" class="btn" data-addpay>Add payment</button></div>
          </div>`;
      };

      const addPayment = async (btn) => {
        const amt = U.round2(el('newPay').value), method = el('newPayMethod').value, date = el('newPayDate').value;
        if (!(amt > 0)) { ui.toast('Enter the payment amount.', 'error'); return; }
        if (!U.isDate(date)) { ui.toast('Choose the payment date.', 'error'); return; }
        const pp = P.payments(U.monthKey(date));
        try {
          const data = await ui.busy(btn, () => App.store.transact([P.memberships, pp], (data) => {
            const cur = data[P.memberships].find((x) => x.id === m.id);
            if (!cur) throw new Error('This membership was removed on another device.');
            const p = { id: U.id('pay'), date, amount: amt, method, type: 'membership', membershipId: cur.id,
              customerId: cur.customerId, customerName: cur.customerName, note: `Membership · ${cur.planName}`, createdAt: U.nowIso() };
            data[pp].push(p);
            cur.payments = (cur.payments || []).concat({ id: p.id, date, amount: amt, method });
            cur.paid = U.round2(U.sum(cur.payments, (x) => x.amount));
            cur.updatedAt = U.nowIso();
          }, `Membership payment ${amt} ${method} from ${m.customerName}`));
          m = data[P.memberships].find((x) => x.id === m.id);
          changed = true;
          renderPayments();
          ui.toast('Payment added', 'success');
        } catch (ex) { ui.err(ex); }
      };

      const removePayment = async (btn, id) => {
        const p = (m.payments || []).find((x) => x.id === id);
        if (!p) return;
        if (!(await ui.confirm(`Remove the ${U.money(p.amount)} ${App.methodLabel(p.method)} payment from ${U.fmtDate(p.date)}?`, { okText: 'Remove', danger: true }))) return;
        const pp = P.payments(U.monthKey(p.date));
        try {
          const data = await ui.busy(btn, () => App.store.transact([P.memberships, pp], (data) => {
            const cur = data[P.memberships].find((x) => x.id === m.id);
            if (!cur) throw new Error('This membership was removed on another device.');
            cur.payments = (cur.payments || []).filter((x) => x.id !== id);
            cur.paid = U.round2(U.sum(cur.payments, (x) => x.amount));
            cur.updatedAt = U.nowIso();
            data[pp] = data[pp].filter((x) => x.id !== id);
          }, `Remove membership payment ${p.amount} from ${m.customerName}`), '');
          m = data[P.memberships].find((x) => x.id === m.id);
          changed = true;
          renderPayments();
          ui.toast('Payment removed', 'success');
        } catch (ex) { ui.err(ex); }
      };

      f.addEventListener('click', (e) => {
        const add = e.target.closest('[data-addpay]');
        if (add) { addPayment(add); return; }
        const del = e.target.closest('[data-delpay]');
        if (del) removePayment(del, del.dataset.delpay);
      });
      f.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.closest('.addpay')) { e.preventDefault(); addPayment(f.querySelector('[data-addpay]')); }
      });

      f.querySelector('[data-renew]').addEventListener('click', () => {
        const next = U.addDays(m.end, 1);
        const start = next > U.today() ? next : U.today();
        const cb = onSaved;
        const wasChanged = changed;
        changed = false;
        d.close();
        if (wasChanged && cb) cb();
        App.openMembershipModal({ customerId: m.customerId, planId: m.planId, start, renewedFrom: m.id }, cb);
      });

      f.querySelector('[data-delete]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if ((m.payments || []).length) {
          ui.toast('This membership has payments. Remove them first, or set the status to Cancelled to keep a record.', 'error', 7000);
          return;
        }
        if (!(await ui.confirm('Delete this membership? To keep a record of it, set the status to Cancelled instead.', { okText: 'Delete', danger: true }))) return;
        try {
          await ui.busy(btn, () => App.store.transact([P.memberships], (data) => {
            const cur = data[P.memberships].find((x) => x.id === m.id);
            if (cur && (cur.payments || []).length) throw new Error('A payment was just added on another device, so it was not deleted.');
            data[P.memberships] = data[P.memberships].filter((x) => x.id !== m.id);
          }, `Delete membership of ${m.customerName}`), 'Deleting…');
          changed = true;
          ui.toast('Membership deleted', 'success');
          d.close();
        } catch (ex) { ui.err(ex); }
      });

      renderPayments();
    } else {
      applyPlan();
    }
    showHint();
    loadOthers();
    if (!isEdit && !customerId) setTimeout(() => el('phone').focus(), 50);
  };

  App.views.members = V;
})(window.App);
