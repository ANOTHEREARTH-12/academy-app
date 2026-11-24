(function (App) {
  'use strict';
  const U = App.U, P = App.paths;
  App.views = App.views || {};
  const V = { date: U.today(), month: [], monthKey: null, seq: 0 };

  V.render = async function (root) {
    V.root = root;
    root.innerHTML = `
      <section class="toolbar">
        <div class="date-nav">
          <button type="button" class="btn ghost icon" data-prev aria-label="Previous day">‹</button>
          <input type="date" data-date aria-label="Date">
          <button type="button" class="btn ghost icon" data-next aria-label="Next day">›</button>
          <button type="button" class="btn ghost sm" data-today>Today</button>
        </div>
        <h1 class="day-title" data-title></h1>
      </section>
      <section class="stats" data-stats></section>
      <section class="card grid-card">
        <div class="grid-scroll" data-grid><div class="loading">Loading bookings…</div></div>
        <div class="legend">
          <span><i class="dot due"></i>Unpaid</span><span><i class="dot partial"></i>Part paid</span>
          <span><i class="dot paid"></i>Paid</span><span><i class="dot noshow"></i>No-show</span>
          <span class="muted">Tap an empty slot to book</span>
        </div>
      </section>
      <section data-extra></section>`;

    const dateIn = root.querySelector('[data-date]');
    dateIn.value = V.date;
    dateIn.addEventListener('change', () => { if (U.isDate(dateIn.value)) V.go(dateIn.value); });
    root.querySelector('[data-prev]').addEventListener('click', () => V.go(U.addDays(V.date, -1)));
    root.querySelector('[data-next]').addEventListener('click', () => V.go(U.addDays(V.date, 1)));
    root.querySelector('[data-today]').addEventListener('click', () => V.go(U.today()));

    [root.querySelector('[data-grid]'), root.querySelector('[data-extra]')].forEach((box) => {
      box.addEventListener('click', onCell);
      box.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); onCell(e); }
      });
    });
    await V.load();
  };

  V.go = function (date) {
    V.date = date;
    const di = V.root.querySelector('[data-date]');
    if (di) di.value = date;
    V.load();
  };

  V.load = async function () {
    const seq = ++V.seq;
    const mk = U.monthKey(V.date);
    V.root.querySelector('[data-title]').textContent = U.fmtDate(V.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    try {
      const r = await App.store.read([P.bookings(mk)]);
      if (seq !== V.seq) return;
      V.monthKey = mk;
      V.month = r[P.bookings(mk)];
    } catch (e) {
      if (seq !== V.seq) return;
      V.root.querySelector('[data-grid]').innerHTML = `<div class="error-box">${U.esc(e.message)}</div>`;
      return;
    }
    V.draw();
  };

  function onCell(e) {
    const t = e.target.closest('[data-bid],[data-start]');
    if (!t) return;
    const ctx = { monthKey: V.monthKey, monthBookings: V.month };
    if (t.dataset.bid) {
      const b = V.month.find((x) => x.id === t.dataset.bid);
      if (b) App.openBookingModal(Object.assign({ booking: b }, ctx), () => V.load());
    } else {
      App.openBookingModal(Object.assign({ date: V.date, courtId: t.dataset.court, start: t.dataset.start }, ctx), () => V.load());
    }
  }

  function bookedCell(b, span) {
    const st = App.bookingState(b);
    return `<td class="slot booked ${st}${span === 1 ? ' s1' : ''}" rowspan="${span}" role="button" tabindex="0" data-bid="${U.esc(b.id)}"
        aria-label="${U.esc(b.customerName)}, ${U.fmt12(b.start)} to ${U.fmt12(b.end)}, ${App.STATE_LABEL[st]}">
      <div class="b-name">${U.esc(b.customerName)}</div>
      <div class="b-meta">${U.fmt12(b.start)} – ${U.fmt12(b.end)}${b.phone ? ' · ' + U.esc(b.phone) : ''}</div>
      <div class="b-foot"><span class="tag ${st}">${App.STATE_LABEL[st]}</span><span class="b-amt">${U.money(b.amount)}</span></div>
    </td>`;
  }

  V.draw = function () {
    const s = App.state.settings, step = s.slotMinutes, open = s.openHour * 60;
    const courts = s.courts.filter((c) => c.active);
    const slots = App.pricing.slots(s);
    const day = V.month.filter((b) => b.date === V.date);
    const live = day.filter((b) => b.status !== 'cancelled');

    // Place each booking on the grid.
    const occ = {};
    courts.forEach((c) => { occ[c.id] = new Array(slots.length).fill(null); });
    const placed = new Set();
    live.slice().sort((a, b) => a.start.localeCompare(b.start)).forEach((b) => {
      const row = occ[b.courtId];
      if (!row) return;
      const si = Math.max(0, Math.floor((U.toMin(b.start) - open) / step));
      const ei = Math.min(slots.length, Math.ceil((U.toMin(b.end) - open) / step));
      if (si >= ei) return;
      for (let i = si; i < ei; i++) if (row[i]) return;
      for (let i = si; i < ei; i++) row[i] = { b, first: si, span: ei - si };
      placed.add(b.id);
    });

    const today = U.today();
    const nowM = U.nowMin();
    const isPast = (m) => V.date < today || (V.date === today && m + step <= nowM);

    let html;
    if (!courts.length) html = '<div class="empty">No active courts. Add or switch on courts in <a href="#settings">Settings</a>.</div>';
    else if (!slots.length) html = '<div class="empty">Opening hours are not set correctly. Check <a href="#settings">Settings</a>.</div>';
    else {
      html = `<table class="grid"><thead><tr><th class="time"><span class="sr">Time</span></th>${courts.map((c) => `<th>${U.esc(c.name)}</th>`).join('')}</tr></thead><tbody>`;
      slots.forEach((m, i) => {
        const nowRow = V.date === today && m <= nowM && nowM < m + step;
        html += `<tr${nowRow ? ' class="now"' : ''}><td class="time">${U.fmt12(m)}</td>`;
        courts.forEach((c) => {
          const o = occ[c.id][i];
          if (o) { if (o.first === i) html += bookedCell(o.b, o.span); return; }
          const price = App.pricing.amount(s, V.date, m, m + step);
          html += `<td class="slot free${isPast(m) ? ' past' : ''}" role="button" tabindex="0" data-court="${U.esc(c.id)}" data-start="${U.toTime(m)}"
            aria-label="Book ${U.esc(c.name)} at ${U.fmt12(m)}"><span class="plus">+</span> ${U.money(price)}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
    V.root.querySelector('[data-grid]').innerHTML = html;

    // Day summary
    const hours = U.sum(live, (b) => (U.toMin(b.end) - U.toMin(b.start)) / 60);
    const capacity = (courts.length * slots.length * step) / 60;
    const value = U.sum(live, (b) => b.amount);
    const paid = U.sum(day, (b) => b.paid);
    const due = U.sum(day, App.bookingDue);
    V.root.querySelector('[data-stats]').innerHTML = `
      <div class="stat"><span>Bookings</span><strong>${live.length}</strong></div>
      <div class="stat"><span>Court hours used</span><strong>${U.round2(hours)} <small>of ${capacity}${capacity ? ` · ${Math.round((hours / capacity) * 100)}%` : ''}</small></strong></div>
      <div class="stat"><span>Booking value</span><strong>${U.money(value)}</strong></div>
      <div class="stat"><span>Paid</span><strong class="txt-ok">${U.money(paid)}</strong></div>
      <div class="stat"><span>Due</span><strong class="${due > 0 ? 'txt-warn' : ''}">${U.money(due)}</strong></div>`;

    // Bookings not shown on the grid
    const others = day.filter((b) => !placed.has(b.id));
    V.root.querySelector('[data-extra]').innerHTML = others.length ? `
      <section class="card">
        <h2>Other bookings this day</h2>
        <p class="hint">Cancelled bookings, and bookings outside the current opening hours or on courts that are switched off.</p>
        <ul class="list">${others.map((b) => {
          const st = App.bookingState(b);
          return `<li role="button" tabindex="0" data-bid="${U.esc(b.id)}">
            <span>${U.fmt12(b.start)} – ${U.fmt12(b.end)}</span><span>${U.esc(App.courtName(b.courtId))}</span>
            <span>${U.esc(b.customerName)}</span><span class="tag ${st}">${App.STATE_LABEL[st]}</span></li>`;
        }).join('')}</ul>
      </section>` : '';
  };

  App.views.bookings = V;
})(window.App);
