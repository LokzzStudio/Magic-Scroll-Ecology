// The day, for the Attribute page on: each person's clock from waking (breakfast, walking out, work,
// carrying home, lunch, the walk home at night), what they could still get done, and the hunger it
// costs them; and, for school, the hours the scholar and a child are both at the house. The macro model
// (village-model.js), Micro mode (micro-model.js), its day viewer (micro-view.js) and the Map page all
// work from these.
// S, the day: MapModel.travelOf, or NO_MAP on a working page without a map. Times are in hours since
// that person woke.
(function () {
  // ---------- The clock ----------
  // Everyone's day (S: MapModel.travelOf), in hours since they woke: breakfast by the house (S.meal
  // hours), then work. At S.lunch hours they finish the energy under way, walk home for lunch and eat it
  // by the house. Nobody starts a unit they couldn't finish and be home from by S.active hours.
  // Anyone with nothing left to do waits by the house. S.between(a, b): hours walking from a to b
  // ("H" the house, "F" farm, "P" pasture, "T" forest, "M" mine).
  // Collecting (milking, harvest, timber, wool, stone) is carried home (搬運) after every S.load energy
  // and at the end of the job; anything still in hand is dropped off when they go home for lunch.
  // A person's clock: the time, where they are, what they're carrying, whether they've had lunch (and
  // got home for it at Lh)
  const newClock = (S) => ({ t: S.meal, at: "H", load: 0, lunched: false, Lh: 0, walked: 0 });
  // Work is done UNIT energy at a time: an hour's work for a standard worker
  const UNIT = 10;
  // Work up to `want` energy at `place`, `rate` energy an hour, UNIT energy at a time (the last may be
  // less if want isn't a whole number of units), walking there first, carrying it home if it's collecting, and breaking
  // for lunch. Returns the energy done.
  // (The clock is kept in locals while it runs: this is the hottest loop of a Macro day. A day that
  // starts on a fresh clock depends only on the place, the work, the rate and carrying, so each is
  // worked out once for a given day S (S never changes once made) and remembered.)
  const freshDays = new WeakMap();   // S → Map(key → { done, clock })
  const CLOCK = ["t", "at", "load", "lunched", "Lh", "walked"];
  function workAt(c, place, want, rate, S, collect) {
    if (c.wx) return workWx(c, place, want, rate, S, collect);
    if (c.t !== S.meal || c.at !== "H" || c.load !== 0 || c.lunched || c.walked !== 0) return work1(c, place, want, rate, S, collect);
    let memo = freshDays.get(S);
    if (!memo) { memo = new Map(); freshDays.set(S, memo); }
    const key = `${place}${collect ? "+" : ""}${want}|${rate}`;
    let hit = memo.get(key);
    if (!hit) {
      const done = work1(c, place, want, rate, S, collect), clock = {};
      for (const k of CLOCK) clock[k] = c[k];
      memo.set(key, { done, clock });
      return done;
    }
    for (const k of CLOCK) c[k] = hit.clock[k];
    return hit.done;
  }
  function work1(c, place, want, rate, S, collect) {
    const back = S.between(place, "H");
    if (!(rate > 0) || !isFinite(S.between(c.at, place)) || !isFinite(back)) return 0;
    const carry = collect && place !== "H";
    let done = 0, { t, at, load, lunched, Lh, walked } = c;
    while (want - done > 1e-9) {
      if (t >= S.active - 1e-9) break;
      if (!lunched && t >= S.lunch - 1e-9) {   // home for lunch, eaten by the house
        const d = at === place ? back : S.between(at, "H");
        t += d; walked += d; at = "H"; load = 0; Lh = t; t += S.meal; lunched = true;
        continue;
      }
      const a = Math.min(UNIT, want - done), go = at === place ? 0 : at === "H" ? back : S.between(at, place);
      if (t + go + a / rate + back > S.active + 1e-9) break;   // they couldn't do it and be home by the end of the day
      if (at !== place) {   // walk there (home drops off the load)
        t += go; walked += go; at = place; if (place === "H") load = 0;
        continue;
      }
      t += a / rate; done += a;
      if (carry) { load += a; if (load >= S.load - 1e-9 || want - done <= 1e-9) { t += back; walked += back; at = "H"; load = 0; } }
    }
    c.t = t; c.at = at; c.load = load; c.lunched = lunched; c.Lh = Lh; c.walked = walked;
    return done;
  }
  // workAt in the weather (the Clothing page in Macro mode): the same day, with the person's weather hooks
  // (c.wx, village-model.js's macroWeather) asked as they leave the house for work out of it (null: they go;
  // else the clock hour to look again, staying in), arrive there, finish each unit (why they'd go home:
  // "rain", "cold" or null) and come home; each unit there brings in × c.wx.mult (the rain's cut), summed
  // in c.wetE (energy × cut), and lighting a fire adds its energy to c.fireE
  function workWx(c, place, want, rate, S, collect) {
    const back = S.between(place, "H"), wx = c.wx, out = place !== "H";
    if (!(rate > 0) || !isFinite(S.between(c.at, place)) || !isFinite(back)) return 0;
    const carry = collect && out;
    let done = 0;
    const walkTo = (to, why) => {
      const t0 = c.t, d = S.between(c.at, to);
      c.t += d; c.walked += d; c.at = to;
      wx.walked(c, t0);
      if (to === "H") { c.load = 0; wx.home(c, why); }
    };
    while (want - done > 1e-9) {
      if (c.t >= S.active - 1e-9) break;
      if (!c.lunched && c.t >= S.lunch - 1e-9) {   // home for lunch, eaten by the house
        if (c.at !== "H") walkTo("H", "lunch");
        wx.eat(c); c.Lh = c.t; c.t += S.meal; c.lunched = true;
        continue;
      }
      const a = Math.min(UNIT, want - done), go = c.at === place ? 0 : c.at === "H" ? back : S.between(c.at, place);
      if (c.t + go + a / rate + back > S.active + 1e-9) break;
      if (c.at !== place) {
        if (c.at === "H" && out) { const until = wx.leave(c, place, want - done); if (until !== null) { c.t = until; continue; } }
        walkTo(place, "work");
        if (out) { const why = wx.arrive(c, place); if (why) walkTo("H", why); }   // too wet or cold there: back home
        continue;
      }
      const t0 = c.t, m = out ? wx.mult(c) : 1;
      c.t += a / rate; done += a; c.wetE += a * m;
      if (out) {
        wx.worked(c, t0, place);
        const why = wx.after(c);
        if (why) { walkTo("H", why); continue; }
      }
      if (carry) { c.load += a; if (c.load >= S.load - 1e-9 || want - done <= 1e-9) walkTo("H", "carry"); }
    }
    wx.stop(c);
    return done;
  }
  // The most whole energy (up to e) a person could still get done at `place` today, in whole units
  // (UNIT, or the last of e). Without carrying it's worked out directly; with it, by stepping through
  // the day on a copy of their clock.
  function canAt(c, place, e, rate, S, collect) {
    if (!(rate > 0) || e <= 0) return 0;
    const go = S.between(c.at, place), back = S.between(place, "H");
    if (!isFinite(go) || !isFinite(back)) return 0;
    if (collect && place !== "H" && back > 0) return Math.floor(workAt({ ...c, wx: null }, place, Math.floor(e + 1e-9), rate, S, true) + 1e-9);   // as if fair weather
    const steps = (from, until) => (from < until - 1e-9 ? UNIT * Math.ceil(((until - from) * rate) / UNIT - 1e-9) : 0);   // the units that can start, as energy
    let t = c.t, n = 0;
    if (!c.lunched) {
      if (t >= S.lunch - 1e-9) t += S.between(c.at, "H") + S.meal + back;
      else {
        t += go;
        if (t < S.lunch - 1e-9) { n = steps(t, S.lunch); if (n >= e) return e; t += n / rate; }
        t += 2 * back + S.meal;
      }
    } else t += go;
    // After lunch: units that end, with the walk home, by S.active (all of what's left if it fits)
    const left = e - n, room = (S.active - back - t) * rate;
    if (room <= 1e-9) return Math.min(e, n);
    return n + (left <= room + 1e-9 ? left : UNIT * Math.floor(room / UNIT + 1e-9));
  }
  // Once someone's work is done: they walk home and wait by the house; they go in for lunch at S.lunch
  // (or when they get back, if later) and for the night at S.active (or when they get back).
  // Returns { Lh, E, out }: when they got home for lunch, went in for the night, and, if they've no
  // energy left (spent), when they were back at the house with nothing left to do (out).
  function dayEnd(c, S, spent) {
    const back = S.between(c.at, "H"), home = c.t + back;
    c.walked += back; c.at = "H"; c.load = 0;
    const tl = c.lunched ? { Lh: c.Lh, E: Math.max(S.active, home) } : { Lh: Math.max(S.lunch, home), E: S.active };
    if (spent) tl.out = home;
    return tl;
  }
  // Fullness: the food still in someone, as a share of a full day's need. At HUNGRY_AT or less they're
  // hungry (Micro mode shows it); they keep working while they have energy, but once they've none left
  // they may go in early, whatever the hour.
  const HUNGRY_AT = 0.2;
  // A person's day once the share g is known: breakfast and lunch are each half the day's share of their
  // need, and a meal keeps them full for g × S.active ÷ 2 hours (what's left of breakfast carries over to
  // lunch). From their timeline (dayEnd): s1, s2, the hours they spent out and empty before lunch and
  // after it; Lh, E, when they went in for lunch (null if they'd gone in for the day) and for the day;
  // early, when they went in early, hungry with no energy left (or null). tl.inside, if given: the hours
  // they spent indoors from the cold ([[from, to]], the Clothing page), which pause hunger as going in does.
  function dayOut(g, tl, S) {
    const full = (g * S.active) / 2, low = HUNGRY_AT * S.active;   // hours of food that keep them above hungry
    const indoors = (a, b) => (tl.inside ? tl.inside.reduce((t, [p, q]) => t + Math.max(0, Math.min(b, q) - Math.max(a, p)), 0) : 0);
    const out = (a, b) => Math.max(0, b - a - indoors(a, b));   // hours out of the house between a and b
    const spent = tl.out !== undefined && tl.out !== null;
    if (spent && tl.out < tl.Lh - 1e-9) {   // nothing left to do before lunch: in once they're hungry
      const goIn = Math.max(tl.out, full - low);
      if (goIn < tl.Lh - 1e-9) return { s1: out(full, goIn), s2: 0, Lh: null, E: goIn, early: goIn };
    }
    const after = Math.max(full, tl.Lh) + full;   // when lunch runs out
    let E = tl.E, early = null;
    if (spent) { const goIn = Math.max(tl.out, tl.Lh + S.meal, after - low); if (goIn < E - 1e-9) { E = goIn; early = goIn; } }
    return { s1: out(full, tl.Lh), s2: out(after, E), Lh: tl.Lh, E, early };
  }
  // Days of life a person loses to hunger in a day: while out and empty they lose 2k × t ÷ u² days an
  // hour, t being the hours they've been hungry so far that day (one food lasts u = S.active ÷ need
  // hours). Eating or going in stops the clock but doesn't reset it; it starts again from 0 the next day.
  // So the day costs k × ((s1 + s2) ÷ u)².
  function hungerOf(g, tl, S, k, need) {
    if (!(need > 0)) return 0;
    const d = dayOut(g, tl, S), u = S.active / need, s = d.s1 + d.s2;
    return (k * s * s) / (u * u);
  }
  // Someone who spends the whole day by the house (or no schedule); with nothing to do (idle), they may
  // go in early when hungry
  const atHome = (S, idle) => (idle ? { Lh: S.lunch, E: S.active, out: S.meal } : { Lh: S.lunch, E: S.active });

  // ---------- Time at the house, for school ----------
  // When someone working `hours` at the house works, in hours after waking: from breakfast until lunch,
  // then after lunch until the hours are done or the day is over: [[from, to], ...]
  function workSpans(hours, S) {
    const morning = Math.min(S.lunch, S.meal + hours), rest = hours - (morning - S.meal);
    const out = [[S.meal, morning]];
    if (rest > 1e-9) out.push([S.lunch + S.meal, Math.min(S.active, S.lunch + S.meal + rest)]);
    return out;
  }
  // When a child is in class: from `from` hours after waking, but not at lunch
  const classSpans = (from, S) => [[Math.max(from, S.meal), S.lunch], [Math.max(from, S.lunch + S.meal), S.active]].filter(([a, b]) => b > a);
  // The hours the scholar teaches (spans a) while a child is there (spans b), at most `most`, on average
  // over the child waking Δ hours after the scholar: Δ is the difference of two even draws over the
  // wake-up window, so it spreads as a triangle over ±(wake1 − wake0)
  const SHARE_STEPS = 16;
  const shared = new WeakMap();   // S → Map: sharedHours remembered, as only a few spans come up
  function sharedHours(a, b, most, S) {
    let memo = shared.get(S);
    if (!memo) { memo = new Map(); shared.set(S, memo); }
    const key = `${a.join()};${b.join()};${most}`;
    let v = memo.get(key);
    if (v === undefined) { v = shared1(a, b, most, S); memo.set(key, v); }
    return v;
  }
  function shared1(a, b, most, S) {
    const W = S.wake1 - S.wake0;
    let sum = 0, weights = 0;
    for (let i = 0; i < (W > 0 ? SHARE_STEPS : 1); i++) {
      const d = W > 0 ? -W + ((i + 0.5) * 2 * W) / SHARE_STEPS : 0, wt = W > 0 ? W - Math.abs(d) : 1;
      let both = 0;
      for (const [a0, a1] of a) for (const [b0, b1] of b) both += Math.max(0, Math.min(a1, b1 + d) - Math.max(a0, b0 + d));
      sum += wt * Math.min(most, both); weights += wt;
    }
    return sum / weights;
  }

  // ---------- The weather (the Clothing page) ----------
  // What Micro (micro-model.js) and Macro (village-model.js's macroWeather) share: the temperature and rain
  // a person feels, and dressing to go out. C, Rn: the day's cold and rain, either null ({ tempAt(clock
  // hour), k, clothStep, fireStep, fireHours, fireReach, fireEnergy } and { at(clock hour), fireOut(lit at,
  // hours), hatStep, limit }); E: the economy's state (衣, 笠, timber); S: the day (S.spots: the work
  // sites' tiles); wet: the day's rain totals (wet.hats counts the 笠 put on). A person x: { h, cloth, hat,
  // timber }. Times are clock hours.
  function weatherOf(C, Rn, E, S, wet) {
    const EPS = 1e-9, fires = [];   // { x, y, t0, t1, warm } at the tiles worked
    const spot = (place) => (S.spots ? S.spots[place] : null);
    const clothWarm = (x) => (x.cloth ? C.clothStep * x.cloth.tier : 0);
    // The warmest fire burning within reach of place at T (0: none, or place null: walking)
    const fireWarm = (place, T) => {
      const s = place && spot(place);
      if (!s || !isFinite(s.d)) return 0;
      let w = 0;
      for (const f of fires) if (T >= f.t0 - EPS && T < f.t1 - EPS && Math.hypot(f.x - s.x, f.y - s.y) <= C.fireReach + EPS) w = Math.max(w, f.warm);
      return w;
    };
    const felt = (x, place, T) => C.tempAt(T) + clothWarm(x) + fireWarm(place, T);
    // The rain x feels at T (under their 笠); whether it's at the limit or more; whether no fire can be lit (10)
    const wetAt = (x, T) => Math.max(0, Rn.at(T) - (x.hat ? Rn.hatStep * x.hat.tier : 0));
    const tooWet = (x, T) => !!Rn && wetAt(x, T) >= Rn.limit - EPS;
    const noFire = (T) => !!Rn && Rn.at(T) >= 10;
    // Ready to go out in the rain at T: under the limit as they are, or in the 笠 of the lowest tier that
    // brings it under; false: none does, so they stay in
    function hatFor(x, T) {
      if (!tooWet(x, T)) return true;
      if (!E || !E.clothFor || !(Rn.hatStep > 0)) return false;
      const b = E.clothFor(Math.max(x.hat ? x.hat.tier + 1 : 1, Math.floor((Rn.at(T) - Rn.limit) / Rn.hatStep + EPS) + 1), "hat");
      if (!b) return false;
      if (x.hat) E.untake(x.hat);
      x.hat = b; E.wear(x.h, b, 2); wet.hats++;
      return true;
    }
    function putOn(x, c) { if (x.cloth) E.untake(x.cloth); x.cloth = c; E.wear(x.h, c); }
    // Ready to go out to place at T with e energy: warm enough as they are (counting a fire burning there
    // when they'd arrive), or in the 衣 of the lowest tier that does it, or in the warmest 衣 there is with a
    // timber of the lowest tier that makes up the rest (none in a rain at 10); false: none of these, so they
    // stay in
    function dressFor(x, place, T, e) {
      const air = C.tempAt(T) + fireWarm(place, T + S.between("H", place));
      if (air + clothWarm(x) >= 0) return true;
      if (!E || !E.clothFor) return false;
      const c = E.clothFor(Math.max(x.cloth ? x.cloth.tier + 1 : 1, Math.ceil(-air / C.clothStep - EPS)));
      if (c) { putOn(x, c); return true; }
      const best = E.takeTool("clothes");
      if (best && (!x.cloth || best.tier > x.cloth.tier)) putOn(x, best); else if (best) E.untake(best);
      const need = Math.ceil(-(air + clothWarm(x)) / C.fireStep - EPS);
      const t = need <= 4 && e > C.fireEnergy + EPS && !noFire(T) ? E.timberFor(need) : 0;
      if (!t) return false;
      E.takeTimber(t); x.timber = t;
      return true;
    }
    // x lights their timber at place at T: it warms everyone within reach for fireHours, less in the rain
    function light(x, place, T) {
      const s = spot(place);
      if (s) fires.push({ x: s.x, y: s.y, t0: T, t1: Rn ? Rn.fireOut(T, C.fireHours) : T + C.fireHours, warm: C.fireStep * x.timber });
      x.timber = 0;
    }
    return { fires, felt, wetAt, tooWet, noFire, hatFor, dressFor, light };
  }

  // A day with no walking, for a working page without a map
  const NO_MAP = { active: 12, lunch: 5, meal: 0.4, wake0: 4, wake1: 8, between: () => 0 };

  window.DayModel = {
    NO_MAP, HUNGRY_AT, UNIT, newClock, workAt, canAt, dayEnd, dayOut, hungerOf, atHome, workSpans, classSpans, sharedHours, weatherOf,
  };
})();
