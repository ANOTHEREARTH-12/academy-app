(function (App) {
  'use strict';
  const U = App.U, ui = App.ui, P = App.paths;
  App.views = App.views || {};
  const V = { mode: 'day', date: U.today(), month: U.monthKey(U.today()), pays: [], bookings: [], seq: 0 };

  V.mk = () => (V.mode === 'day' ? U.monthKey(V.date) : V.month);

  V.render = async function (root) {
    V.root = root;
    root.innerHTML = `
      <section class="toolbar">
        <h1>Collections</h1><span class="spacer"></span>
        <div class="seg" role="group" aria-label="Period">
          <button type="button" data-mode="day">Day</button><button type="button" data-mode="month">Month</button>
        </div>
        <input type="date" data-day aria-label="Day">
        <input type="month" data-month aria-label="Month">
        <button type="button" class="btn ghost" data-csv>Export CSV</button>
        <button type="button" class="btn primary" data-other>+ Other income</button>
      </section>
      <section class="stats" data-stats></section>
      <section class="card"><h2 data-ptitle>Payments received</h2><div data-pays><div class="loading">Loading…</div></div></section>
      <section class="card"><h2 data-dtitle>Unpaid bookings</h2><div data-dues></div></section>`;

    const dayIn = root.querySelector('[data-day]'), monIn = root.querySelector('[data-month]');
    dayIn.value = V.date;
    monIn.value = V.month;
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { V.mode = b.dataset.mode; V.load(); }));
    dayIn.addEventListener('change', () => { if (U.isDate(dayIn.value)) { V.date = dayIn.value; V.load(); } });
    monIn.addEventListener('change', () => { if (U.isMonth(monIn.value)) { V.month = monIn.value; V.load(); } });
    root.querySelector('[data-csv]').addEventListener('click', exportCsv);
    root.querySelector('[data-other]').addEventListener('click', () => editOther(null));
    root.querySelector('[data-pays]').addEventListener('click', openFromPayment);
    root.querySelector('[data-dues]').addEventListener('click', (e) => {
      const r = e.target.closest('[data-bid]');
      if (!r) return;
      const b = V.bookings.find((x) => x.id === r.dataset.bid);
      if (b) App.openBookingModal({ booking: b, monthKey: V.mk(), monthBookings: V.bookings }, () => V.load());
    });
    await V.load();
  };

  V.load = async function () {
    const seq = ++V.seq;
    V.root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === V.mode));
    V.root.querySelector('[data-day]').hidden = V.mode !== 'day';
    V.root.querySelector('[data-month]').hidden = V.mode !== 'month';
    const mk = V.mk();
    try {
      const r = await App.store.read([P.payments(mk), P.bookings(mk)]);
      if (seq !== V.seq) return;
      V.pays = r[P.payments(mk)];
      V.bookings = r[P.bookings(mk)];
    } catch (e) {
      if (seq !== V.seq) return;
      V.root.querySelector('[data-pays]').innerHTML = `<div class="error-box">${U.esc(e.message)}</div>`;
      return;
    }
    V.draw();
  };

  V.visiblePays = () => (V.mode === 'day' ? V.pays.filter((p) => p.date === V.date) : V.pays.slice())
    .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));

  function forText(p) {
    if (p.type === 'booking') {
      const [st] = String(p.slot || '').split('-');
      return `${App.courtName(p.courtId)} · ${U.fmtDate(p.bookingDate, { day: 'numeric', month: 'short' })}${st ? ' ' + U.fmt12(st) : ''}`;
    }
    if (p.type === 'other') return [p.category, p.note].filter(Boolean).join(' · ');
    return p.note || p.type || '';
  }

  const OTHER_CATS = ['Coaching fees', 'Shuttle & equipment sales', 'Tournament / event fees', 'Sponsorship', 'Other income'];

  function editOther(x) {
    const isEdit = !!x;
    const cats = OTHER_CATS.slice();
    if (isEdit && x.category && !cats.includes(x.category)) cats.push(x.category);
    const d = ui.modal({
      title: isEdit ? 'Other income' : 'Add other income',
      body: `
        <div class="form-grid g2">
          <label>Date<input type="date" name="date" required></label>
          <label>Type<select name="category">${cats.map((c) => `<option>${U.esc(c)}</option>`).join('')}</select></label>
          <label>Amount (${U.esc(App.state.settings.currency)})<input type="number" name="amount" min="0" step="any" required></label>
          <label>Method<select name="method">${App.METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        </div>
        <label>Received from<input name="from" maxlength="80" placeholder="Optional"></label>
        <label>Details<input name="note" maxlength="200" placeholder="Optional — e.g. 3 boxes of shuttles"></label>
        <p class="hint">Court bookings and memberships are recorded on their own screens. Use this for any other money received.</p>`,
      footer: `${isEdit ? '<button type="button" class="btn danger ghost" data-del>Delete</button>' : ''}
        <span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancel</button>
        <button type="submit" class="btn primary" data-save>Save</button>`,
    });
    const f = d.querySelector('form');
    const el = (n) => f.elements[n];
    if (isEdit) {
      el('date').value = x.date; el('category').value = x.category || 'Other income'; el('amount').value = x.amount;
      el('method').value = x.method; el('from').value = x.customerName || ''; el('note').value = x.note || '';
    } else el('date').value = V.mode === 'day' ? V.date : (V.month === U.monthKey(U.today()) ? U.today() : V.month + '-01');
    setTimeout(() => el('amount').focus(), 50);

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = { date: el('date').value, category: el('category').value, amount: U.round2(el('amount').value),
        method: el('method').value, customerName: el('from').value.trim(), note: el('note').value.trim() };
      if (!U.isDate(v.date)) { ui.toast('Choose the date.', 'error'); return; }
      if (!(v.amount > 0)) { ui.toast('Enter the amount.', 'error'); return; }
      const newP = P.payments(U.monthKey(v.date));
      const oldP = isEdit ? P.payments(U.monthKey(x.date)) : newP;
      try {
        await ui.busy(f.querySelector('[data-save]'), () => App.store.transact([...new Set([oldP, newP])], (data) => {
          if (isEdit) {
            const i = data[oldP].findIndex((y) => y.id === x.id);
            if (i < 0) throw new Error('This entry was removed on another device. Press refresh (↻).');
            const upd = Object.assign({}, data[oldP][i], v, { updatedAt: U.nowIso() });
            data[oldP].splice(i, 1);
            data[newP].push(upd);
          } else {
            data[newP].push(Object.assign({ id: U.id('pay'), type: 'other' }, v, { createdAt: U.nowIso() }));
          }
        }, `${isEdit ? 'Update' : 'Add'} other income ${v.category} ${v.amount} on ${v.date}`));
        ui.toast('Saved', 'success');
        d.close();
        V.load();
      } catch (ex) { ui.err(ex); }
    });

    if (isEdit) {
      f.querySelector('[data-del]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!(await ui.confirm(`Delete this ${U.money(x.amount)} ${x.category || 'income'} entry?`, { okText: 'Delete', danger: true }))) return;
        const p = P.payments(U.monthKey(x.date));
        try {
          await ui.busy(btn, () => App.store.transact([p], (data) => {
            data[p] = data[p].filter((y) => y.id !== x.id);
          }, `Delete other income ${x.amount} on ${x.date}`), 'Deleting…');
          ui.toast('Deleted', 'success');
          d.close();
          V.load();
        } catch (ex) { ui.err(ex); }
      });
    }
  }

  V.draw = function () {
    const pays = V.visiblePays();
    const label = V.mode === 'day' ? U.fmtDate(V.date) : U.fmtMonth(V.month);
    const by = (m) => U.sum(pays.filter((p) => p.method === m), (p) => p.amount);
    const total = U.sum(pays, (p) => p.amount);

    V.root.querySelector('[data-stats]').innerHTML = `
      <div class="stat"><span>Total collected</span><strong class="txt-ok">${U.money(total)}</strong></div>
      <div class="stat"><span>Cash</span><strong>${U.money(by('cash'))}</strong></div>
      <div class="stat"><span>UPI</span><strong>${U.money(by('upi'))}</strong></div>
      <div class="stat"><span>Card</span><strong>${U.money(by('card'))}</strong></div>
      <div class="stat"><span>Other</span><strong>${U.money(by('other'))}</strong></div>`;

    V.root.querySelector('[data-ptitle]').textContent = `Payments received · ${label}`;
    V.root.querySelector('[data-pays]').innerHTML = pays.length ? `
      <table class="table">
        <thead><tr>${V.mode === 'month' ? '<th>Date</th>' : ''}<th>Customer</th><th class="hide-sm">For</th><th>Method</th><th class="num">Amount</th></tr></thead>
        <tbody>${pays.map((p) => `<tr${p.bookingId ? ` data-pid="${U.esc(p.id)}" tabindex="0"` : p.type === 'other' ? ` data-oid="${U.esc(p.id)}" tabindex="0"` : ''}>
          ${V.mode === 'month' ? `<td>${U.fmtDate(p.date, { day: 'numeric', month: 'short' })}</td>` : ''}
          <td>${U.esc(p.customerName || '')}</td><td class="hide-sm muted">${U.esc(forText(p))}</td>
          <td>${U.esc(App.methodLabel(p.method))}</td><td class="num">${U.money(p.amount)}</td></tr>`).join('')}</tbody>
        <tfoot><tr>${V.mode === 'month' ? '<td></td>' : ''}<td colspan="2" class="hide-sm-span">Total</td><td class="num" colspan="2">${U.money(total)}</td></tr></tfoot>
      </table>` : `<div class="empty">No payments received ${V.mode === 'day' ? 'on this day' : 'in this month'}.</div>`;

    // Unpaid bookings in the month (up to the chosen day in Day view)
    const mk = V.mk();
    const dues = V.bookings.filter((b) => App.bookingDue(b) > 0 && (V.mode === 'month' || b.date <= V.date));
    const dueTotal = U.sum(dues, App.bookingDue);
    V.root.querySelector('[data-dtitle]').textContent = V.mode === 'day'
      ? `Unpaid bookings · ${U.fmtMonth(mk)}, up to ${U.fmtDate(V.date, { day: 'numeric', month: 'short' })}`
      : `Unpaid bookings · ${U.fmtMonth(mk)}`;
    V.root.querySelector('[data-dues]').innerHTML = dues.length ? `
      <table class="table">
        <thead><tr><th>Date</th><th>Time</th><th class="hide-sm">Court</th><th>Customer</th><th class="num">Due</th></tr></thead>
        <tbody>${dues.map((b) => `<tr data-bid="${U.esc(b.id)}" tabindex="0">
          <td>${U.fmtDate(b.date, { day: 'numeric', month: 'short' })}</td><td>${U.fmt12(b.start)}</td>
          <td class="hide-sm">${U.esc(App.courtName(b.courtId))}</td><td>${U.esc(b.customerName)}${b.status === 'no-show' ? ' <span class="tag noshow">No-show</span>' : ''}</td>
          <td class="num txt-warn">${U.money(App.bookingDue(b))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3" class="hide-sm-span">Total due</td><td></td><td class="num">${U.money(dueTotal)}</td></tr></tfoot>
      </table>
      <p class="hint">Tap a booking to record a payment.</p>` : '<div class="empty">No unpaid bookings. 🎉</div>';
  };

  async function openFromPayment(e) {
    const o = e.target.closest('[data-oid]');
    if (o) { const x = V.pays.find((y) => y.id === o.dataset.oid); if (x) editOther(x); return; }
    const r = e.target.closest('[data-pid]');
    if (!r) return;
    const p = V.pays.find((x) => x.id === r.dataset.pid);
    if (!p || !p.bookingId) return;
    const mk = U.monthKey(p.bookingDate || p.date);
    try {
      const list = mk === V.mk() ? V.bookings : (await App.store.read([P.bookings(mk)]))[P.bookings(mk)];
      const b = list.find((x) => x.id === p.bookingId);
      if (!b) { ui.toast('That booking no longer exists.', 'error'); return; }
      App.openBookingModal({ booking: b, monthKey: mk, monthBookings: list }, () => V.load());
    } catch (ex) { ui.err(ex); }
  }

  function csvCell(v) {
    if (typeof v === 'number') return String(v);
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    const pays = V.visiblePays().reverse();
    if (!pays.length) { ui.toast('Nothing to export for this period.', 'info'); return; }
    const rows = [['Payment date', 'Customer', 'Method', 'Amount', 'Booking date', 'Court', 'Time', 'Note']];
    pays.forEach((p) => {
      const [st, en] = String(p.slot || '').split('-');
      rows.push([p.date, p.customerName || '', App.methodLabel(p.method), U.num(p.amount), p.bookingDate || '',
        p.courtId ? App.courtName(p.courtId) : '', st ? `${st}-${en}` : '', p.note || '']);
    });
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `collections-${V.mode === 'day' ? V.date : V.month}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  App.views.collections = V;
})(window.App);
