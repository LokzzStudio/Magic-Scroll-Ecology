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
//   The board: milking (pooled: cows × cowE energy), the fields (pooled: while tending, the 4 fields'
//     daily limit; at harvest, the work the rice wants), and from the Resources page on
//     the loom and the forge (one at a time each), shearing (pooled: the wool on the sheep), quarrying
//     and woodcutting. Taking a pooled job reserves the energy
//     the person can give it today, so nobody walks out for work someone else has already claimed. As in
//     the macro model, those who may milk but not do today's field work (elders) milk first: anyone
//     else leaves them the milk they can still give.
//   Children fill food work the free grown-ups can't, then go to class while the scholar teaches. The
//     scholar teaches whenever a child is in class and writes poetry the rest of the time; a child
//     takes home effectiveness × the smaller of the two's energy spent while both were in class.
//   From the Resources page on, each energy does the person's effectiveness at the job's skill in work
//     (x.eff): the jobs' needs and what's reserved are work; what someone could still do is their energy
//     there × it; knowledge from teaching and poetry is × it too.
// x: { S, rand, people, p, may, energyOf(h) → { e, r } | null, cows, cowE, fieldE, riceWanted, tending,
//   order, econ (makeEconomy's state()), school: { scholar, day, params, teaches, reads, pupils,
//   learn, read } | null, trace: {} | null, happyOf: h → happiness | null, eff: (h, skill) → effectiveness |
//   null, levelsOf: h → { skill: level } | null }.
// Returns { work (as assignEnergy's), timelines: Map(h → { Lh, E, out }), left: Map(h → energy left
// unspent), spent: Map(h → energy spent on each job), walk, lesson, reading, pupils },
// and fills x.trace with everyone's day if given.
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
    const agents = [];
    for (const h of x.people) {
      const isScholar = !!sch && h === sch.scholar;
      const er = isScholar ? { e: sch.day.energy, r: sch.day.rate } : x.energyOf(h);
      const kind = isScholar ? "scholar" : HumanModel.stage(h, p) === "child" ? "kid" : "grown";
      const e = er ? er.e : 0;
      agents.push({
        h, kind, e, e0: e, r: er ? er.r : 0, w: 0, loc: "H", st: "asleep", freeAt: S.meal, job: null, res: 0, load: 0,
        lunched: false, Lh: null, E: null, out: null, over: false, walked: 0, ver: 0, unit: 0, cls: false, know: 0, met: false,
        spent: { milk: 0, field: 0, wood: 0, wool: 0, stone: 0, weave: 0, forge: 0, teach: 0, poetry: 0, class: 0 }, blade: undefined, fork: undefined,
        milkOnly: kind === "grown" && may(h, "milk") && !may(h, fieldJob),
        eff: x.eff ? effTable(h) : ONE,
        tr: trace ? [] : null,
      });
    }
    const scholar = agents.find((a) => a.kind === "scholar") || null;
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
    const pooled = (id, place, need, collect, credit) => ({ id, place, kind: "pool", need, done: 0, res: 0, collect, credit: credit || (() => {}), open() { return this.need - this.done - this.res; } });
    const milk = pooled("milk", "P", x.cows * x.cowE, true);
    const farmed = E && E.cr ? (w, a, energy) => E.farmed(a, energy) : null;   // farming wears a hayfork
    const field = tending ? pooled("field", "F", VM.FULL_CREW * x.fieldE, false, farmed)
      : x.riceWanted > EPS ? pooled("field", "F", Math.ceil(x.riceWanted * VM.DAY_ENERGY - EPS), true, farmed) : null;
    let wood = null, wool = null, stone = null;
    const stations = {};
    if (E) {
      const { today, res } = E;
      const open = (id, place) => ({ id, place, kind: "open", collect: true, credit: (amt, a, energy) => { today.spent[id] += amt; E.collected(id, a.h, a.blade, amt, energy); } });
      wool = pooled("wool", "P", Math.ceil(today.woolLeft / res.perEnergy.wool - EPS), true, (amt, a, energy) => { today.spent.wool += amt; today.woolLeft -= amt * res.perEnergy.wool; E.collected("wool", a.h, a.blade, amt, energy); });
      stone = open("stone", "M"); wood = open("wood", "T");
      if (E.cr) for (const kind of ["weave", "forge"]) {
        const items = E.cr.items.filter((it) => it.job === kind), st = E.stations[kind];
        if (!items.length) continue;
        stations[kind] = {
          id: kind, place: "H", kind: "slot", worker: null,
          hasWork: () => !!st.job || E.canStart(items),
          more: (a) => (st.job || E.startCraft(items, st) ? Math.min(UNIT, a.e, st.job.left / effAt(a, kind)) : 0),
          credit: (amt, a) => E.creditCraft(st, kind, a.h, a.r, amt),
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
    // plus VM.toolBonus of the tier of their tool for it (a 叉 hayfork in the fields, a 刀 blade collecting)
    const TOOL_OF = { field: "fork", wool: "blade", wood: "blade", stone: "blade" };
    const effAt = (a, id) => { const t = TOOL_OF[id] && a[TOOL_OF[id]]; return a.eff[id] + (t ? VM.toolBonus(t.tier) : 0); };
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
    const estWork = (a, place, collect, id) => est(a, place, collect) * effAt(a, id);
    const note = (a, s, more) => { a.st = s; if (a.tr) a.tr.push({ t: now, s, at: a.loc, e: a.e, ...more }); };

    // Jobs a person holds: take, keep going, let go
    function take(a, j, amt) {
      a.job = j; a.res = amt;
      if (j.kind === "pool") j.res += amt;
      else if (j.kind === "slot") j.worker = a;
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
        return Math.min(UNIT, a.e, a.res / effAt(a, j.id));
      }
      if (j.kind === "slot") return j.worker === a ? j.more(a) : 0;
      return Math.min(UNIT, a.e);   // quarrying never runs out
    }
    // A unit of amt energy done: amt × effectiveness work for the job
    function credit(a, amt) {
      const j = a.job, work = amt * effAt(a, j.id);
      if (j.kind === "pool") { j.done += work; j.res -= work; a.res -= work; }
      j.credit(work, a, amt);
      a.e -= amt; a.spent[j.id] += amt;
      if (a.e < EPS) a.e = 0;
    }

    // ---------- Choosing a job ----------
    const uncommitted = (a) => !a.over && !a.job && a.e > EPS;
    // Milk the milk-only grown-ups (who may milk but not do today's field work) who haven't taken a job yet can still give
    const milkOnlyCover = () => { let t = 0; for (const a of agents) if (a.milkOnly && uncommitted(a)) t += estWork(a, "P", true, "milk"); return t; };
    // The most of a pooled job a person may take: anyone who may do today's field work leaves the milk
    // the milk-only grown-ups can still give
    const capFor = (a, j) => (j === milk && !a.milkOnly && may(a.h, fieldJob) ? milk.open() - milkOnlyCover() : Infinity);
    // What the grown-ups who haven't taken a job yet (awake or not) could give a job, and how many could
    function grownCover(jobId, place, collect) {
      let t = 0, k = 0;
      for (const a of agents) if (a.kind === "grown" && uncommitted(a) && may(a.h, jobId)) { const c = estWork(a, place, collect, jobId); if (c > EPS) { t += c; k++; } }
      return { energy: t, people: k };
    }
    const tryPool = (a, j, cap = Infinity) => {
      if (!j) return false;
      const amt = Math.min(j.open(), estWork(a, j.place, j.collect, j.id), cap);
      if (amt <= EPS) return false;
      take(a, j, amt);
      return true;
    };
    const trySlot = (a, j) => {
      if (!j || j.worker || !j.hasWork() || !canUnit(a, j.place, j.collect)) return false;
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
    function chooseGrown(a) {
      for (const id of tiers) {
        if (id === "milk") {
          if (!may(a.h, "milk") || milk.open() <= EPS) continue;
          const cap = capFor(a, milk);
          if (cap > EPS && tryPool(a, milk, cap)) return true;
        } else if (id === "field") {
          if (!may(a.h, fieldJob) || !field) continue;
          if (withTool(a, "fork", () => tryPool(a, field))) return true;
        } else if (id === "craft") {
          for (const kind of ["weave", "forge"]) if (stations[kind] && may(a.h, kind) && trySlot(a, stations[kind])) return true;
        } else if (id === "collect" && E) {
          if (withTool(a, "blade", () => {
            for (const r of VM.collectOrder(a.h, E.store, E.today, E.res)) {
              if (!may(a.h, r)) continue;
              const j = r === "wool" ? wool : r === "stone" ? stone : wood;
              if (j === wool ? tryPool(a, wool) : canUnit(a, j.place, true) && (take(a, j, 0), true)) return true;
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
      for (const id of tiers) {
        if (id === "teach" && classOn()) return "class";
        if (id === "milk" && may(a.h, "milk") && milk.open() > EPS) {
          const gap = milk.open() - grownCover("milk", "P", true).energy;
          if (gap > EPS && tryPool(a, milk, gap)) return "food";
        } else if (id === "field" && field && may(a.h, fieldJob) && field.open() > EPS) {
          const gap = field.open() - grownCover(fieldJob, "F", field.collect).energy;
          if (gap > EPS && withTool(a, "fork", () => tryPool(a, field, gap))) return "food";
        }
      }
      return "";
    }
    // Class is on while a scholar who teaches before poetry (or may not write) has energy, for children who may go
    const teachFirst = !!sch && VM.teachesFirst(tiers, sch.reads);
    const classOn = () => !!sch && sch.pupils && sch.teaches && teachFirst && !!scholar && !scholar.over && scholar.e > EPS;

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
      const d = S.between(a.loc, dest);
      a.walked += d;
      note(a, "walk", { to: dest, t1: now + d, job: a.job ? a.job.id : null, why });
      a.dest = dest; a.why = why;
      if (dest === "H") a.load = 0;
      schedule(a, now + d, "arrive");
    }
    function toWork(a, depth) {
      const j = a.job;
      if (a.loc !== j.place) return walk(a, j.place, "work");
      const amt = unitOf(a);
      if (amt <= EPS) { drop(a); return decide(a, depth + 1); }
      a.unit = amt;
      note(a, "work", { job: j.id, t1: now + amt / a.r });
      schedule(a, now + amt / a.r, "unit");
    }
    function toClass(a) {
      if (a.loc !== "H") return walk(a, "H", "work");
      if (a.cls) return schedule(a, a.w + (a.lunched ? S.active : S.lunch), "decide");   // already seated
      a.cls = true; a.since = now;
      note(a, "class", { job: "class" });
      schedule(a, a.w + (a.lunched ? S.active : S.lunch), "decide");
      if (scholar && !scholar.over && (scholar.st === "idle" || scholar.st === "poetry")) {
        if (scholar.st === "poetry") { const done = (now - scholar.t0) * scholar.r; scholar.e -= done; scholar.spent.poetry += done; }   // stops mid-poem to teach
        schedule(scholar, now, "decide");
      }
    }
    function idle(a) {
      drop(a);
      if (a.loc !== "H") return walk(a, "H", "idle");
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
      if (night) { a.E = rel(a); a.over = true; note(a, "inside"); if (a === scholar) wakeIdle(); return; }
      a.Lh = rel(a); a.lunched = true; a.freeAt = a.Lh + S.meal;
      note(a, "eat", { meal: "lunch", t1: now + S.meal });
      schedule(a, now + S.meal, "decide");
    }
    // A child in class learns while the scholar teaches: knowPerEnergy × the smaller of the two's energy
    // spent over the time, the child spending their own energy as they go. lessonTo(k): up to now.
    function lessonTo(k) {
      if (scholar && scholar.st === "teach" && k.cls) {
        let dt = now - Math.max(k.since, scholar.t0);
        if (dt > EPS && k.e > EPS) {
          dt = Math.min(dt, k.e / k.r);
          const kE = dt * k.r;
          k.know += sch.params.knowPerEnergy * effAt(scholar, "teach") * Math.min(dt * scholar.r, kE); k.e -= kE; k.spent.class += kE; k.met = true;
        }
      }
      k.since = now;
    }
    function leaveClass(k) { if (k.cls) { lessonTo(k); k.cls = false; } }
    // The scholar goes down the order: teaching whoever is in class (Education), or poetry
    function scholarStep(a) {
      if (a.e <= EPS) { idle(a); wakeIdle(); return; }
      const pupils = sch.teaches ? agents.filter((k) => k.cls && k.e > EPS) : [];
      for (const id of tiers) {
        const teach = id === "teach" && pupils.length > 0;
        if (!teach && !(id === "read" && sch.reads)) continue;
        a.unit = Math.min(UNIT, a.e); a.t0 = now;
        if (rel(a) + a.unit / a.r > S.active + EPS) break;   // no time to finish it today
        note(a, teach ? "teach" : "poetry", { job: teach ? "teach" : "poetry", t1: now + a.unit / a.r, pupils: pupils.length });
        schedule(a, now + a.unit / a.r, teach ? "teach" : "poem");
        return;
      }
      idle(a);
    }
    let teachHours = 0;

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
          a.loc = a.dest;
          if (a.why === "night" || a.why === "lunch") arriveHome(a, a.why === "night");
          else if (a.why === "idle") idle(a);
          else decide(a);
          break;
        case "unit": {
          const j = a.job;
          credit(a, a.unit);
          // Collecting goes home after every S.load energy, and when there's no more of it for them
          if (j.collect && j.place !== "H") {
            a.load += a.unit;
            if (a.load >= S.load - EPS || a.e <= EPS || unitOrDrop(a) <= EPS) { walk(a, "H", "carry"); break; }
          }
          decide(a);
          break;
        }
        case "teach":
          for (const k of agents) {
            if (!k.cls) continue;
            lessonTo(k);
            if (k.e <= EPS) { k.cls = false; k.job = null; schedule(k, now, "decide"); }
          }
          a.e -= a.unit; a.spent.teach += a.unit; teachHours += a.unit / a.r;
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
    const farmEnergy = field ? field.done : 0, tendEnergy = tending ? farmEnergy : 0;
    let fieldsWorked = 0;
    for (const a of agents) if (a.spent.field > 0) fieldsWorked++;
    const timelines = new Map();
    for (const a of agents) { const tl = { Lh: a.Lh !== null ? a.Lh : S.lunch, E: a.E !== null ? a.E : S.active }; if (a.out !== null) tl.out = a.out; timelines.set(a.h, tl); }
    const left = new Map(), spent = new Map();
    for (const a of agents) { left.set(a.h, Math.max(0, a.e)); spent.set(a.h, a.spent); }
    const out = {
      left, spent,
      work: { milkers, milkWork: milk.done / VM.DAY_ENERGY, milkEnergy: milk.done, farm, farmWork: farmEnergy / VM.DAY_ENERGY, farmEnergy, tendEnergy, kidsWorked, milkShort: milk.need - milk.done, fields: fieldsWorked },
      timelines, walk: walked, lesson: { knowledge: 0, gained: 0, hours: 0, spent: 0, energy: 0 }, reading: { read: 0, readGained: 0 }, pupils: 0,
    };
    if (sch) {
      let knowledge = 0, gained = 0, pupils = 0;
      for (const a of agents) if (a.kind === "kid" && a.met) {
        const got = a.know;
        knowledge += got; gained += sch.learn(a.h, got, sch.params); pupils++;
      }
      out.lesson = { knowledge, gained, hours: teachHours, spent: scholar.spent.teach, energy: scholar.e0 };
      out.pupils = pupils;
      if (scholar.spent.poetry > 0) out.reading = sch.read(scholar.h, scholar.spent.poetry, sch.params, effAt(scholar, "poetry"));
    }
    if (trace) {
      trace.people = agents.map((a) => ({ id: a.h.id, sex: a.h.sex, kind: a.kind, stage: HumanModel.stage(a.h, p), power: a.h.power, intel: a.h.intel,
        e0: a.e0, r: a.r, w: a.w, tl: timelines.get(a.h), Lh: timelines.get(a.h).Lh, E: timelines.get(a.h).E, spent: a.spent, tr: a.tr, need: HumanModel.needOf(a.h, p), happy: x.happyOf ? x.happyOf(a.h) : null, levels: x.levelsOf ? { ...x.levelsOf(a.h) } : null, left: Math.max(0, a.e) }));
      trace.board = { milkNeed: milk.need, milkDone: milk.done, field: field ? { need: field.need, done: field.done } : null };
      trace.S = S;
    }
    return out;
  }

  window.MicroModel = { day, CLASS };
})();
