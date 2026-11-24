(function (App) {
  'use strict';
  const U = App.U, ui = App.ui, P = App.paths;

  App.METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['other', 'Other']];
  App.methodLabel = (m) => (App.METHODS.find((x) => x[0] === m) || [m, m])[1];
  App.STATE_LABEL = { paid: 'Paid', partial: 'Part paid', due: 'Unpaid', noshow: 'No-show', cancelled: 'Cancelled' };

  App.bookingState = (b) => {
    if (b.status === 'cancelled') return 'cancelled';
    if (b.status === 'no-show') return 'noshow';
    const paid = U.num(b.paid);
    if (paid >= U.num(b.amount)) return 'paid';
    return paid > 0 ? 'partial' : 'due';
  };
  App.bookingDue = (b) => (b.status === 'cancelled' ? 0 : Math.max(0, U.round2(U.num(b.amount) - U.num(b.paid))));

  App.findClash = (list, b) => {
    const s = U.toMin(b.start), e = U.toMin(b.end);
    return list.find((x) => x.id !== b.id && x.status !== 'cancelled' && x.date === b.date &&
      x.courtId === b.courtId && U.toMin(x.start) < e && s < U.toMin(x.end));
  };

  App.courtName = (id) => {
    const c = (App.state.settings.courts || []).find((x) => x.id === id);
    return c ? c.name : 'Unknown court';
  };

  const sortBookings = (list) => list.sort((a, b) => (a.date + a.start + a.courtId).localeCompare(b.date + b.start + b.courtId));
  const notFound = () => new Error('This booking was changed or removed on another device. Press refresh (↻) and try again.');

  /**
   * Opens the booking form.
   *  - New booking: opts = { date, courtId, start, monthKey?, monthBookings? }
   *  - Existing:    opts = { booking, monthKey?, monthBookings? }
   * onSaved() runs after the modal closes if anything was saved.
   */
  App.openBookingModal = function (opts, onSaved) {
    const s = App.state.settings;
    const step = s.slotMinutes;
    const isEdit = !!opts.booking;
    let booking = isEdit ? JSON.parse(JSON.stringify(opts.booking)) : null;
    let customerId = isEdit ? booking.customerId : null;
    let amountTouched = isEdit;
    let changed = false;
    let dayList = [];
    const monthCache = {};
    if (opts.monthKey && opts.monthBookings) monthCache[opts.monthKey] = opts.monthBookings;

    const init = isEdit
      ? { date: booking.date, courtId: booking.courtId, start: booking.start, dur: U.toMin(booking.end) - U.toMin(booking.start) }
      : { date: opts.date, courtId: opts.courtId, start: opts.start, dur: step };

    const courtOpts = s.courts.filter((c) => c.active || c.id === init.courtId)
      .map((c) => `<option value="${U.esc(c.id)}">${U.esc(c.name)}${c.active ? '' : ' (inactive)'}</option>`).join('');
    const methodOpts = App.METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    const body = `
      <div class="form-grid g4">
        <label>Date<input type="date" name="date" required></label>
        <label>Court<select name="courtId">${courtOpts}</select></label>
        <label>Start<select name="start"></select></label>
        <label>Duration<select name="duration"></select></label>
      </div>
      <div class="clash" data-clash hidden></div>
      <div class="cust">
        <div class="form-grid g2">
          <label>Phone<input name="phone" inputmode="tel" placeholder="Type to search customers"></label>
          <label>Name<input name="name" required placeholder="Customer name"></label>
        </div>
        <div class="suggest" data-suggest hidden></div>
        <div class="hint" data-custhint></div>
      </div>
      <div class="form-grid g2">
        <label>Amount (${U.esc(s.currency)})<span class="inline"><input type="number" name="amount" min="0" step="any" required>
          <button type="button" class="btn ghost sm" data-rate title="Use the rate from Settings">Use rate</button></span></label>
        ${isEdit ? `<label>Status<select name="status"><option value="booked">Booked</option><option value="no-show">No-show</option><option value="cancelled">Cancelled</option></select></label>` : ''}
      </div>
      <label>Notes<textarea name="notes" rows="2" placeholder="Optional"></textarea></label>
      ${isEdit ? '<section class="pay-section" data-payments></section>' : `
      <fieldset class="paynow"><legend>Payment received now</legend>
        <div class="form-grid g2">
          <label>Amount paid<span class="inline"><input type="number" name="payAmount" min="0" step="any" value="0">
            <button type="button" class="btn ghost sm" data-full>Full</button></span></label>
          <label>Method<select name="payMethod">${methodOpts}</select></label>
        </div>
      </fieldset>`}`;

    const footer = `${isEdit ? '<button type="button" class="btn danger ghost" data-delete>Delete</button>' : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-close>Close</button>
      <button type="submit" class="btn primary" data-save>${isEdit ? 'Save changes' : 'Save booking'}</button>`;

    const d = ui.modal({ title: isEdit ? 'Booking' : 'New booking', body, footer, wide: true });
    const f = d.querySelector('form');
    const el = (n) => f.elements[n];
    const sug = f.querySelector('[data-suggest]');
    const hint = f.querySelector('[data-custhint]');
    const clashBox = f.querySelector('[data-clash]');

    d.addEventListener('close', () => { if (changed && onSaved) onSaved(); });

    el('date').value = init.date;
    el('courtId').value = init.courtId;
    if (isEdit) {
      el('phone').value = booking.phone || '';
      el('name').value = booking.customerName || '';
      el('amount').value = booking.amount;
      el('status').value = booking.status || 'booked';
      el('notes').value = booking.notes || '';
    }

    async function bookingsFor(date) {
      const mk = U.monthKey(date);
      if (!monthCache[mk]) {
        const r = await App.store.read([P.bookings(mk)]);
        monthCache[mk] = r[P.bookings(mk)];
      }
      return monthCache[mk];
    }

    function current() {
      const start = el('start').value;
      const dur = U.num(el('duration').value);
      return {
        id: isEdit ? booking.id : null,
        date: el('date').value,
        courtId: el('courtId').value,
        start,
        end: start ? U.toTime(U.toMin(start) + dur) : '',
      };
    }

    function problem(v) {
      if (!U.isDate(v.date)) return 'Choose a date.';
      if (!v.start || !(U.toMin(v.end) > U.toMin(v.start))) return 'Choose a start time and duration.';
      const timeChanged = !isEdit || v.date !== booking.date || v.start !== booking.start || v.end !== booking.end || v.courtId !== booking.courtId;
      if (timeChanged && U.toMin(v.end) > s.closeHour * 60) return `This goes past closing time (${U.fmt12(s.closeHour * 60)}).`;
      if (isEdit && el('status').value === 'cancelled') return null;
      const c = App.findClash(dayList, v);
      if (c) return `${App.courtName(v.courtId)} is already booked ${U.fmt12(c.start)} – ${U.fmt12(c.end)} by ${c.customerName}.`;
      return null;
    }

    function updateClash() {
      const msg = problem(current());
      clashBox.hidden = !msg;
      clashBox.textContent = msg || '';
    }

    function rateAmount() {
      const v = current();
      if (!v.start || !U.isDate(v.date)) return 0;
      return App.pricing.amount(s, v.date, U.toMin(v.start), U.toMin(v.end));
    }
    function updateAmount() { if (!amountTouched) el('amount').value = rateAmount(); }

    // Rebuild the start and duration lists for the chosen date and court.
    async function refreshTimes(preferStart, preferDur) {
      const date = el('date').value;
      if (!U.isDate(date)) return;
      try { dayList = (await bookingsFor(date)).filter((b) => b.date === date); }
      catch (e) { ui.err(e); dayList = []; }
      if (!d.isConnected) return;

      const court = el('courtId').value;
      const busy = dayList.filter((b) => b.status !== 'cancelled' && b.courtId === court && (!isEdit || b.id !== booking.id));
      const taken = (m) => busy.some((b) => U.toMin(b.start) <= m && m < U.toMin(b.end));
      const slots = App.pricing.slots(s);

      const wantStart = preferStart || el('start').value;
      const startOpts = slots.map((m) => `<option value="${U.toTime(m)}">${U.fmt12(m)}${taken(m) ? ' — booked' : ''}</option>`);
      if (wantStart && !slots.includes(U.toMin(wantStart))) startOpts.unshift(`<option value="${U.esc(wantStart)}">${U.fmt12(wantStart)}</option>`);
      el('start').innerHTML = startOpts.join('');
      if (wantStart) el('start').value = wantStart;
      if (!el('start').value && slots.length) el('start').value = U.toTime(slots[0]);

      const startMin = U.toMin(el('start').value);
      const close = s.closeHour * 60;
      const nextBusy = busy.map((b) => U.toMin(b.start)).filter((m) => m > startMin).sort((a, b) => a - b)[0];
      const limit = Math.min(close, nextBusy == null ? close : nextBusy);
      const durs = [];
      for (let m = step; startMin + m <= limit; m += step) durs.push(m);

      let dur = preferDur != null ? preferDur : U.num(el('duration').value) || step;
      if (!durs.includes(dur)) {
        if (preferDur != null || !durs.length) durs.push(dur); // keep it so the problem is shown
        else dur = durs.filter((m) => m <= dur).pop() || durs[0];
      }
      durs.sort((a, b) => a - b);
      el('duration').innerHTML = durs.map((m) => `<option value="${m}">${U.fmtDuration(m)}</option>`).join('');
      el('duration').value = String(dur);
      updateClash();
      updateAmount();
    }

    // ---- customer search ----
    function showHint() {
      if (customerId) {
        const c = App.state.customers.find((x) => x.id === customerId);
        hint.textContent = c ? `Existing customer${c.type === 'member' ? ' · Member' : ''}` : '';
      } else {
        hint.textContent = el('name').value.trim() ? 'New customer — will be added to Customers when you save.' : '';
      }
    }
    function suggest(q) {
      q = q.trim().toLowerCase();
      const qd = q.replace(/\D/g, '');
      if (q.length < 2) { sug.hidden = true; return; }
      const list = App.state.customers.filter((c) =>
        (qd.length >= 2 && U.normPhone(c.phone).includes(qd)) || (c.name || '').toLowerCase().includes(q)).slice(0, 6);
      if (!list.length) { sug.hidden = true; return; }
      sug.innerHTML = list.map((c) => `<button type="button" class="sug-item" data-cid="${U.esc(c.id)}">
        <strong>${U.esc(c.name)}</strong><span>${U.esc(c.phone || 'no phone')}${c.type === 'member' ? ' · Member' : ''}</span></button>`).join('');
      sug.hidden = false;
    }
    ['phone', 'name'].forEach((n) => {
      el(n).addEventListener('input', () => { customerId = null; suggest(el(n).value); showHint(); });
      el(n).addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 200));
    });
    sug.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cid]');
      if (!b) return;
      const c = App.state.customers.find((x) => x.id === b.dataset.cid);
      if (!c) return;
      customerId = c.id;
      el('name').value = c.name;
      el('phone').value = c.phone || '';
      sug.hidden = true;
      showHint();
    });

    function resolveCustomer(customers, name, phone) {
      let c = customerId ? customers.find((x) => x.id === customerId) : null;
      const np = U.normPhone(phone);
      if (!c && np.length >= 6) c = customers.find((x) => U.normPhone(x.phone) === np);
      if (!c) {
        c = { id: U.id('cus'), name, phone, type: 'walk-in', notes: '', createdAt: U.nowIso() };
        customers.push(c);
      }
      return c;
    }

    function clashError(c, v) {
      const e = new Error(`${App.courtName(v.courtId)} was just booked ${U.fmt12(c.start)} – ${U.fmt12(c.end)} by ${c.customerName}. Choose another time.`);
      e.clash = true;
      return e;
    }

    // ---- wiring ----
    el('date').addEventListener('change', () => refreshTimes());
    el('courtId').addEventListener('change', () => refreshTimes());
    el('start').addEventListener('change', () => refreshTimes());
    el('duration').addEventListener('change', () => { updateClash(); updateAmount(); });
    el('amount').addEventListener('input', () => { amountTouched = true; });
    f.querySelector('[data-rate]').addEventListener('click', () => { amountTouched = false; updateAmount(); });
    if (isEdit) el('status').addEventListener('change', updateClash);
    else f.querySelector('[data-full]').addEventListener('click', () => { el('payAmount').value = el('amount').value; });

    async function saveNew(v, name, phone, amount, notes) {
      const bp = P.bookings(U.monthKey(v.date));
      const payAmt = Math.max(0, U.round2(el('payAmount').value));
      const method = el('payMethod').value;
      const today = U.today();
      const pp = P.payments(U.monthKey(today));
      const paths = [bp, P.customers];
      if (payAmt > 0) paths.push(pp);
      const court = App.courtName(v.courtId);

      const data = await App.store.transact(paths, (data) => {
        const list = data[bp];
        const clash = App.findClash(list, v);
        if (clash) throw clashError(clash, v);
        const c = resolveCustomer(data[P.customers], name, phone);
        const now = U.nowIso();
        const b = {
          id: U.id('bk'), date: v.date, courtId: v.courtId, start: v.start, end: v.end,
          customerId: c.id, customerName: c.name, phone: c.phone || phone,
          amount, paid: 0, payments: [], status: 'booked', notes, createdAt: now, updatedAt: now,
        };
        if (payAmt > 0) {
          const p = {
            id: U.id('pay'), date: today, amount: payAmt, method, type: 'booking',
            bookingId: b.id, bookingDate: b.date, courtId: b.courtId, slot: `${b.start}-${b.end}`,
            customerId: c.id, customerName: c.name, note: '', createdAt: now,
          };
          data[pp].push(p);
          b.payments.push({ id: p.id, date: p.date, amount: p.amount, method: p.method });
          b.paid = payAmt;
        }
        list.push(b);
        sortBookings(list);
      }, `Book ${court} ${v.date} ${v.start}-${v.end} for ${name}`);
      App.state.customers = data[P.customers];
    }

    async function saveEdit(v, name, phone, amount, notes) {
      const status = el('status').value;
      const oldP = P.bookings(U.monthKey(booking.date));
      const newP = P.bookings(U.monthKey(v.date));
      const payPaths = [...new Set((booking.payments || []).map((p) => P.payments(U.monthKey(p.date))))];
      const paths = [...new Set([oldP, newP, P.customers, ...payPaths])];

      const data = await App.store.transact(paths, (data) => {
        const oldList = data[oldP];
        const idx = oldList.findIndex((x) => x.id === booking.id);
        if (idx < 0) throw notFound();
        const cur = oldList[idx];
        const upd = Object.assign({}, cur, {
          date: v.date, courtId: v.courtId, start: v.start, end: v.end, amount, notes, status, updatedAt: U.nowIso(),
        });
        if (status !== 'cancelled') {
          const clash = App.findClash(data[newP], upd);
          if (clash) throw clashError(clash, upd);
        }
        if (name !== cur.customerName || phone !== (cur.phone || '') || customerId !== cur.customerId) {
          const c = resolveCustomer(data[P.customers], name, phone);
          upd.customerId = c.id;
          upd.customerName = c.name;
          upd.phone = c.phone || phone;
        }
        oldList.splice(idx, 1);
        data[newP].push(upd);
        sortBookings(data[newP]);
        // keep the payment ledger's booking details in step
        payPaths.forEach((pp) => data[pp].forEach((p) => {
          if (p.bookingId === upd.id) {
            Object.assign(p, { bookingDate: upd.date, courtId: upd.courtId, slot: `${upd.start}-${upd.end}`, customerId: upd.customerId, customerName: upd.customerName });
          }
        }));
      }, `Update booking ${v.date} ${v.start}-${v.end} (${name})`);
      App.state.customers = data[P.customers];
    }

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = current();
      const name = el('name').value.trim();
      const phone = el('phone').value.trim();
      const err = problem(v);
      if (err) { ui.toast(err, 'error', 6000); return; }
      if (!name) { ui.toast('Enter the customer name.', 'error'); el('name').focus(); return; }
      const amount = U.round2(el('amount').value);
      if (amount < 0) { ui.toast('Amount cannot be negative.', 'error'); return; }
      const notes = el('notes').value.trim();
      try {
        await ui.busy(f.querySelector('[data-save]'), () => (isEdit ? saveEdit : saveNew)(v, name, phone, amount, notes));
        changed = true;
        ui.toast(isEdit ? 'Booking updated' : 'Booking saved', 'success');
        d.close();
      } catch (ex) {
        ui.err(ex);
        if (ex.clash) { Object.keys(monthCache).forEach((k) => delete monthCache[k]); refreshTimes(); }
      }
    });

    // ---- existing booking: payments + delete ----
    if (isEdit) {
      const bp = () => P.bookings(U.monthKey(booking.date));

      const renderPayments = () => {
        const box = f.querySelector('[data-payments]');
        const pays = booking.payments || [];
        const due = App.bookingDue(booking);
        box.innerHTML = `
          <h3>Payments</h3>
          ${pays.length ? `<ul class="pay-list">${pays.map((p) => `<li>
              <span>${U.fmtDate(p.date, { day: 'numeric', month: 'short' })}</span>
              <span>${U.esc(App.methodLabel(p.method))}</span>
              <strong>${U.money(p.amount)}</strong>
              <button type="button" class="icon-btn" data-delpay="${U.esc(p.id)}" aria-label="Remove this payment" title="Remove this payment">✕</button>
            </li>`).join('')}</ul>` : '<p class="muted">No payments yet.</p>'}
          <p class="pay-sum">Paid ${U.money(booking.paid)} of ${U.money(booking.amount)} ·
            <strong class="${due > 0 ? 'txt-warn' : 'txt-ok'}">${due > 0 ? 'Due ' + U.money(due) : 'Fully paid'}</strong></p>
          <div class="form-grid g4 addpay">
            <label>Amount<input type="number" name="newPay" min="0" step="any" value="${due}"></label>
            <label>Method<select name="newPayMethod">${methodOpts}</select></label>
            <label>Date<input type="date" name="newPayDate" value="${U.today()}"></label>
            <div class="btn-cell"><button type="button" class="btn" data-addpay>Add payment</button></div>
          </div>`;
      };

      const addPayment = async (btn) => {
        const amt = U.round2(el('newPay').value);
        const method = el('newPayMethod').value;
        const date = el('newPayDate').value;
        if (!(amt > 0)) { ui.toast('Enter the payment amount.', 'error'); return; }
        if (!U.isDate(date)) { ui.toast('Choose the payment date.', 'error'); return; }
        const b0 = bp(), pp = P.payments(U.monthKey(date));
        try {
          const data = await ui.busy(btn, () => App.store.transact([b0, pp], (data) => {
            const b = data[b0].find((x) => x.id === booking.id);
            if (!b) throw notFound();
            const p = {
              id: U.id('pay'), date, amount: amt, method, type: 'booking',
              bookingId: b.id, bookingDate: b.date, courtId: b.courtId, slot: `${b.start}-${b.end}`,
              customerId: b.customerId, customerName: b.customerName, note: '', createdAt: U.nowIso(),
            };
            data[pp].push(p);
            b.payments = (b.payments || []).concat({ id: p.id, date, amount: amt, method });
            b.paid = U.round2(U.sum(b.payments, (x) => x.amount));
            b.updatedAt = U.nowIso();
          }, `Payment ${amt} ${method} from ${booking.customerName} for ${booking.date} ${booking.start}`));
          booking = data[b0].find((x) => x.id === booking.id);
          changed = true;
          renderPayments();
          ui.toast('Payment added', 'success');
        } catch (ex) { ui.err(ex); }
      };

      const removePayment = async (btn, id) => {
        const p = (booking.payments || []).find((x) => x.id === id);
        if (!p) return;
        const ok = await ui.confirm(`Remove the ${U.money(p.amount)} ${App.methodLabel(p.method)} payment from ${U.fmtDate(p.date)}?`, { okText: 'Remove', danger: true });
        if (!ok) return;
        const b0 = bp(), pp = P.payments(U.monthKey(p.date));
        try {
          const data = await ui.busy(btn, () => App.store.transact([b0, pp], (data) => {
            const b = data[b0].find((x) => x.id === booking.id);
            if (!b) throw notFound();
            b.payments = (b.payments || []).filter((x) => x.id !== id);
            b.paid = U.round2(U.sum(b.payments, (x) => x.amount));
            b.updatedAt = U.nowIso();
            data[pp] = data[pp].filter((x) => x.id !== id);
          }, `Remove payment ${p.amount} from ${booking.customerName}`), '');
          booking = data[b0].find((x) => x.id === booking.id);
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

      f.querySelector('[data-delete]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if ((booking.payments || []).length) {
          ui.toast('This booking has payments. Remove them first, or set the status to Cancelled to keep a record.', 'error', 7000);
          return;
        }
        if (!(await ui.confirm('Delete this booking? To keep a record of it, set the status to Cancelled instead.', { okText: 'Delete', danger: true }))) return;
        const b0 = bp();
        try {
          await ui.busy(btn, () => App.store.transact([b0], (data) => {
            const i = data[b0].findIndex((x) => x.id === booking.id);
            if (i < 0) return;
            if ((data[b0][i].payments || []).length) throw new Error('A payment was just added to this booking on another device, so it was not deleted.');
            data[b0].splice(i, 1);
          }, `Delete booking ${booking.date} ${booking.start}-${booking.end} (${booking.customerName})`), 'Deleting…');
          changed = true;
          ui.toast('Booking deleted', 'success');
          d.close();
        } catch (ex) { ui.err(ex); }
      });

      renderPayments();
    }

    showHint();
    refreshTimes(init.start, init.dur);
    if (!isEdit) setTimeout(() => el('phone').focus(), 50);
  };
})(window.App);
