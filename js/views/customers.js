(function (App) {
  'use strict';
  const U = App.U, ui = App.ui, P = App.paths;
  App.views = App.views || {};
  const V = { q: '' };

  V.render = async function (root) {
    V.root = root;
    root.innerHTML = `
      <section class="toolbar">
        <h1>Customers</h1><span class="spacer"></span>
        <input type="search" class="search" placeholder="Search name or phone" data-q aria-label="Search customers">
        <button type="button" class="btn primary" data-add>+ Add customer</button>
      </section>
      <section class="card"><div data-list><div class="loading">Loading…</div></div></section>`;
    const q = root.querySelector('[data-q]');
    q.value = V.q;
    q.addEventListener('input', () => { V.q = q.value; V.draw(); });
    root.querySelector('[data-add]').addEventListener('click', () => V.edit(null));
    const list = root.querySelector('[data-list]');
    const open = (e) => {
      const r = e.target.closest('[data-cid]');
      if (r) V.edit(App.state.customers.find((c) => c.id === r.dataset.cid));
    };
    list.addEventListener('click', open);
    list.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    try {
      const r = await App.store.read([P.customers]);
      App.state.customers = r[P.customers];
    } catch (e) { ui.err(e); }
    V.draw();
  };

  V.draw = function () {
    const box = V.root.querySelector('[data-list]');
    const all = App.state.customers;
    if (!all.length) {
      box.innerHTML = '<div class="empty">No customers yet. They are added automatically when you save a booking, or use “Add customer”.</div>';
      return;
    }
    const q = V.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    let list = all.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (q) list = list.filter((c) => (c.name || '').toLowerCase().includes(q) || (qd.length >= 2 && U.normPhone(c.phone).includes(qd)));
    box.innerHTML = `
      <p class="count">${list.length} of ${all.length} customers</p>
      <table class="table">
        <thead><tr><th>Name</th><th>Phone</th><th>Type</th><th class="hide-sm">Notes</th></tr></thead>
        <tbody>${list.map((c) => `<tr data-cid="${U.esc(c.id)}" tabindex="0">
          <td>${U.esc(c.name)}</td><td>${U.esc(c.phone || '—')}</td>
          <td><span class="tag ${c.type === 'member' ? 'paid' : 'plain'}">${c.type === 'member' ? 'Member' : 'Walk-in'}</span></td>
          <td class="hide-sm muted">${U.esc(c.notes || '')}</td></tr>`).join('')}</tbody>
      </table>`;
  };

  V.edit = function (c) {
    const isEdit = !!c;
    const d = ui.modal({
      title: isEdit ? 'Edit customer' : 'Add customer',
      body: `
        <label>Name<input name="name" required maxlength="80"></label>
        <label>Phone<input name="phone" inputmode="tel" maxlength="20"></label>
        <label>Type<select name="type"><option value="walk-in">Walk-in</option><option value="member">Member</option></select></label>
        <label>Notes<textarea name="notes" rows="2"></textarea></label>
        ${isEdit ? '<p class="hint">Changing the name here does not rename past bookings.</p>' : ''}`,
      footer: `${isEdit ? '<button type="button" class="btn danger ghost" data-del>Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button type="submit" class="btn primary" data-save>Save</button>`,
    });
    const f = d.querySelector('form');
    if (isEdit) {
      f.elements.name.value = c.name || '';
      f.elements.phone.value = c.phone || '';
      f.elements.type.value = c.type || 'walk-in';
      f.elements.notes.value = c.notes || '';
    }
    setTimeout(() => f.elements.name.focus(), 50);

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = {
        name: f.elements.name.value.trim(),
        phone: f.elements.phone.value.trim(),
        type: f.elements.type.value,
        notes: f.elements.notes.value.trim(),
      };
      if (!v.name) { ui.toast('Enter the customer name.', 'error'); return; }
      try {
        const data = await ui.busy(f.querySelector('[data-save]'), () => App.store.transact([P.customers], (data) => {
          const list = data[P.customers];
          const np = U.normPhone(v.phone);
          if (np.length >= 6) {
            const dup = list.find((x) => x.id !== (c && c.id) && U.normPhone(x.phone) === np);
            if (dup) throw new Error(`${dup.name} already has this phone number.`);
          }
          if (isEdit) {
            const x = list.find((y) => y.id === c.id);
            if (!x) throw new Error('This customer was removed on another device.');
            Object.assign(x, v, { updatedAt: U.nowIso() });
          } else {
            list.push(Object.assign({ id: U.id('cus') }, v, { createdAt: U.nowIso() }));
          }
        }, `${isEdit ? 'Update' : 'Add'} customer ${v.name}`));
        App.state.customers = data[P.customers];
        ui.toast('Customer saved', 'success');
        d.close();
        V.draw();
      } catch (ex) { ui.err(ex); }
    });

    if (isEdit) {
      f.querySelector('[data-del]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!(await ui.confirm(`Delete ${c.name} from Customers? Their past bookings and payments are kept.`, { okText: 'Delete', danger: true }))) return;
        try {
          const data = await ui.busy(btn, () => App.store.transact([P.customers], (data) => {
            data[P.customers] = data[P.customers].filter((x) => x.id !== c.id);
          }, `Delete customer ${c.name}`), 'Deleting…');
          App.state.customers = data[P.customers];
          ui.toast('Customer deleted', 'success');
          d.close();
          V.draw();
        } catch (ex) { ui.err(ex); }
      });
    }
  };

  App.views.customers = V;
})(window.App);
