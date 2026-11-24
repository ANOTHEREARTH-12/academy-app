window.App = window.App || {};
(function (App) {
  'use strict';
  const U = {};
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  U.id = (prefix) => {
    let r;
    try { r = crypto.randomUUID().replace(/-/g, '').slice(0, 12); }
    catch (_) { r = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    return prefix + '_' + r;
  };
  U.pad = (n) => String(n).padStart(2, '0');
  U.dateStr = (d) => `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
  U.today = () => U.dateStr(new Date());
  U.parseDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d || 1); };
  U.addDays = (s, n) => { const d = U.parseDate(s); d.setDate(d.getDate() + n); return U.dateStr(d); };
  U.monthKey = (s) => String(s).slice(0, 7);
  U.isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  U.isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');
  U.toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  U.toTime = (min) => `${U.pad(Math.floor(min / 60))}:${U.pad(min % 60)}`;
  U.nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  U.fmt12 = (t) => {
    const min = typeof t === 'number' ? t : U.toMin(t);
    let h = Math.floor(min / 60) % 24;
    const m = min % 60;
    const ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    return `${h}:${U.pad(m)} ${ap}`;
  };
  U.fmtDate = (s, opts) => U.parseDate(s).toLocaleDateString('en-IN', opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  U.fmtMonth = (m) => U.parseDate(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  U.fmtDuration = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return (h ? h + ' hr' : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
  };
  U.num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  U.round2 = (n) => Math.round(U.num(n) * 100) / 100;
  U.money = (n) => {
    const cur = (App.state && App.state.settings && App.state.settings.currency) || '₹';
    return cur + U.round2(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };
  U.normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  U.nowIso = () => new Date().toISOString();
  U.sum = (arr, f) => arr.reduce((a, x) => a + U.num(f(x)), 0);

  // localStorage can be blocked (private mode, policies) — never let it crash the app.
  U.storage = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
    remove(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } },
    keys() { try { return Object.keys(localStorage); } catch (_) { return []; } },
  };

  App.U = U;
})(window.App);
