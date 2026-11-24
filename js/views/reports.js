(function (App) {
  'use strict';
  const U = App.U, P = App.paths;
  App.views = App.views || {};
  const V = { month: U.monthKey(U.today()), seq: 0 };
  const TREND = 6;

  const prevMonths = (mk, n) => {
    const out = [];
    const d = U.parseDate(mk + '-01');
    for (let i = n - 1; i >= 0; i--) {
      const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(U.dateStr(t).slice(0, 7));
    }
    return out;
  };
  const incomeKind = (p) => (p.type === 'booking' ? 'Court bookings' : p.type === 'membership' ? 'Memberships' : (p.category || 'Other income'));

  V.render = async function (root) {
    V.root = root;
    root.innerHTML = `
      <section class="toolbar">
        <h1>Reports</h1><span class="spacer"></span>
        <input type="month" data-month aria-label="Month">
        <button type="button" class="btn ghost" data-print>Print</button>
      </section>
      <div data-body><div class="loading">Loading…</div></div>`;
    const mi = root.querySelector('[data-month]');
    mi.value = V.month;
    mi.addEventListener('change', () => { if (U.isMonth(mi.value)) { V.month = mi.value; V.load(); } });
    root.querySelector('[data-print]').addEventListener('click', () => window.print());
    await V.load();
  };

  V.load = async function () {
    const seq = ++V.seq;
    const months = prevMonths(V.month, TREND);
    const paths = [];
    months.forEach((m) => paths.push(P.payments(m), P.expenses(m)));
    paths.push(P.bookings(V.month), P.memberships);
    let r;
    try {
      r = await App.store.read(paths);
    } catch (e) {
      if (seq !== V.seq) return;
      V.root.querySelector('[data-body]').innerHTML = `<div class="error-box">${U.esc(e.message)}</div>`;
      return;
    }
    if (seq !== V.seq) return;
    V.draw(r, months);
  };

  V.draw = function (r, months) {
    const mk = V.month;
    const pays = r[P.payments(mk)], exps = r[P.expenses(mk)];
    const income = U.sum(pays, (p) => p.amount);
    const spend = U.sum(exps, (x) => x.amount);
    const net = U.round2(income - spend);

    const inc = {};
    pays.forEach((p) => { const k = incomeKind(p); inc[k] = (inc[k] || 0) + U.num(p.amount); });
    const ex = {};
    exps.forEach((x) => { ex[x.category] = (ex[x.category] || 0) + U.num(x.amount); });
    const byMethod = {};
    pays.forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + U.num(p.amount); });

    const bookingDue = U.sum(r[P.bookings(mk)], App.bookingDue);
    const memberDue = U.sum(r[P.memberships].filter((m) => U.monthKey(m.start) <= mk), App.memberDue);

    const table = (obj, total, cls) => {
      const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]);
      if (!rows.length) return '<p class="muted">Nothing recorded.</p>';
      return `<table class="table compact"><tbody>${rows.map(([k, v]) => `<tr><td>${U.esc(k)}</td>
        <td class="num muted">${total ? Math.round((v / total) * 100) : 0}%</td><td class="num">${U.money(v)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num ${cls}">${U.money(total)}</td></tr></tfoot></table>`;
    };

    const trend = months.map((m) => {
      const i = U.sum(r[P.payments(m)], (p) => p.amount), e = U.sum(r[P.expenses(m)], (x) => x.amount);
      return { m, i, e, n: U.round2(i - e) };
    });
    const tmax = Math.max(1, ...trend.map((t) => Math.max(t.i, t.e)));

    V.root.querySelector('[data-body]').innerHTML = `
      <h2 class="print-title">${U.esc(App.state.settings.academyName)} · Profit &amp; loss · ${U.esc(U.fmtMonth(mk))}</h2>
      <section class="stats">
        <div class="stat"><span>Money received</span><strong class="txt-ok">${U.money(income)}</strong></div>
        <div class="stat"><span>Expenses</span><strong class="txt-warn">${U.money(spend)}</strong></div>
        <div class="stat"><span>${net >= 0 ? 'Profit' : 'Loss'}</span><strong class="${net >= 0 ? 'txt-ok' : 'txt-bad'}">${U.money(Math.abs(net))}</strong></div>
        <div class="stat"><span>Margin</span><strong>${income ? Math.round((net / income) * 100) + '%' : '—'}</strong></div>
        <div class="stat"><span>Still to collect</span><strong class="${bookingDue + memberDue > 0 ? 'txt-warn' : ''}">${U.money(bookingDue + memberDue)}</strong>
          <small class="muted">bookings ${U.money(bookingDue)} · memberships ${U.money(memberDue)}</small></div>
      </section>

      <div class="two-col">
        <section class="card"><h2>Income</h2>${table(inc, income, 'txt-ok')}
          <h3>By payment method</h3>
          ${table(Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [App.methodLabel(k), v])), income, '')}
        </section>
        <section class="card"><h2>Expenses</h2>${table(ex, spend, 'txt-warn')}</section>
      </div>

      <section class="card">
        <h2>Last ${TREND} months</h2>
        <table class="table trend">
          <thead><tr><th>Month</th><th class="hide-sm">Income vs expenses</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Profit</th></tr></thead>
          <tbody>${trend.map((t) => `<tr${t.m === mk ? ' class="sel"' : ''}>
            <td class="nowrap">${U.esc(U.fmtMonth(t.m))}</td>
            <td class="hide-sm"><div class="mini-bars"><span class="mb inc" data-w="${(t.i / tmax) * 100}"></span><span class="mb exp" data-w="${(t.e / tmax) * 100}"></span></div></td>
            <td class="num">${U.money(t.i)}</td><td class="num">${U.money(t.e)}</td>
            <td class="num ${t.n >= 0 ? 'txt-ok' : 'txt-bad'}">${t.n < 0 ? '−' : ''}${U.money(Math.abs(t.n))}</td></tr>`).join('')}</tbody>
        </table>
        <div class="legend"><span><i class="dot paid"></i>Income</span><span><i class="dot due"></i>Expenses</span></div>
        <p class="hint">Income is counted on the day money is received. Expenses are counted on the date entered.</p>
      </section>`;
    App.ui.applyBars(V.root);
  };

  App.views.reports = V;
})(window.App);
