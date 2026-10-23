// Micro mode for the Attribute page and every page after it: one village day, person by person, each
// on their own clock, under the same rules the macro model (village-model.js) works out for the village
// as a whole. VillageModel.run({ mode: "micro" }) calls MicroModel.day(x) in place of the day's work.
//   Waking: everyone wakes between S.wake0 and S.wake1 o'clock, as a Poisson process at λ = N ÷ (wake1 −
//     wake0) an hour (N people), held to the window: N + 1 exponential gaps, scaled to fit.
//   Breakfast by the house (S.meal hours); then the job board, in the day's priority order. At S.lunch
//     hours after waking: anyone idle goes home at once, anyone working finishes the energy under way
//     first; lunch is eaten by the house, then back to the board. At S.active hours: the same, for the
//     night. Walking between places takes S.between hours. Collecting (milking, harvest, timber, wool,
//     stone) is carried home (搬運) after every S.load energy and at the end of the job, then back out.
//     Anyone back at the house with no energy left may go in early once hungry (day-model.js's
//     dayOut, worked out once the day's share is known: it changes nobody's work).
//   The board: milking (pooled: one milker to each adult cow for the day, no limit on a cow), the fields
//     (pooled: one person to each of the 4 for the day; while tending, the 4 fields' daily limit, each at
//     most one field's; at harvest, the work the rice wants), and from the Resources page on
//     the loom and the forge (one crafter each a day), shearing (pooled: the wool on the sheep), quarrying
//     and woodcutting. Taking a pooled job reserves the energy
//     the person can give it today, so nobody walks out for work someone else has already claimed. As in
//     the macro model, those who may milk but not do today's field work (elders) milk first: anyone
//     else leaves them a cow each.
//   Children fill food work the free grown-ups can't, then go to their scholar's class while that
//     scholar teaches. Each scholar teaches whenever a child of their class is in it and writes poetry
//     the rest of the time; a child takes home effectiveness × the smaller of the two's energy spent while
//     both were in class, ÷ the children in the class.
//   From the Resources page on, each energy brings in the person's effectiveness at the job's skill
//     (x.eff), as a yield: tending and shearing use up the fields' daily limit and the sheep's wool
//     energy for energy, a cow has no limit, and all three bring in effectiveness × that; timber, stone,
//     knowledge from teaching and poetry are × it too. At the harvest it's speed (the standing rice is
//     all there is): its need and what's reserved are work, energy × effectiveness.
// x: { S, rand, people, p, may, energyOf(h) → { e, r } | null, cows, fieldE, riceWanted, tending,
//   order, econ (makeEconomy's state()), school: { scholars: [{ h, day, reads }], classOf: Map(child h →
//   their scholar's h; only children with a class today), params, learn, read } | null, trace: {} | null,
//   happyOf: h → happiness | null, eff: (h, skill) → effectiveness | null, levelsOf: h → { skill: level } | null,
//   cold: { tempAt(clock hour) → °C, k, clothStep, fireStep, fireHours, fireReach, fireEnergy } | null (Clothing),
//   water: DayModel.wateringOf's day | null (Watering),
//   rain: { at(clock hour) → rainfall 0–10, fireOut(lit at, hours) → when a fire goes out, hatStep, limit } | null (Clothing) }.
//   The cold (with x.cold): the house is warm; out of it, someone whose felt temperature (the hour's, plus
//     clothStep × their 衣's tier, plus fireStep × the tier of the warmest fire within fireReach tiles) is
//     below 0 °C is in hypothermia, its toll weighing k × (felt ÷ 10)² (DayModel.weatherOf; it starts again
//     from 0 each spell), and each unit of work out there is cut by (felt ÷ 10)², taken as it starts. At the
//     limit (−5 °C) or colder they finish the unit in hand, then go home to warm up. Leaving the house for
//     work, below 0 °C they first put on the 衣 of the lowest tier that's warm enough; with none, the warmest
//     there is, and they take a timber of the lowest tier that makes up the rest, to light at the work site
//     (fireEnergy energy; it burns fireHours); short of that, they go if it feels warmer than the limit, and
//     otherwise stay in and look again on the hour.
//   The rain (with x.rain): out of the house, the rain someone feels is the hour's rainfall less hatStep ×
//     their 笠's tier (never below 0), and each unit of work there does × (1 − (felt ÷ 10)²), taken as it
//     starts. From limit on, they finish the unit in hand and go home. Leaving the house for work with the
//     rain at the limit or more, they put on the 笠 of the lowest tier that brings it under; with none, they
//     stay in and look again on the hour. Indoors from the weather they still eat, and hunger runs on at half its toll (DayModel.hungerOf). Rain burns
//     a fire down faster (x.rain.fireOut), and at 10 none can be lit (nobody takes a timber out then).
//   Watering (with x.water): each field (numbered in the order taken) has a water level; while tending,
//     each energy uses some of it, and a farmer who finds it at the fetching level or lower (arriving, or
//     after a unit) walks to the nearer of the well (W, while it has water) and the river (R, while it runs), takes
//     1 water and walks back with it (+1 level).
// Returns { work (as assignEnergy's), timelines: Map(h → { Lh, E, out }), left: Map(h → energy left
// unspent), spent: Map(h → energy spent on each job), walk, lesson, reading, pupils }, and with the cold
// cold: Map(h → days of life the cold took), coldHours (everyone's hours in hypothermia) and fires (lit),
// with the rain wet: { inH (everyone's hours in from it), lost (work out of the house it took), outWork
// (work done out of the house), hats (笠 put on) }, and fills x.trace with everyone's day if given.
(function () {
  const EPS = 1e-9, UNIT = DayModel.UNIT;   // work is done UNIT energy at a time
  const CLASS = { id: "class", place: "H", kind: "class" };

  // A binary heap of events, earliest first (ties: first scheduled first)
  function heap() {
    const a = [];
    const less = (x, y) => x.t < y.t || (x.t === y.t && x.s < y.s);
    return {
      get size() { return a.length; },
      push(ev) {
        a.push(ev);
        for (let i = a.length - 1; i > 0; ) { const j = (i - 1) >> 1; if (!less(a[i], a[j])) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
      },
      pop() {
        const top = a[0], end = a.pop();
        if (a.length) {
          a[0] = end;
          for (let i = 0; ; ) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < a.length && less(a[l], a[m])) m = l;
            if (r < a.length && less(a[r], a[m])) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]]; i = m;
          }
        }
        return top;
      },
    };
  }

  // Each person's effectiveness by job id (the board's and the jobs table's), from x.eff(h, skill); ONE
  // without skills
  const JOB_SKILL = { milk: "milk", field: "farm", tend: "farm", harvest: "farm", wood: "wood", wool: "wool", stone: "stone", weave: "weave", forge: "forge", teach: "teach", read: "poetry", poetry: "poetry" };
  const ONE = Object.fromEntries(Object.keys(JOB_SKILL).map((id) => [id, 1]));

  function day(x) {
    const effTable = (h) => { const t = {}; for (const id in JOB_SKILL) t[id] = x.eff(h, JOB_SKILL[id]); return t; };
    const VM = window.VillageModel, { MALE } = HumanModel;
    const { S, rand, may, p, tending } = x, E = x.econ || null, sch = x.school || null;
    const fieldJob = tending ? "tend" : "harvest";
    const trace = x.trace || null;

    // ---------- People ----------
    const agents = [], byH = new Map(), schOf = new Map(sch ? sch.scholars.map((s) => [s.h, s]) : []);
    for (const h of x.people) {
      const sd = schOf.get(h), isScholar = !!sd;
      const er = isScholar ? { e: sd.day.energy, r: sd.day.rate } : x.energyOf(h);
      const kind = isScholar ? "scholar" : HumanModel.stage(h, p) === "child" ? "kid" : "grown";
      const e = er ? er.e : 0;
      agents.push({
        h, kind, e, e0: e, r: er ? er.r : 0, w: 0, loc: "H", st: "asleep", freeAt: S.meal, job: null, res: 0, load: 0,
        lunched: false, Lh: null, E: null, out: null, over: false, walked: 0, ver: 0, unit: 0, cls: false, know: 0, met: false,
        spent: { milk: 0, field: 0, wood: 0, wool: 0, stone: 0, weave: 0, forge: 0, teach: 0, poetry: 0, class: 0, fire: 0 }, blade: undefined, fork: undefined,
        cloth: null, hat: null, wetMult: 1, coldMult: 1, fieldIx: -1, water: 0, inWhy: null, timber: 0, away: false, seg: null, lastT: 0, coldSince: null, coldLost: 0, coldH: 0, spells: trace ? [] : null, inSince: null, inside: [],
        milkOnly: kind === "grown" && may(h, "milk") && !may(h, fieldJob), held: new Map(), reads: isScholar && sd.reads, teacher: null, pupils: [], taughtH: 0,
        eff: x.eff ? effTable(h) : ONE,
        tr: trace ? [] : null,
      });
      byH.set(h, agents[agents.length - 1]);
    }
    // Each child's scholar (teacher), and each scholar's class (pupils, in village order)
    if (sch) for (const k of agents) {
      const t = sch.classOf.get(k.h);
      if (t) { k.teacher = byH.get(t); k.teacher.pupils.push(k); }
    }
    // Wake-up times: N + 1 exponential gaps, scaled to the window, handed out in a random order
    const n = agents.length, gaps = new Float64Array(n + 1);
    let total = 0;
    for (let i = 0; i <= n; i++) { gaps[i] = -Math.log(1 - rand()); total += gaps[i]; }
    const wakeOrder = agents.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [wakeOrder[i], wakeOrder[j]] = [wakeOrder[j], wakeOrder[i]]; }
    for (let k = 0, acc = 0; k < n; k++) { acc += gaps[k]; agents[wakeOrder[k]].w = S.wake0 + ((S.wake1 - S.wake0) * acc) / total; }

    // ---------- The job board ----------
    // Pooled jobs: need, done and reserved work (energy × effectiveness). Slot jobs: one worker at a time;
    // more(a) is the energy the next unit may take (0 when there's nothing left), hasWork() whether it
    // has any. credit(work): work done.
    // collect: carried home after every S.load energy
    // A yield job's need, done and reserved are energy, and `out` what it brought in; the harvest's are work.
    // places: how many may work it today, one to a place (a cow, a field, a sheep, a place at the mine or
    // the forest), each keeping theirs all day (a.held: their places, each with the most energy it takes,
    // capOf(k) for the k-th taken; none: no limit); taken: how many places are held
    const pooled = (id, place, need, collect, credit, places = Infinity, capOf = null) => ({ id, place, kind: "pool", need, done: 0, res: 0, out: 0, places, taken: 0, capOf, collect, credit: credit || (() => {}), open() { return this.need - this.done - this.res; } });
    const milk = pooled("milk", "P", Infinity, true, null, x.cows);
    const farmed = E && E.cr ? (w, a, energy) => E.farmed(tending ? a.fork : a.blade, energy) : null;   // farming wears its tool: a 叉 tending, a 刀 at the harvest
    const field = tending ? pooled("field", "F", VM.FULL_CREW * x.fieldE, false, farmed, VM.FULL_CREW, () => x.fieldE)
      : x.riceWanted > EPS ? pooled("field", "F", Math.ceil(x.riceWanted * VM.DAY_ENERGY - EPS), true, farmed, VM.FULL_CREW) : null;
    let wood = null, wool = null, stone = null;
    const stations = {};
    if (E) {
      const { today, res } = E;
      const credit = (id) => (amt, a, energy) => { today.spent[id] += amt; E.collected(id, a.h, a.blade, amt, energy); };
      wool = pooled("wool", "P", Math.ceil(today.woolLeft / res.perEnergy.wool - EPS), true, (amt, a, energy) => { today.spent.wool += amt; today.woolLeft -= energy * res.perEnergy.wool; E.collected("wool", a.h, a.blade, amt, energy); },
        today.places.wool, (k) => today.sheepWool[k] / res.perEnergy.wool);
      stone = pooled("stone", "M", Infinity, true, credit("stone"), today.places.stone);
      wood = pooled("wood", "T", Infinity, true, credit("wood"), today.places.wood);
      if (E.cr) for (const kind of ["weave", "forge"]) {
        const items = E.cr.items.filter((it) => it.job === kind), st = E.stations[kind];
        if (!items.length) continue;
        stations[kind] = {
          id: kind, place: "H", kind: "slot", worker: null, today: null,   // today: the day's one crafter
          hasWork: () => !!st.job || E.canStart(items),
          more: (a) => (st.job || E.startCraft(items, st) ? Math.min(UNIT, a.e, st.job.left / effAt(a, kind)) : 0),
          credit: (amt, a, energy) => E.creditCraft(st, kind, a.h, amt, a.blade, energy),
        };
      }
    }

    // ---------- Events ----------
    const q = heap();
    let seq = 0, now = 0;
    const schedule = (a, t, k) => { a.ver++; q.push({ t, s: seq++, a, v: a.ver, k }); };
    const rel = (a) => now - a.w;
    // A person's day so far as a clock (day-model.js), for working out what they could still do
    const clockOf = (a) => ({ t: Math.max(rel(a), a.freeAt), at: a.loc, load: a.load, lunched: a.lunched, Lh: a.Lh || 0, walked: 0 });
    // A person's effectiveness at a job (a job id, or the jobs table's): the work each energy does there
    // plus the bonus of their tool for it (a 叉 hayfork tending, a 刀 blade at the harvest and collecting)
    const TOOL_OF = { field: tending ? "fork" : "blade", wool: "blade", wood: "blade", stone: "blade", weave: "blade", forge: "blade" };   // 紡織 and 鍛造 take a 刀 too
    const effAt = (a, id) => { const t = TOOL_OF[id] && a[TOOL_OF[id]]; return a.eff[id] + (t ? t.bonus : 0); };
    // What they could still do at a place: energy, and as work at a job
    const est = (a, place, collect) => DayModel.canAt(clockOf(a), place, a.e, a.r, S, collect);
    // Whether they could still do a unit there today (what est > 0 asks, worked out for one unit only):
    // plainly yes when, after lunch or starting before it, the walk there, the unit and the walk home fit
    // in the day; otherwise worked out
    const canUnit = (a, place, collect) => {
      const t = Math.max(rel(a), a.freeAt) + S.between(a.loc, place);
      if (a.e >= 1 && a.r > 0 && (a.lunched || t < S.lunch - EPS) && t + Math.min(a.e, UNIT) / a.r + S.between(place, "H") <= S.active - EPS) return true;
      return DayModel.canAt(clockOf(a), place, Math.min(a.e, UNIT), a.r, S, collect) > EPS;
    };
    // Yield jobs (isYield): what a person can take of one is energy; elsewhere, work. capEff: the measure
    // of each energy against a job's need
    const isYield = (id) => id === "milk" || id === "wool" || (tending && (id === "field" || id === "tend"));
    const capEff = (a, id) => (isYield(id) ? 1 : effAt(a, id));
    const estWork = (a, place, collect, id) => est(a, place, collect) * capEff(a, id);
    const note = (a, s, more) => { a.st = s; if (a.tr) a.tr.push({ t: now, s, at: a.loc, e: a.e, ...more }); };

    // ---------- The weather (the Clothing page) ----------
    // The cold and the rain, with the rules both modes share (DayModel.weatherOf: what a person feels,
    // dressing to go out, fires). a.away: out of the house; a.seg: where they've been since they last looked
    // (null: walking)
    const C = x.cold || null, Rn = x.rain || null, WX = !!(C || Rn), wet = { inH: 0, lost: 0, outWork: 0, hats: 0 };
    const Wx = WX ? DayModel.weatherOf(C, Rn, E, S, wet) : null, WT = x.water || null;
    let firesLit = 0;
    // When felt crosses 0 between lo and hi (the hours change smoothly)
    const crossing = (f, lo, hi, toCold) => { for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if ((f(mid) < 0) === toCold) hi = mid; else lo = mid; } return hi; };
    function warmUp(a, t) {
      a.coldH += Math.max(0, t - a.coldSince);
      if (a.spells) a.spells.push([a.coldSince, t]);
      a.coldSince = null;
    }
    // Since they last looked: when they went into hypothermia, or came out of it, and its toll so far
    function coldLook(a) {
      if (!C || !a.away) return;
      const place = a.seg, f = (t) => Wx.felt(a, place, t), t0 = Math.min(a.lastT, now), u = S.active / HumanModel.needOf(a.h, p);
      if (a.coldSince === null) { if (f(now) < 0) { a.coldSince = f(t0) < 0 ? t0 : crossing(f, t0, now, true); a.coldLost += Wx.toll(f, a.coldSince, a.coldSince, now, u); } }
      else if (f(now) >= 0) { const tw = f(t0) >= 0 ? t0 : crossing(f, t0, now, false); a.coldLost += Wx.toll(f, a.coldSince, t0, tw, u); warmUp(a, tw); }
      else a.coldLost += Wx.toll(f, a.coldSince, t0, now, u);
      a.lastT = now;
    }
    // Too cold to stay out: at the limit or colder where they are
    const tooCold = (a) => !!C && a.away && Wx.tooCold(a, a.loc, now);
    let coldCut = 0;   // the work out of the house the cold took
    const tooWet = (a, t) => !!Rn && Wx.tooWet(a, t);
    // Too cold or too wet to go out: let go of the job and look again on the hour
    // Indoors from the weather (a.inSince: since when; a.inWhy: "cold" or "rain"; a.inside: the spells, in
    // hours since waking, for hunger)
    const goIn = (a, why) => { if (a.inSince === null) { a.inSince = now; a.inWhy = why; } };
    const comeOut = (a) => { if (a.inSince !== null) { a.inside.push([a.inSince - a.w, now - a.w]); if (a.inWhy === "rain") wet.inH += now - a.inSince; a.inSince = null; } };
    function stayIn(a, why) {
      goIn(a, why);
      drop(a);
      note(a, why === "rain" ? "rain-in" : "cold-in");
      schedule(a, Math.min(Math.floor(now + EPS) + 1, a.w + (a.lunched ? S.active : S.lunch)), "decide");
    }
    // At the work site with a timber: light it (fireEnergy energy)
    function lightFire(a) {
      a.e = Math.max(0, a.e - C.fireEnergy); a.spent.fire += C.fireEnergy;
      Wx.light(a, a.loc, now); firesLit++;
      note(a, "fire");
    }

    // Jobs a person holds: take, keep going, let go
    function take(a, j, amt) {
      a.job = j; a.res = amt;
      if (j.places < Infinity && !a.held.has(j)) { if (j === field) a.fieldIx = j.taken; a.held.set(j, j.capOf ? j.capOf(j.taken) : Infinity); j.taken++; }   // their place for the day (and which field)
      if (j.kind === "pool") j.res += amt;
      else if (j.kind === "slot") { j.worker = a; j.today = a; }
    }
    function drop(a) {
      const j = a.job;
      if (!j) return;
      let reopened = false;
      if (j.kind === "pool") { j.res -= a.res; reopened = a.res > EPS && j.open() > EPS; }
      else if (j.kind === "slot" && j.worker === a) { j.worker = null; reopened = j.hasWork(); }
      else if (j === CLASS) leaveClass(a);
      a.job = null; a.res = 0;
      if (reopened) wakeIdle();
    }
    // Energy the next unit of a person's job may take (0: nothing left for them, or no time to do it and
    // be home by the end of the day)
    function unitOf(a) {
      const amt = unitFor(a);
      return amt > EPS && rel(a) + amt / a.r + S.between(a.job.place, "H") > S.active + EPS ? 0 : amt;
    }
    function unitFor(a) {
      const j = a.job;
      if (j.kind === "pool") {
        if (a.res <= EPS && a.kind !== "kid") { const more = Math.min(j.open(), estWork(a, j.place, j.collect, j.id), capFor(a, j)); if (more > EPS) { a.res += more; j.res += more; } }
        return Math.min(UNIT, a.e, a.res / capEff(a, j.id));
      }
      if (j.kind === "slot") return j.worker === a ? j.more(a) : 0;
      return Math.min(UNIT, a.e);   // quarrying never runs out
    }
    // A unit of amt energy done: it uses up amt × capEff of a pooled job's need, and brings in amt ×
    // effectiveness
    function credit(a, amt) {
      const j = a.job, m = a.wetMult * a.coldMult, used = amt * capEff(a, j.id) * (isYield(j.id) ? 1 : m), full = amt * effAt(a, j.id), work = full * m;
      if (Rn && j.place !== "H") { wet.outWork += work; wet.lost += full * (1 - a.wetMult); }
      if (C && j.place !== "H") coldCut += full * a.wetMult * (1 - a.coldMult);
      if (WT && j === field && tending) WT.used(a.fieldIx, amt);   // tending uses the field's water
      if (j.kind === "pool") { j.done += used; j.res -= used; a.res -= used; j.out += work; }
      j.credit(work, a, amt);
      a.e -= amt; a.spent[j.id] += amt;
      if (a.e < EPS) a.e = 0;
    }

    // ---------- Choosing a job ----------
    const uncommitted = (a) => !a.over && !a.job && a.e > EPS;
    // One to a place (a cow, a field, a sheep, a tile): placeFor(a, j, leave): whether they hold one, or one is free with
    // `leave` more left over for others. At milking, anyone who may do today's field work leaves one for each
    // milk-only grown-up (who may milk but not do today's field work) who hasn't taken a job or a cow yet
    // and could still milk
    const placeFor = (a, j, leave) => a.held.has(j) || j.places - j.taken > leave + EPS;
    const milkOnlyWaiting = () => { let k = 0; for (const a of agents) if (a.milkOnly && !a.held.has(milk) && uncommitted(a) && estWork(a, "P", true, "milk") > EPS) k++; return k; };
    // The most of a pooled job a person may take, in energy: what's left of their place's limit (theirs, or
    // the next free one's), if it has one
    const capFor = (a, j) => {
      if (!j.capOf) return Infinity;
      const most = a.held.has(j) ? a.held.get(j) : j.taken < j.places ? j.capOf(j.taken) : 0;
      return Math.max(0, most - a.spent[j.id]);
    };
    // What the grown-ups who haven't taken a job yet (awake or not) could give a job, and how many of
    // them could but don't hold one of its places yet
    function grownCover(j, jobId) {
      let t = 0, k = 0;
      for (const a of agents) if (a.kind === "grown" && uncommitted(a) && may(a.h, jobId)) {
        const c = Math.min(estWork(a, j.place, j.collect, j.id), capFor(a, j));
        if (c > EPS) { t += c; if (!a.held.has(j)) k++; }
      }
      return { energy: t, people: k };
    }
    const tryPool = (a, j, cap = Infinity) => {
      if (!j) return false;
      const amt = Math.min(j.open(), estWork(a, j.place, j.collect, j.id), capFor(a, j), cap);
      if (amt <= EPS) return false;
      take(a, j, amt);
      return true;
    };
    const trySlot = (a, j) => {
      if (!j || j.worker || (j.today && j.today !== a) || !j.hasWork() || !canUnit(a, j.place, j.collect)) return false;
      take(a, j, 0);
      return true;
    };
    // Trying a job with the day's tool for it: taken first, so what they could do counts it, and put back
    // if the job isn't theirs
    const withTool = (a, key, tryIt) => {
      const fresh = !!(E && E.cr) && a[key] === undefined;
      if (fresh) a[key] = E.takeTool(key);
      if (tryIt()) return true;
      if (fresh) { E.untake(a[key]); a[key] = undefined; }
      return false;
    };
    const tiers = VM.fullOrder(x.order || VM.DEFAULT_ORDER);
    // Each person goes down their own order if they have one (h.order: the Strategy page's player), else the village's
    const tiersOf = (a) => (a.h.order ? a.h.order : tiers);
    function chooseGrown(a) {
      for (const id of tiersOf(a)) {
        if (id === "idle") return false;   // 發呆: nothing more today
        if (id === "milk") {
          if (!may(a.h, "milk") || !placeFor(a, milk, !a.milkOnly && may(a.h, fieldJob) ? milkOnlyWaiting() : 0)) continue;
          if (tryPool(a, milk)) return true;
        } else if (id === "field") {
          if (!may(a.h, fieldJob) || !field || !placeFor(a, field, 0)) continue;
          if (withTool(a, TOOL_OF.field, () => tryPool(a, field))) return true;
        } else if (id === "craft") {
          for (const kind of ["weave", "forge"]) if (stations[kind] && may(a.h, kind) && withTool(a, "blade", () => trySlot(a, stations[kind]))) return true;   // with the day's 刀, if there's one
        } else if (id === "collect" && E) {
          if (withTool(a, "blade", () => {
            for (const r of VM.collectOrder(a.h, E.today)) {
              if (!may(a.h, r)) continue;
              const j = r === "wool" ? wool : r === "stone" ? stone : wood;
              if (placeFor(a, j, 0) && tryPool(a, j)) return true;
            }
            return false;
          })) return true;
        }
      }
      return false;
    }
    // Children go down the order: food work the free grown-ups can't cover, or class while it's on
    // (Education). Returns "food", "class" or "" (nothing)
    function kidChoose(a) {
      for (const id of tiersOf(a)) {
        if (id === "idle") return "";
        if (id === "teach" && classOn(a)) return "class";
        if (id === "milk" && may(a.h, "milk") && placeFor(a, milk, grownCover(milk, "milk").people)) {
          if (tryPool(a, milk)) return "food";
        } else if (id === "field" && field && may(a.h, fieldJob) && field.open() > EPS) {
          const cover = grownCover(field, fieldJob), gap = field.open() - cover.energy;
          if (gap > EPS && placeFor(a, field, cover.people) && withTool(a, TOOL_OF.field, () => tryPool(a, field, gap))) return "food";
        }
      }
      return "";
    }
    // A child's class is on while their scholar (one who teaches before poetry) has energy and hasn't gone in
    const classOn = (k) => !!k.teacher && !k.teacher.over && k.teacher.e > EPS;

    // ---------- What each person does next ----------
    function decide(a, depth = 0) {
      if (a.over) return;
      if (rel(a) >= S.active - EPS) return goHome(a, true);
      if (!a.lunched && rel(a) >= S.lunch - EPS) return goHome(a, false);
      if (a.kind === "scholar") return scholarStep(a);
      if (a.e > EPS && depth < 4) {
        if (a.job && a.job !== CLASS && unitOrDrop(a) <= EPS) drop(a);
        if (a.kind === "kid" && (!a.job || a.job === CLASS)) {
          // A child in class keeps their seat unless food work earlier in the order needs them
          a.job = null;
          if (kidChoose(a) === "class") a.job = CLASS;
          else leaveClass(a);
        } else if (!a.job) chooseGrown(a);
        if (a.job === CLASS) return toClass(a);
        if (a.job) return toWork(a, depth);
      }
      idle(a);
    }
    // Whether a held job still has work for them (without starting it)
    function unitOrDrop(a) {
      const j = a.job;
      if (!canUnit(a, j.place, j.collect)) return 0;   // no time left for a unit there today
      if (j.kind === "slot") return j.worker === a && j.hasWork() ? 1 : 0;
      if (j.kind === "pool") return a.res > EPS || Math.min(j.open(), estWork(a, j.place, j.collect, j.id), capFor(a, j)) > EPS ? 1 : 0;
      return 1;
    }
    function walk(a, dest, why) {
      if (WX) { coldLook(a); if (a.loc === "H" && dest !== "H") { comeOut(a); a.away = true; a.lastT = now; } a.seg = null; }
      const d = S.between(a.loc, dest);
      a.walked += d;
      note(a, "walk", { to: dest, t1: now + d, job: a.job ? a.job.id : null, why });
      a.dest = dest; a.why = why;
      if (dest === "H") a.load = 0;
      schedule(a, now + d, "arrive");
    }
    function toWork(a, depth) {
      const j = a.job;
      if (a.loc !== j.place) {
        if (Rn && a.loc === "H" && j.place !== "H" && !Wx.hatFor(a, now)) return stayIn(a, "rain");
        if (C && a.loc === "H" && j.place !== "H" && !Wx.dressFor(a, j.place, now, a.e)) return stayIn(a, "cold");
        return walk(a, j.place, "work");
      }
      const amt = unitOf(a);
      if (amt <= EPS) { drop(a); return decide(a, depth + 1); }
      a.unit = amt;
      a.wetMult = Rn && j.place !== "H" ? 1 - (Wx.wetAt(a, now) / 10) ** 2 : 1;
      a.coldMult = C && j.place !== "H" ? 1 - Wx.coldCut(Wx.felt(a, j.place, now)) : 1;
      note(a, "work", { job: j.id, t1: now + amt / a.r });
      schedule(a, now + amt / a.r, "unit");
    }
    function toClass(a) {
      if (a.loc !== "H") return walk(a, "H", "work");
      if (a.cls) return schedule(a, a.w + (a.lunched ? S.active : S.lunch), "decide");   // already seated
      a.cls = true; a.since = now;
      note(a, "class", { job: "class" });
      schedule(a, a.w + (a.lunched ? S.active : S.lunch), "decide");
      const t = a.teacher;
      if (t && !t.over && (t.st === "idle" || t.st === "poetry")) {
        if (t.st === "poetry") { const done = (now - t.t0) * t.r; t.e -= done; t.spent.poetry += done; }   // stops mid-poem to teach
        schedule(t, now, "decide");
      }
    }
    function idle(a) {
      drop(a);
      if (a.loc !== "H") return walk(a, "H", "idle");
      comeOut(a);   // waiting by the house, no longer kept in by the weather
      if (a.e <= EPS && a.out === null) a.out = rel(a);   // nothing left to do: may go in early once hungry
      note(a, "idle");
      schedule(a, Math.max(now, a.w + (a.lunched ? S.active : S.lunch)), "decide");
    }
    // Wake everyone waiting by the house with energy, to look at the board again
    function wakeIdle() {
      for (const b of agents) if (!b.over && b.e > EPS && b.loc === "H" && (b.st === "idle" || (b.st === "class" && b.kind === "kid"))) schedule(b, now, "decide");
    }
    function goHome(a, night) {
      if (night) drop(a);
      if (a.cls) { leaveClass(a); if (a.job === CLASS) a.job = null; }
      if (a.loc !== "H") return walk(a, "H", night ? "night" : "lunch");
      arriveHome(a, night);
    }
    function arriveHome(a, night) {
      comeOut(a);
      if (night) { a.E = rel(a); a.over = true; note(a, "inside"); if (a.kind === "scholar") wakeIdle(); return; }
      a.Lh = rel(a); a.lunched = true; a.freeAt = a.Lh + S.meal;
      note(a, "eat", { meal: "lunch", t1: now + S.meal });
      schedule(a, now + S.meal, "decide");
    }
    // A child in class learns while their scholar teaches: knowPerEnergy × the smaller of the two's energy
    // spent over the time ÷ the children in the class, the child spending their own energy as they go.
    // lessonTo(k): up to now.
    function lessonTo(k) {
      const t = k.teacher;
      if (t && t.st === "teach" && k.cls) {
        let dt = now - Math.max(k.since, t.t0);
        if (dt > EPS && k.e > EPS) {
          dt = Math.min(dt, k.e / k.r);
          const kE = dt * k.r;
          k.know += (sch.params.knowPerEnergy * effAt(t, "teach") * Math.min(dt * t.r, kE)) / t.pupils.length; k.e -= kE; k.spent.class += kE; k.met = true;
        }
      }
      k.since = now;
    }
    function leaveClass(k) { if (k.cls) { lessonTo(k); k.cls = false; } }
    // A scholar goes down the order: teaching whoever of their class is in it (Education), or poetry
    function scholarStep(a) {
      if (a.e <= EPS) { idle(a); wakeIdle(); return; }
      const pupils = a.pupils.filter((k) => k.cls && k.e > EPS);
      for (const id of tiersOf(a)) {
        if (id === "idle") break;
        const teach = id === "teach" && pupils.length > 0;
        if (!teach && !(id === "read" && a.reads)) continue;
        a.unit = Math.min(UNIT, a.e); a.t0 = now;
        if (rel(a) + a.unit / a.r > S.active + EPS) break;   // no time to finish it today
        note(a, teach ? "teach" : "poetry", { job: teach ? "teach" : "poetry", t1: now + a.unit / a.r, pupils: pupils.length });
        schedule(a, now + a.unit / a.r, teach ? "teach" : "poem");
        return;
      }
      idle(a);
    }

    for (const a of agents) schedule(a, a.w, "wake");
    while (q.size) {
      const ev = q.pop(), a = ev.a;
      if (ev.v !== a.ver) continue;
      now = ev.t;
      switch (ev.k) {
        case "wake":
          note(a, "eat", { meal: "breakfast", t1: now + S.meal });
          schedule(a, now + S.meal, "decide");
          break;
        case "decide": decide(a); break;
        case "arrive":
          if (WX && a.away) {
            coldLook(a);
            if (a.dest === "H") {
              if (a.coldSince !== null) warmUp(a, now);
              a.away = false;
              if (a.why === "warm") goIn(a, "cold"); else if (a.why === "rain") goIn(a, "rain");
              if (a.timber) { E.untakeTimber(a.timber); a.timber = 0; }   // turned back by the rain before lighting it
            } else a.seg = a.dest;
          }
          a.loc = a.dest;
          if (WX && a.away) {
            if (tooWet(a, now) && a.why !== "night" && a.why !== "lunch") { walk(a, "H", "rain"); break; }   // too wet to start: back home
            if (a.timber && !Wx.noFire(now)) { lightFire(a); coldLook(a); }   // in a rain at 10 it stays unlit, and goes home with them
            if (tooCold(a) && a.why !== "night" && a.why !== "lunch") { walk(a, "H", "warm"); break; }
          }
          if (WT) {   // water: taken at the well or river and carried straight back to the field; a dry field sends its farmer for more
            if ((a.loc === "W" || a.loc === "R") && a.why === "water") { WT.fetch(a.loc); a.water = 1; walk(a, "F", "pour"); break; }
            if (a.loc === "F" && a.water) { WT.pour(a.fieldIx); a.water = 0; }
            if (a.loc === "F" && (a.why === "work" || a.why === "pour") && a.job === field && tending && WT.dry(a.fieldIx)) { walk(a, WT.source(), "water"); break; }
          }
          if (a.why === "night" || a.why === "lunch") arriveHome(a, a.why === "night");
          else if (a.why === "idle") idle(a);
          else decide(a);
          break;
        case "unit": {
          const j = a.job;
          credit(a, a.unit);
          if (WX && a.away) {
            coldLook(a);
            if (tooCold(a)) { walk(a, "H", "warm"); break; }
            if (tooWet(a, now)) { walk(a, "H", "rain"); break; }
          }
          if (WT && j === field && tending && WT.dry(a.fieldIx)) { walk(a, WT.source(), "water"); break; }
          // Collecting goes home after every S.load energy, and when there's no more of it for them
          if (j.collect && j.place !== "H") {
            a.load += a.unit;
            if (a.load >= S.load - EPS || a.e <= EPS || unitOrDrop(a) <= EPS) { walk(a, "H", "carry"); break; }
          }
          decide(a);
          break;
        }
        case "teach":
          for (const k of a.pupils) {
            if (!k.cls) continue;
            lessonTo(k);
            if (k.e <= EPS) { k.cls = false; k.job = null; schedule(k, now, "decide"); }
          }
          a.e -= a.unit; a.spent.teach += a.unit; a.taughtH += a.unit / a.r;
          decide(a);
          break;
        case "poem": a.e -= a.unit; a.spent.poetry += a.unit; decide(a); break;
      }
    }

    // ---------- The day's totals ----------
    let milkers = 0, farm = 0, kidsWorked = 0, walked = 0;
    for (const a of agents) {
      walked += a.walked;
      const m = a.spent.milk, f = a.spent.field;
      if (a.kind === "grown") { if (f > 0) { if (f >= m) farm++; else milkers++; } else if (m > 0) milkers++; }
      else if (a.kind === "kid" && m + f > 0) kidsWorked++;
    }
    const farmEnergy = field ? field.done : 0, tendEnergy = tending && field ? field.out : 0, tendBase = tending ? farmEnergy : 0;
    let fieldsWorked = 0;
    for (const a of agents) if (a.spent.field > 0) fieldsWorked++;
    const timelines = new Map();
    for (const a of agents) { const tl = { Lh: a.Lh !== null ? a.Lh : S.lunch, E: a.E !== null ? a.E : S.active }; if (a.out !== null) tl.out = a.out; comeOut(a); if (a.inside.length) tl.inside = a.inside; timelines.set(a.h, tl); }
    const left = new Map(), spent = new Map();
    for (const a of agents) { left.set(a.h, Math.max(0, a.e)); spent.set(a.h, a.spent); }
    if (C) for (const a of agents) if (a.coldSince !== null) warmUp(a, now);   // still out at the end (never, as everyone goes in)
    const out = {
      left, spent,
      work: { milkers, milkWork: milk.out / VM.DAY_ENERGY, milkEnergy: milk.out, farm, farmWork: farmEnergy / VM.DAY_ENERGY, farmEnergy, tendEnergy, tendBase, kidsWorked, fields: fieldsWorked },
      timelines, walk: walked, lesson: { knowledge: 0, gained: 0, hours: 0, spent: 0, energy: 0 }, reading: { read: 0 }, pupils: 0,
    };
    if (C) {
      out.cold = new Map(agents.map((a) => [a.h, a.coldLost]));
      out.coldHours = agents.reduce((t, a) => t + a.coldH, 0); out.fires = firesLit; out.coldCut = coldCut;
    }
    if (Rn) out.wet = wet;
    if (sch) {
      let knowledge = 0, gained = 0, pupils = 0;
      for (const a of agents) if (a.kind === "kid" && a.met) {
        const got = a.know;
        knowledge += got; gained += sch.learn(a.h, got, sch.params); pupils++;
      }
      let hours = 0, spentT = 0, energy = 0, read = 0;
      for (const s of agents) if (s.kind === "scholar") {
        hours = Math.max(hours, s.taughtH); spentT += s.spent.teach; energy += s.e0;
        if (s.spent.poetry > 0) read += sch.read(s.h, s.spent.poetry, sch.params, effAt(s, "poetry")).read;
      }
      out.lesson = { knowledge, gained, hours, spent: spentT, energy };
      out.pupils = pupils;
      out.reading = { read };
    }
    if (trace) {
      trace.people = agents.map((a) => ({ id: a.h.id, sex: a.h.sex, kind: a.kind, stage: HumanModel.stage(a.h, p), power: a.h.power, intel: a.h.intel,
        e0: a.e0, r: a.r, w: a.w, tl: timelines.get(a.h), Lh: timelines.get(a.h).Lh, E: timelines.get(a.h).E, spent: a.spent, tr: a.tr, need: HumanModel.needOf(a.h, p), happy: x.happyOf ? x.happyOf(a.h) : null, levels: x.levelsOf ? { ...x.levelsOf(a.h) } : null, left: Math.max(0, a.e), cold: a.spells, coldLost: a.coldLost }));
      if (C) { trace.fires = Wx.fires; trace.temps = Array.from({ length: 25 }, (_, h) => C.tempAt(h)); }
      if (Rn) trace.rains = Array.from({ length: 25 }, (_, h) => Rn.at(h));
      trace.board = { milkNeed: milk.need, milkDone: milk.done, field: field ? { need: field.need, done: field.done } : null };
      trace.S = S;
    }
    return out;
  }

  window.MicroModel = { day, CLASS };
})();
