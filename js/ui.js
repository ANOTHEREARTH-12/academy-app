(function (App) {
  'use strict';
  const U = App.U;
  const ui = {};

  ui.toast = (msg, type = 'info', ms = 3500) => {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  };

  ui.err = (e) => { console.error(e); ui.toast((e && e.message) || String(e), 'error', 7000); };

  // A modal dialog. The body and footer are inside one <form>.
  ui.modal = ({ title, body, footer = '', wide = false }) => {
    const d = document.createElement('dialog');
    d.className = 'modal' + (wide ? ' wide' : '');
    d.innerHTML = `
      <form class="modal-inner" novalidate autocomplete="off">
        <header class="modal-head"><h2>${U.esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </form>`;
    document.body.appendChild(d);
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
    d.addEventListener('close', () => d.remove());
    d.showModal();
    return d;
  };

  ui.confirm = (message, { okText = 'OK', danger = false } = {}) => new Promise((resolve) => {
    const d = ui.modal({
      title: 'Please confirm',
      body: `<p>${U.esc(message)}</p>`,
      footer: `<span class="spacer"></span><button type="button" class="btn ghost" data-close>Back</button>
               <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-yes>${U.esc(okText)}</button>`,
    });
    let ok = false;
    d.querySelector('[data-yes]').addEventListener('click', () => { ok = true; d.close(); });
    d.addEventListener('close', () => resolve(ok));
  });

  // Disables a button and shows a spinner while fn runs.
  ui.busy = async (btn, fn, label = 'Saving…') => {
    const old = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${label ? ' ' + U.esc(label) : ''}`; }
    try { return await fn(); }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
  };

  // Bar widths are set from JS because the page's security policy blocks inline style attributes.
  ui.applyBars = (root) => {
    root.querySelectorAll('[data-w]').forEach((e) => { e.style.width = Math.max(0, Math.min(100, Number(e.dataset.w) || 0)) + '%'; });
  };

  App.ui = ui;
})(window.App);
