(function (App) {
  'use strict';
  const U = App.U;
  const API = 'https://api.github.com';

  // Where each kind of record lives inside the private data repository.
  const P = {
    settings: 'data/settings.json',
    customers: 'data/customers.json',
    bookings: (month) => `data/bookings/${month}.json`,
    payments: (month) => `data/payments/${month}.json`,
    memberships: 'data/memberships.json',
    expenses: (month) => `data/expenses/${month}.json`,
  };

  App.DEFAULT_EXPENSE_CATEGORIES = ['Rent', 'Electricity', 'Water', 'Salaries', 'Shuttlecocks', 'Equipment',
    'Maintenance & repairs', 'Cleaning', 'Internet & phone', 'Marketing', 'Other'];
  App.paths = P;

  App.defaultSettings = () => ({
    version: 1,
    academyName: 'My Badminton Academy',
    currency: '₹',
    openHour: 5,
    closeHour: 22,
    slotMinutes: 60,
    defaultRate: 400,
    rateRules: [],
    courts: [
      { id: 'court-1', name: 'Court 1', active: true },
      { id: 'court-2', name: 'Court 2', active: true },
    ],
    plans: [],
    expenseCategories: App.DEFAULT_EXPENSE_CATEGORIES.slice(),
    expiringDays: 7,
  });

  const defaultFor = (path) => (path === P.settings ? App.defaultSettings() : []);

  class StoreError extends Error {
    constructor(msg, status) { super(msg); this.status = status; }
  }

  async function errorFrom(res) {
    let detail = '';
    try { const j = await res.json(); detail = j.message || ''; } catch (_) { /* not json */ }
    const s = res.status;
    let msg;
    if (s === 401) msg = 'GitHub rejected the access token. It may be wrong, expired or revoked.';
    else if (s === 403 && /rate limit/i.test(detail)) msg = 'GitHub rate limit reached. Wait a few minutes and try again.';
    else if (s === 403) msg = 'The access token is not allowed to do this. It needs "Contents: Read and write" on the data repository.';
    else if (s === 404) msg = 'Repository or branch not found, or the access token cannot see it.';
    else if (s === 409 && /empty/i.test(detail)) msg = 'The data repository is empty. On GitHub, add a README file to it first.';
    else msg = `GitHub error ${s}${detail ? ': ' + detail : ''}`;
    return new StoreError(msg, s);
  }

  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

  /**
   * Stores data as JSON files in a private GitHub repository.
   * Every save is one atomic commit (several files at once). If someone else
   * saved in between, the commit is rejected and the change is re-applied on
   * the latest data — that is what prevents double bookings.
   */
  class GitHubStore {
    constructor(cfg) {
      this.owner = cfg.owner;
      this.repo = cfg.repo;
      this.branch = cfg.branch || 'main';
      this.token = cfg.token;
      this.isDemo = false;
      this.label = `${cfg.owner}/${cfg.repo} (${this.branch})`;
    }

    async req(method, path, body, accept) {
      const headers = {
        Authorization: 'Bearer ' + this.token,
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (body) headers['Content-Type'] = 'application/json';
      try {
        return await fetch(API + path, { method, headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined });
      } catch (_) {
        throw new StoreError('Cannot reach GitHub. Check the internet connection and try again.', 0);
      }
    }

    async json(method, path, body) {
      const r = await this.req(method, path, body);
      if (!r.ok) throw await errorFrom(r);
      return r.status === 204 ? null : r.json();
    }

    rp(p) { return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${p}`; }
    refPath() { return this.rp(`/git/refs/heads/${encPath(this.branch)}`); }

    async check() {
      const repo = await this.json('GET', this.rp(''));
      if (!repo.private) {
        throw new StoreError('This repository is PUBLIC. Make it private on GitHub before storing customer data in it.', 0);
      }
      if (repo.permissions && repo.permissions.push === false) {
        throw new StoreError('This access token can read but not save. Give it "Contents: Read and write" permission.', 403);
      }
      await this.head();
      return repo;
    }

    async head() {
      const r = await this.json('GET', this.rp(`/git/ref/heads/${encPath(this.branch)}`));
      return r.object.sha;
    }

    async readRaw(path, ref) {
      const r = await this.req('GET', this.rp(`/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`), null, 'application/vnd.github.raw+json');
      if (r.status === 404) return undefined;
      if (!r.ok) throw await errorFrom(r);
      const text = await r.text();
      try { return JSON.parse(text); }
      catch (_) { throw new StoreError(`The file ${path} in the data repository is not valid JSON. Fix or restore it on GitHub.`, 0); }
    }

    async isInitialized() {
      return (await this.readRaw(P.settings, await this.head())) !== undefined;
    }

    // Reads several files from one consistent snapshot (the same commit).
    async read(paths) {
      const sha = await this.head();
      const out = {};
      await Promise.all(paths.map(async (p) => {
        const v = await this.readRaw(p, sha);
        out[p] = v === undefined ? defaultFor(p) : v;
      }));
      return out;
    }

    async transact(paths, mutator, message) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const headSha = await this.head();
        const data = {};
        await Promise.all(paths.map(async (p) => {
          const v = await this.readRaw(p, headSha);
          data[p] = v === undefined ? defaultFor(p) : v;
        }));
        await mutator(data); // may throw (e.g. slot already booked) — nothing is saved then

        const commit = await this.json('GET', this.rp(`/git/commits/${headSha}`));
        const tree = await this.json('POST', this.rp('/git/trees'), {
          base_tree: commit.tree.sha,
          tree: paths.map((p) => ({ path: p, mode: '100644', type: 'blob', content: JSON.stringify(data[p], null, 2) + '\n' })),
        });
        const newCommit = await this.json('POST', this.rp('/git/commits'), {
          message: String(message || 'Update').slice(0, 200),
          tree: tree.sha,
          parents: [headSha],
        });
        const r = await this.req('PATCH', this.refPath(), { sha: newCommit.sha, force: false });
        if (r.ok) return data;
        if (r.status === 409 || r.status === 422) {
          // Another device saved first. Wait a moment and re-apply on the latest data.
          await new Promise((res) => setTimeout(res, 300 + Math.random() * 700));
          continue;
        }
        throw await errorFrom(r);
      }
      throw new StoreError('Could not save because other devices kept saving at the same time. Please try again.', 0);
    }
  }

  /** Keeps everything in this browser only. For trying the app without GitHub. */
  class DemoStore {
    constructor() { this.isDemo = true; this.label = 'Demo mode — data stays in this browser only'; }
    key(p) { return 'bam_demo:' + p; }
    raw(p) {
      const v = U.storage.get(this.key(p));
      if (v == null) return undefined;
      try { return JSON.parse(v); } catch (_) { return undefined; }
    }
    async check() { return true; }
    async isInitialized() { return this.raw(P.settings) !== undefined; }
    async read(paths) {
      const out = {};
      paths.forEach((p) => { const v = this.raw(p); out[p] = v === undefined ? defaultFor(p) : v; });
      return out;
    }
    async transact(paths, mutator) {
      const data = await this.read(paths);
      await mutator(data);
      paths.forEach((p) => {
        if (!U.storage.set(this.key(p), JSON.stringify(data[p]))) throw new StoreError('This browser blocked saving demo data.', 0);
      });
      return data;
    }
    clear() { U.storage.keys().filter((k) => k.startsWith('bam_demo:')).forEach((k) => U.storage.remove(k)); }
  }

  // The connection (including the token) is kept only in this browser.
  App.config = {
    KEY: 'bam_config',
    load() { try { return JSON.parse(U.storage.get(this.KEY) || 'null'); } catch (_) { return null; } },
    save(c) { return U.storage.set(this.KEY, JSON.stringify(c)); },
    clear() { U.storage.remove(this.KEY); },
  };

  App.makeStore = (cfg) => (cfg.mode === 'demo' ? new DemoStore() : new GitHubStore(cfg));
})(window.App);
