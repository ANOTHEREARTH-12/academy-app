(function (App) {
  'use strict';
  const U = App.U, ui = App.ui, P = App.paths;
  App.views = App.views || {};
  const V = { month: U.monthKey(U.today()), list: [], seq: 0, cat: '' };

  App.EXP_METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank transfer'], ['card', 'Card'], ['other', 'Other']];
  App.expMethodLabel = (m) => (App.EXP_METHODS.find((x) => x[0] === m) || [m, m])[1];

  V.render = async function (root) {
    V.root = root;
    root.innerHTML = `
      <section class="toolbar">
        <h1>Expenses</h1><span class="spacer"></span>
        <input type="month" data-month aria-label="Month">
        <button type="button" class="btn ghost" data-csv>Export CSV</button>
        <button type="button" class="btn primary" data-add>+ Add expense</button>
      </section>
      <section class="stats" data-stats></section>
      <section class="card"><h2>By category</h2><div data-cats></div></section>
      <section class="card"><h2 data-ltitle>Expenses</h2><div data-list><div class="loading">Loading…</div></div></section>`;
    const mi = root.querySelector('[data-month]');
    mi.value = V.month;
    mi.addEventListener('change', () => { if (U.isMonth(mi.value)) { V.month = mi.value; V.cat = ''; V.load(); } });
    root.querySelector('[data-add]').addEventListener('click', () => V.edit(null));
    root.querySelector('[data-csv]').addEventListener('click', exportCsv);
    root.querySelector('[data-cats]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (b) { V.cat = V.cat === b.dataset.cat ? '' : b.dataset.cat; V.draw(); }
    });
    const list = root.querySelector('[data-list]');
    const open = (e) => {
      const r = e.target.closest('[data-eid]');
      if (r) V.edit(V.list.find((x) => x.id === r.dataset.eid));
      const c = e.target.closest('[data-clearcat]');
      if (c) { V.cat = ''; V.draw(); }
    };
    list.addEventListener('click', open);
    list.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    await V.load();
  };

  V.load = async function () {
    const seq = ++V.seq;
    try {
      const r = await App.store.read([P.expenses(V.month)]);
      if (seq !== V.seq) return;
      V.list = r[P.expenses(V.month)];
    } catch (e) {
      if (seq !== V.seq) return;
      V.root.querySelector('[data-list]').innerHTML = `<div class="error-box">${U.esc(e.message)}</div>`;
      return;
    }
    V.draw();
  };

  V.draw = function () {
    const list = V.list.slice().sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
    const total = U.sum(list, (x) => x.amount);
    const byCat = {};
    list.forEach((x) => { byCat[x.category] = (byCat[x.category] || 0) + U.num(x.amount); });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const max = cats.length ? cats[0][1] : 0;

    V.root.querySelector('[data-stats]').innerHTML = `
      <div class="stat"><span>Total expenses · ${U.esc(U.fmtMonth(V.month))}</span><strong class="txt-warn">${U.money(total)}</strong></div>
      <div class="stat"><span>Entries</span><strong>${list.length}</strong></div>
      <div class="stat"><span>Biggest category</span><strong class="ellipsis">${cats.length ? U.esc(cats[0][0]) : '—'}</strong></div>
      <div class="stat"><span>Paid in cash</span><strong>${U.money(U.sum(list.filter((x) => x.method === 'cash'), (x) => x.amount))}</strong></div>
      <div class="stat"><span>Paid by UPI / bank / card</span><strong>${U.money(U.sum(list.filter((x) => x.method !== 'cash'), (x) => x.amount))}</strong></div>`;

    V.root.querySelector('[data-cats]').innerHTML = cats.length ? `<div class="bars">${cats.map(([c, v]) => `
      <button type="button" class="bar-row${V.cat === c ? ' active' : ''}" data-cat="${U.esc(c)}" title="Show only ${U.esc(c)}">
        <span class="bar-label">${U.esc(c)}</span>
        <span class="bar-track"><span class="bar-fill" data-w="${max ? Math.max(2, (v / max) * 100) : 0}"></span></span>
        <span class="bar-val">${U.money(v)} <small>${total ? Math.round((v / total) * 100) : 0}%</small></span>
      </button>`).join('')}</div>` : '<div class="empty">No expenses recorded this month.</div>';
    App.ui.applyBars(V.root);

    const shown = V.cat ? list.filter((x) => x.category === V.cat) : list;
    V.root.querySelector('[data-ltitle]').textContent = V.cat ? `Expenses · ${V.cat}` : 'Expenses';
    V.root.querySelector('[data-list]').innerHTML = shown.length ? `
      ${V.cat ? `<p class="count">Showing only ${U.esc(V.cat)} · <button type="button" class="linkish" data-clearcat>show all</button></p>` : ''}
      <table class="table">
        <thead><tr><th>Date</th><th>Category</th><th class="hide-sm">Details</th><th class="hide-sm">Paid by</th><th class="num">Amount</th></tr></thead>
        <tbody>${shown.map((x) => `<tr data-eid="${U.esc(x.id)}" tabindex="0">
          <td class="nowrap">${U.fmtDate(x.date, { day: 'numeric', month: 'short' })}</td>
          <td>${U.esc(x.category)}</td>
          <td class="hide-sm muted">${U.esc([x.description, x.paidTo ? 'to ' + x.paidTo : ''].filter(Boolean).join(' · '))}</td>
          <td class="hide-sm">${U.esc(App.expMethodLabel(x.method))}</td>
          <td class="num">${U.money(x.amount)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="hide-sm"></td><td class="hide-sm"></td><td class="num">${U.money(U.sum(shown, (x) => x.amount))}</td></tr></tfoot>
      </table>` : '<div class="empty">No expenses yet. Use “Add expense” to record rent, electricity, salaries, shuttlecocks and so on.</div>';
  };

  V.edit = function (x) {
    const s = App.state.settings;
    const isEdit = !!x;
    const cats = s.expenseCategories.slice();
    if (isEdit && !cats.includes(x.category)) cats.push(x.category);
    const d = ui.modal({
      title: isEdit ? 'Expense' : 'Add expense',
      body: `
        <div class="form-grid g2">
          <label>Date<input type="date" name="date" required></label>
          <label>Category<select name="category">${cats.map((c) => `<option>${U.esc(c)}</option>`).join('')}</select></label>
          <label>Amount (${U.esc(s.currency)})<input type="number" name="amount" min="0" step="any" required></label>
          <label>Paid by<select name="method">${App.EXP_METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        </div>
        <label>Paid to<input name="paidTo" maxlength="80" placeholder="Optional — shop, person or company"></label>
        <label>Details<textarea name="description" rows="2" maxlength="300" placeholder="Optional — e.g. 2 boxes of shuttles, November bill"></textarea></label>`,
      footer: `${isEdit ? '<button type="button" class="btn danger ghost" data-del>Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button type="submit" class="btn primary" data-save>Save</button>`,
    });
    const f = d.querySelector('form');
    const el = (n) => f.elements[n];
    if (isEdit) {
      el('date').value = x.date; el('category').value = x.category; el('amount').value = x.amount;
      el('method').value = x.method || 'cash'; el('paidTo').value = x.paidTo || ''; el('description').value = x.description || '';
    } else {
      el('date').value = V.month === U.monthKey(U.today()) ? U.today() : V.month + '-01';
      if (V.cat && cats.includes(V.cat)) el('category').value = V.cat;
    }
    setTimeout(() => el('amount').focus(), 50);

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = {
        date: el('date').value, category: el('category').value, amount: U.round2(el('amount').value),
        method: el('method').value, paidTo: el('paidTo').value.trim(), description: el('description').value.trim(),
      };
      if (!U.isDate(v.date)) { ui.toast('Choose the date.', 'error'); return; }
      if (!(v.amount > 0)) { ui.toast('Enter the amount.', 'error'); return; }
      const newP = P.expenses(U.monthKey(v.date));
      const oldP = isEdit ? P.expenses(U.monthKey(x.date)) : newP;
      try {
        await ui.busy(f.querySelector('[data-save]'), () => App.store.transact([...new Set([oldP, newP])], (data) => {
          const now = U.nowIso();
          if (isEdit) {
            const i = data[oldP].findIndex((y) => y.id === x.id);
            if (i < 0) throw new Error('This expense was removed on another device. Press refresh (↻).');
            const upd = Object.assign({}, data[oldP][i], v, { updatedAt: now });
            data[oldP].splice(i, 1);
            data[newP].push(upd);
          } else {
            data[newP].push(Object.assign({ id: U.id('exp') }, v, { createdAt: now, updatedAt: now }));
          }
          data[newP].sort((a, b) => a.date.localeCompare(b.date));
        }, `${isEdit ? 'Update' : 'Add'} expense ${v.category} ${v.amount} on ${v.date}`));
        ui.toast('Expense saved', 'success');
        d.close();
        if (U.monthKey(v.date) !== V.month) ui.toast(`Saved under ${U.fmtMonth(U.monthKey(v.date))}.`, 'info');
        V.load();
      } catch (ex) { ui.err(ex); }
    });

    if (isEdit) {
      f.querySelector('[data-del]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!(await ui.confirm(`Delete this ${U.money(x.amount)} ${x.category} expense?`, { okText: 'Delete', danger: true }))) return;
        const p = P.expenses(U.monthKey(x.date));
        try {
          await ui.busy(btn, () => App.store.transact([p], (data) => {
            data[p] = data[p].filter((y) => y.id !== x.id);
          }, `Delete expense ${x.category} ${x.amount} on ${x.date}`), 'Deleting…');
          ui.toast('Expense deleted', 'success');
          d.close();
          V.load();
        } catch (ex) { ui.err(ex); }
      });
    }
  };

  function exportCsv() {
    if (!V.list.length) { ui.toast('Nothing to export for this month.', 'info'); return; }
    const rows = [['Date', 'Category', 'Amount', 'Paid by', 'Paid to', 'Details']];
    V.list.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((x) => {
      rows.push([x.date, x.category, U.num(x.amount), App.expMethodLabel(x.method), x.paidTo || '', x.description || '']);
    });
    App.downloadCsv(rows, `expenses-${V.month}.csv`);
  }

  // Shared CSV download helper
  App.downloadCsv = function (rows, filename) {
    const cell = (v) => {
      if (typeof v === 'number') return String(v);
      let s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  App.views.expenses = V;
})(window.App);
