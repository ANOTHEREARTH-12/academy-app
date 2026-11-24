(function (App) {
  'use strict';
  const U = App.U, ui = App.ui, P = App.paths;
  App.views = App.views || {};

  App.views.setup = {
    render(root, prefill) {
      prefill = prefill || {};
      root.innerHTML = `
        <section class="setup card">
          <img class="hero" src="img/hero.svg" alt="" width="480" height="190">
          <h1><img class="logo-img" src="img/shuttle.svg" alt="" width="30" height="30"> Court Manager</h1>
          <p>Connect this device to the academy's <strong>private</strong> data repository on GitHub.
             You only do this once per device.</p>
          <form data-form novalidate autocomplete="off">
            <label>GitHub account that owns the data repository
              <input name="owner" required placeholder="for example smash-academy" spellcheck="false"></label>
            <label>Data repository name
              <input name="repo" required placeholder="for example academy-data" spellcheck="false"></label>
            <label>Branch
              <input name="branch" placeholder="main" spellcheck="false"></label>
            <label>Access token
              <input name="token" type="password" required placeholder="github_pat_…" spellcheck="false" autocomplete="new-password"></label>
            <p class="hint">The token is saved only in this browser on this device. The app never shows it again and never writes it to any repository.</p>
            <div class="error-box" data-error hidden></div>
            <button type="submit" class="btn primary block" data-connect>Connect</button>
          </form>

          <div class="init-box" data-init hidden>
            <h2>Connected ✓</h2>
            <p>This repository has no academy data yet. Create the starting files?
               (2 courts, 5:00 AM – 10:00 PM, ₹400 per hour. You can change all of this in Settings.)</p>
            <button type="button" class="btn primary block" data-create>Create starting files</button>
          </div>

          <hr>
          <button type="button" class="btn ghost block" data-demo>Try demo mode</button>
          <p class="hint center">Demo mode keeps data only in this browser. Use it to try the app before connecting GitHub.</p>
        </section>`;

      const f = root.querySelector('[data-form]');
      const errBox = root.querySelector('[data-error]');
      f.elements.owner.value = prefill.owner || '';
      f.elements.repo.value = prefill.repo || '';
      f.elements.branch.value = prefill.branch || 'main';
      let pending = null;

      const finish = (cfg) => {
        if (!App.config.save(cfg)) ui.toast('This browser would not save the connection. You will need to connect again next time.', 'error', 7000);
        location.hash = '#bookings';
        App.start(cfg);
      };

      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.hidden = true;
        const cfg = {
          mode: 'github',
          owner: f.elements.owner.value.trim(),
          repo: f.elements.repo.value.trim(),
          branch: f.elements.branch.value.trim() || 'main',
          token: f.elements.token.value.trim(),
        };
        if (!/^[A-Za-z0-9-]+$/.test(cfg.owner)) { showErr('Enter the GitHub account name (letters, numbers and dashes).'); return; }
        if (!/^[A-Za-z0-9._-]+$/.test(cfg.repo)) { showErr('Enter the repository name.'); return; }
        if (!cfg.token) { showErr('Paste the access token.'); return; }
        const store = App.makeStore(cfg);
        let initialized;
        try {
          await ui.busy(root.querySelector('[data-connect]'), async () => {
            await store.check();
            initialized = await store.isInitialized();
          }, 'Checking…');
        } catch (ex) { showErr(ex.message); return; }
        if (initialized) { finish(cfg); return; }
        pending = { cfg, store };
        f.hidden = true;
        root.querySelector('[data-init]').hidden = false;
      });

      root.querySelector('[data-create]').addEventListener('click', async (e) => {
        if (!pending) return;
        try {
          await ui.busy(e.currentTarget, () => pending.store.transact([P.settings, P.customers], (data) => {
            data[P.settings] = App.defaultSettings();
          }, 'Set up academy data'), 'Creating…');
          finish(pending.cfg);
        } catch (ex) { ui.err(ex); }
      });

      root.querySelector('[data-demo]').addEventListener('click', async () => {
        const cfg = { mode: 'demo' };
        const store = App.makeStore(cfg);
        try {
          if (!(await store.isInitialized())) {
            await store.transact([P.settings, P.customers], (data) => { data[P.settings] = App.defaultSettings(); });
          }
          finish(cfg);
        } catch (ex) { ui.err(ex); }
      });

      function showErr(msg) { errBox.textContent = msg; errBox.hidden = false; }
      setTimeout(() => (prefill.owner ? f.elements.token : f.elements.owner).focus(), 50);
    },
  };
})(window.App);
