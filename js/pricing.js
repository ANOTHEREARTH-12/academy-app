(function (App) {
  'use strict';
  const U = App.U;
  const Pr = {};

  // Start minute of every bookable slot in a day.
  Pr.slots = (s) => {
    const out = [];
    const step = s.slotMinutes;
    for (let m = s.openHour * 60; m + step <= s.closeHour * 60; m += step) out.push(m);
    return out;
  };

  // Hourly rate at a given minute of a given date. First matching special rate wins.
  Pr.rateAt = (s, date, min) => {
    const dow = U.parseDate(date).getDay();
    for (const r of s.rateRules || []) {
      if ((r.days || []).includes(dow) && U.toMin(r.from) <= min && min < U.toMin(r.to)) return U.num(r.rate);
    }
    return U.num(s.defaultRate);
  };

  // Price for a booking from startMin to endMin, slot by slot.
  Pr.amount = (s, date, startMin, endMin) => {
    const step = s.slotMinutes;
    let total = 0;
    for (let m = startMin; m < endMin; m += step) {
      const len = Math.min(step, endMin - m);
      total += (Pr.rateAt(s, date, m) * len) / 60;
    }
    return U.round2(total);
  };

  App.pricing = Pr;
})(window.App);
