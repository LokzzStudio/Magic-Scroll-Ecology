// The day, for the Production page on: each person's clock from waking (breakfast, walking out, work,
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
  // by the house; at S.active hours they finish the energy under way and walk home for the night.
  // Anyone with nothing left to do waits by the house. S.between(a, b): hours walking from a to b
  // ("H" the house, "F" farm, "P" pasture, "T" forest, "M" mine).
  // Collecting (milking, harvest, timber, wool, stone) is carried home (搬運) after every S.load energy
  // and at the end of the job; anything still in hand is dropped off when they go home for lunch.
  // A person's clock: the time, where they are, what they're carrying, whether they've had lunch (and
  // got home for it at Lh)
  const newClock = (S) => ({ t: S.meal, at: "H", load: 0, lunched: false, Lh: 0, walked: 0 });
  // Work up to `want` energy at `place`, `rate` energy an hour, a whole energy at a time (the last may be
  // a part if want isn't whole), walking there first, carrying it home if it's collecting, and breaking
  // for lunch. Returns the energy done.
  // (The clock is kept in locals while it runs: this is the hottest loop of a Macro day. A day that
  // starts on a fresh clock depends only on the place, the work, the rate and carrying, so each is
  // worked out once for a given day S (S never changes once made) and remembered.)
  const freshDays = new WeakMap();   // S → Map(key → { done, clock })
  const CLOCK = ["t", "at", "load", "lunched", "Lh", "walked"];
  function workAt(c, place, want, rate, S, collect) {
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
      if (at !== place) {   // walk there (home drops off the load)
        const d = at === "H" ? back : S.between(at, place);
        t += d; walked += d; at = place; if (place === "H") load = 0;
        continue;
      }
      const a = Math.min(1, want - done);
      t += a / rate; done += a;
      if (carry) { load += a; if (load >= S.load - 1e-9 || want - done <= 1e-9) { t += back; walked += back; at = "H"; load = 0; } }
    }
    c.t = t; c.at = at; c.load = load; c.lunched = lunched; c.Lh = Lh; c.walked = walked;
    return done;
  }
  // The most whole energy (up to e) a person could still get done at `place` today. Without carrying
  // it's worked out directly; with it, by stepping through the day on a copy of their clock.
  function canAt(c, place, e, rate, S, collect) {
    if (!(rate > 0) || e <= 0) return 0;
    const go = S.between(c.at, place), back = S.between(place, "H");
    if (!isFinite(go) || !isFinite(back)) return 0;
    if (collect && place !== "H" && back > 0) return Math.floor(workAt({ ...c }, place, Math.floor(e + 1e-9), rate, S, true) + 1e-9);
    const steps = (from, until) => (from < until - 1e-9 ? Math.ceil((until - from) * rate - 1e-9) : 0);
    let t = c.t, n = 0;
    if (!c.lunched) {
      if (t >= S.lunch - 1e-9) t += S.between(c.at, "H") + S.meal + back;
      else {
        t += go;
        if (t < S.lunch - 1e-9) { n = steps(t, S.lunch); if (n >= e) return e; t += n / rate; }
        t += 2 * back + S.meal;
      }
    } else t += go;
    return Math.min(e, n + steps(t, S.active));
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
  // early, when they went in early, hungry with no energy left (or null).
  function dayOut(g, tl, S) {
    const full = (g * S.active) / 2, low = HUNGRY_AT * S.active;   // hours of food that keep them above hungry
    const spent = tl.out !== undefined && tl.out !== null;
    if (spent && tl.out < tl.Lh - 1e-9) {   // nothing left to do before lunch: in once they're hungry
      const goIn = Math.max(tl.out, full - low);
      if (goIn < tl.Lh - 1e-9) return { s1: Math.max(0, goIn - full), s2: 0, Lh: null, E: goIn, early: goIn };
    }
    const after = Math.max(full, tl.Lh) + full;   // when lunch runs out
    let E = tl.E, early = null;
    if (spent) { const goIn = Math.max(tl.out, tl.Lh + S.meal, after - low); if (goIn < E - 1e-9) { E = goIn; early = goIn; } }
    return { s1: Math.max(0, tl.Lh - full), s2: Math.max(0, E - after), Lh: tl.Lh, E, early };
  }
  // Days of life a person loses to hunger in a day: once full runs out they lose 2k × t ÷ u² days an
  // hour, t hours into the hungry spell (one food lasts u = S.active ÷ need hours), until they eat or go
  // in: a spell of s hours costs k × (s ÷ u)².
  function hungerOf(g, tl, S, k, need) {
    if (!(need > 0)) return 0;
    const d = dayOut(g, tl, S), u = S.active / need;
    return (k * (d.s1 * d.s1 + d.s2 * d.s2)) / (u * u);
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

  // A day with no walking, for a working page without a map
  const NO_MAP = { active: 12, lunch: 5, meal: 0.4, wake0: 4, wake1: 8, between: () => 0 };

  window.DayModel = {
    NO_MAP, HUNGRY_AT, newClock, workAt, canAt, dayEnd, dayOut, hungerOf, atHome, workSpans, classSpans, sharedHours,
  };
})();
