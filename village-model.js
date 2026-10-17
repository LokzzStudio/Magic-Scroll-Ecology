// Shared village simulation for the Food, Advisor, Production, Attribute, Inheritance, Education,
// Resources and Craft pages. VillageModel.run(cfg) plays one village for 3,600 days; cfg switches on
// each page's rules:
//   work      "none"   nobody works: each adult cow gives a standard day's milk, and the year's rice
//                      comes in evenly over days 181–210 (Food, Advisor)
//             "hands"  one job a day per grown-up, each a standard day of 10 energy (Production)
//             "energy" everyone spends their own day's energy, from Power and Intelligence (Attribute on)
//   mode      "macro" (the default): each day's work is worked out for the village as a whole;
//             "micro": person by person through the day (micro-model.js), for checking the macro
//             model and for watching a day (traceDay: the day to keep a record of, as cfg.trace)
//   advisor   null (everyone eats their need), an IQ, or "scholar" (the scholar advises; with no
//             scholar, nobody rations)
//   attrs     starting grown-ups' { power, intel }; elderAttr: the share of both elders work with
//   inherit   null, or { share, variation, grow, extraCap, powerFoodBase, powerFoodFrom }: children take
//             after parents
//   school    null, or { knowPerEnergy, knowPerIntel, readPerIntel, shift }: a scholar teaches the
//             children and writes poetry (吟詩) with the energy left over
//   travel    null, or the map and the day (MapModel.travelOf): when people wake, how long they're out,
//             lunch and meals, and the walking between places (Production on). With it, hunger is felt
//             through the day (hungerOf) instead of all at once.
//   roles     a jobs table (RolesModel) of who can milk, tend, harvest, learn, read and teach; without
//             one, the rules before it: children help with everything, elders only milk
//   resources null, or { fleece, regrow, woodTarget, perEnergy: { wool, stone, wood } } with
//             cfg.sheepAdults: grown-ups' energy left after the food work cuts wood (while timber is
//             short), shears wool and quarries stone (Resources)
//   craft     null, or { items: [{ id, job, material, cost, energy }] }: one loom and one forge at the
//             house turn stores into crafts (Craft)
//   priority  the order of the day's jobs from the Attribute page on: "milk", "field", "wood", "craft",
//             "collect" (DEFAULT_ORDER without one)
//   happiness null, or { iqStep, perEnergy }: each person's happiness (0–10) sets their own chance of a
//             child, and the couples are paired at random each day (Happiness)
// Needs herd-model.js, human-model.js, food-model.js, ration-model.js and day-model.js (the day: the
// clock, walking, lunch, carrying and hunger) loaded first, and micro-model.js for Micro mode.
(function () {
  const T = 3600, YEAR = 360;
  const RUNS = 20;                 // runs per page; the first is the one drawn
  const MAX_ICONS = 90;            // people or animals drawn per group
  const MAX_PEOPLE = 2000;         // a run stops once it grows past this, to keep the page fast
  const HUMAN_SALT = 200000;       // keeps the people's dice apart from the cows'
  const FULL_CREW = FoodModel.TEND_CREW;   // 4 fields, so a full crew is 4
  const HARVEST_FIRST = 181, TEND_DAYS = HARVEST_FIRST - 1;
  const HARVEST_PER_HAND = 250;    // rice a standard day (10 energy) brings in at harvest
  const DAY_ENERGY = FoodModel.DAY_ENERGY;
  const { MALE } = HumanModel;
  const { iqError } = RationModel;
  const { newClock, workAt, canAt, dayEnd, hungerOf, atHome, workSpans, classSpans, sharedHours, NO_MAP } = DayModel;

  const dayOfYear = (day) => ((day - 1) % YEAR) + 1;
  // Who does what when no jobs table is given (the rules before it)
  const job = (...ids) => Object.fromEntries(["milk", "tend", "harvest", "read", "teach"].map((j) => [j, ids.includes(j)]));
  const LEGACY_ROLES = { child: job("milk", "tend", "harvest", "teach"), man: job("milk", "tend", "harvest"), woman: job("milk", "tend", "harvest"),
    scholarM: job("read", "teach"), scholarF: job("read", "teach"), elder: job("milk") };
  // Last harvest day: nobody working means a short harvest that brings itself in
  const harvestLastOf = (work) => (work === "none" ? 210 : 270);

  // One person's working day. Power is durability (Power ÷ 10 energy, whole); Intelligence is
  // efficiency (Intelligence ÷ 100 energy an hour). How much of it gets done is up to the day (DayModel.workAt).
  function workDay(power, intel) {
    const energy = Math.floor((DAY_ENERGY * power) / 100 + 1e-9), rate = intel / 100;
    return { durability: energy, rate, hours: rate > 0 ? energy / rate : 0, energy, output: energy / DAY_ENERGY };
  }

  // ---------- Herds (cows, and the Resources page's sheep) ----------
  // perIcon: only animals whose id is a multiple of it are kept for drawing
  function runHerd(HP, start, seed, detailed, perIcon) {
    const rand = HerdModel.rng(seed);
    const state = HerdModel.startHerd(start, HP, rand);
    const counts = new Int32Array(T + 1), adults = new Int32Array(T + 1);
    const d = detailed ? {
      snaps: new Array(T + 1), young: new Int32Array(T + 1),
      born: new Int32Array(T + 1), old: new Int32Array(T + 1), size: new Int32Array(T + 1),
    } : null;
    const snap = () => {   // [id, age] pairs of the animals drawn
      const out = [];
      for (const a of state.herd) if (a.id % perIcon === 0) { out.push(a.id, a.age); if (out.length >= MAX_ICONS * 2) break; }
      return Int32Array.from(out);
    };
    const count = (day, ev) => {
      let young = 0;
      for (const a of state.herd) if (a.age < HP.M) young++;
      counts[day] = state.herd.length;
      adults[day] = counts[day] - young;
      if (d) {
        d.snaps[day] = snap(); d.young[day] = young;
        if (ev) { d.born[day] = ev.born; d.old[day] = ev.old; d.size[day] = ev.size; }
      }
    };
    count(0, null);
    let extinctDay = start > 0 ? null : 0;
    for (let day = 1; day <= T; day++) {
      count(day, HerdModel.stepHerd(state, HP, rand));
      if (extinctDay === null && counts[day] === 0) extinctDay = day;
    }
    return { counts, adults, last: T, extinctDay, survived: counts[T] > 0, ...d };
  }

  // ---------- Work ----------
  // Production: one job a day. Every adult cow gets a milker, first from those who can milk but not
  // farm (elders, by default); those left who can farm go to the rice, up to the hands it wants.
  // groups: [{ n, milk, field }], the grown-ups by what they may do today. A hand does a standard day
  // (10 energy at 1 an hour) as far as the day allows: perCow for a milker, 10 energy on the rice; idle
  // grown-ups take up what's left undone, each only in jobs they may do. Returns the day's work, with
  // timelines: [{ n, tl }], how many grown-ups had each timeline (for hunger).
  function assignHands(groups, cows, riceWanted, perCow, S, tending) {
    let milkOnly = 0, both = 0, fieldOnly = 0;
    for (const g of groups) if (g.milk && g.field) both += g.n; else if (g.milk) milkOnly += g.n; else if (g.field) fieldOnly += g.n;
    const mo = Math.min(cows, milkOnly), mb = Math.min(cows - mo, both);
    let milkers = mo + mb, farm = Math.min(riceWanted, both - mb + fieldOnly);
    const fromFieldOnly = Math.min(farm, fieldOnly), fromBoth = farm - fromFieldOnly;
    // A standard hand's day at a place: the energy done, the walking and the timeline
    const hand = (place, want, collect) => {
      const c = newClock(S), done = workAt(c, place, Math.min(want, canAt(c, place, want, 1, S, collect)), 1, S, collect);
      return { done, walked: c.walked, tl: dayEnd(c, S, done >= DAY_ENERGY - 1e-9) };
    };
    const M = hand("P", perCow, true), Fd = hand("F", DAY_ENERGY, !tending), sM = M.done, sF = Fd.done;
    let milkEnergy = milkers * sM, farmEnergy = farm * sF, milkGap = milkers * (perCow - sM), farmGap = farm * (DAY_ENERGY - sF);
    // Idle hands each do up to s of what's undone (gap); returns how many stepped in
    const cover = (idle, s, gap, add) => {
      const n = s > 0 && gap > 1e-9 ? Math.min(idle, Math.ceil(gap / s - 1e-9)) : 0;
      if (n) add(Math.min(gap, n * s));
      return n;
    };
    const addMilk = (g) => { milkEnergy += g; milkGap -= g; }, addFarm = (g) => { farmEnergy += g; farmGap -= g; };
    const idleBoth = both - mb - fromBoth;
    milkers += cover(milkOnly - mo, sM, milkGap, addMilk);
    const n = cover(idleBoth, sM, milkGap, addMilk);
    milkers += n;
    farm += cover(fieldOnly - fromFieldOnly, sF, farmGap, addFarm);
    farm += cover(idleBoth - n, sF, farmGap, addFarm);
    const grownUps = milkOnly + both + fieldOnly;
    const timelines = [{ n: milkers, tl: M.tl }, { n: farm, tl: Fd.tl }, { n: Math.max(0, grownUps - milkers - farm), tl: atHome(S) }];
    return { farm, milkers, milkEnergy, farmEnergy, farmWork: farmEnergy / DAY_ENERGY, walk: milkers * M.walked + farm * Fd.walked, timelines };
  }

  // Attribute on: everyone spends their day's energy (en: energy per person; rate: energy an hour) on
  // the day's jobs in order (order: "milk", "field", and the extra jobs of the Resources and Craft pages),
  // each person as far as their day allows (workAt).
  // Milking: a cow's milk takes cowE energy; people milk one cow after another while their energy lasts,
  // first those who may milk but not do today's field work (elders, by default), then the rest, in the
  // order given (grownUps: the order they came to work). Fields: while tending, the 4 fields take up to
  // fieldE each a day, from whoever has the most energy left, one after another; at harvest, people
  // join until the rice has the work it wants. Then children fill what the grown-ups left undone,
  // strongest first, and keep the rest (h.spare, for class from h.from hours). Each grown-up counts
  // toward the food job they spent most of their energy on. may(h, job): the jobs table. extra: { wood,
  // craft, collect } jobs, each given the grown-ups with energy left and the day's ops. clocks: a Map
  // that gets each person's clock.
  const DEFAULT_ORDER = ["milk", "field", "wood", "craft", "collect"];
  function assignEnergy(grownUps, cows, riceWanted, tending, kids, en, cowE, fieldE, S, rate, may, order, extra, clocks) {
    let need = cows * cowE, milkEnergy = 0, farmWork = 0, farmEnergy = 0, tendEnergy = 0, fields = 0;
    const fieldJob = tending ? "tend" : "harvest";
    // ops: what someone could still do at a place, and doing it (collect: carried home, 搬運)
    const ops = {
      can: (w, place, collect) => canAt(w.c, place, w.e, w.r, S, collect),
      work: (w, place, amount, collect) => { const done = amount > 1e-9 ? workAt(w.c, place, amount, w.r, S, collect) : 0; w.e -= done; return done; },
    };
    const { can, work } = ops;
    const riceLeft = () => Math.ceil((riceWanted - farmWork) * DAY_ENERGY - 1e-9);   // whole energy, so rice stays whole
    // Each grown-up's energy left, rate and clock, and milk and field work done
    const pool = grownUps.map((h) => ({ h, e: en.get(h), r: rate.get(h), c: newClock(S), m: 0, f: 0 }));
    const milk = () => {
      for (const fieldsToo of [false, true]) for (const w of pool) {
        if (need <= 1e-9 || may(w.h, fieldJob) !== fieldsToo || !may(w.h, "milk")) continue;
        const milked = work(w, "P", Math.min(can(w, "P", true), need), true);
        need -= milked; milkEnergy += milked; w.m += milked;
      }
    };
    // The field work still wanted: while tending, what's left of the 4 fields' daily limit; at harvest,
    // what's left of the work the rice wants
    const fieldLeft = () => (tending ? FULL_CREW * fieldE - tendEnergy : riceLeft());
    let freeHands = 0;   // grown-ups who may do today's field work with energy left when its turn comes
    const field = () => {
      const left = pool.filter((w) => w.e > 0 && may(w.h, fieldJob)).sort((a, b) => b.e - a.e);
      freeHands = left.length;
      for (const w of left) {
        const want = fieldLeft();
        if (want <= 1e-9) break;
        const done = work(w, "F", Math.min(can(w, "F", !tending), want), !tending);
        if (done <= 0) continue;
        if (tending) tendEnergy += done;
        farmWork += done / DAY_ENERGY; farmEnergy += done; w.f += done; fields++;
      }
    };
    for (const id of order || DEFAULT_ORDER) {
      if (id === "milk") milk();
      else if (id === "field") field();
      else if (extra && extra[id]) extra[id](pool.filter((w) => w.e > 0 && w.c.t < S.active - 1e-9), ops);
    }
    let milkers = 0, farm = 0;
    for (const w of pool) if (w.f > 0) { if (w.f >= w.m) farm++; else milkers++; } else if (w.m > 0) milkers++;
    let kidsWorked = 0;
    const kidsField = may(null, fieldJob, "child"), kidsMilk = may(null, "milk", "child");
    const kidPool = kids.map((h) => ({ h, e: en.get(h), r: rate.get(h), c: newClock(S) }));
    for (const w of kidPool) {
      let farmed = 0;
      const milked = kidsMilk && need > 1e-9 ? work(w, "P", Math.min(can(w, "P", true), need), true) : 0;
      need -= milked; milkEnergy += milked;
      if (w.e > 0 && kidsField && fieldLeft() > 1e-9) {
        farmed = work(w, "F", Math.min(can(w, "F", !tending), fieldLeft()), !tending);
        if (tending) tendEnergy += farmed;
        farmWork += farmed / DAY_ENERGY; farmEnergy += farmed;
      }
      w.h.spare = w.e;
      w.h.from = w.c.t + S.between(w.c.at, "H");   // back at the house for class
      if (milked + farmed > 0) kidsWorked++;
    }
    if (clocks) for (const w of pool.concat(kidPool)) { w.c.spent = w.e <= 1e-9; w.c.left = w.e; clocks.set(w.h, w.c); }
    return { milkers, milkWork: milkEnergy / DAY_ENERGY, milkEnergy, farm, farmWork, farmEnergy, tendEnergy, kidsWorked, milkShort: need, fields, freeHands };
  }

  // ---------- Resources ----------
  // The Resources page's jobs, for grown-ups with energy left (pool: { h, e, c }), each in its place in
  // the day's order; ops: { can(w, place), work(w, place, amount) }. today: { woolLeft (on the sheep),
  // wood (timber in store this morning), spent }.
  const RESOURCES = ["wool", "stone", "wood"];
  const PLACE_OF = { wool: "P", stone: "M", wood: "T" };
  // Woodcutting: while timber (in store plus what's cut today) is under woodTarget, the first who may
  // cuts what's short, or as much as their day allows; anyone not in the middle of a craft before a
  // crafter (busy)
  function cutWood(pool, ops, today, res, may, busy) {
    for (const crafter of [false, true]) for (const w of pool) {
      const short = res.woodTarget - (today.wood + today.spent.wood * res.perEnergy.wood);
      if (short <= 1e-9) return;
      if (w.e <= 0 || busy(w.h) !== crafter || !may(w.h, "wood")) continue;
      today.spent.wood += ops.work(w, "T", Math.min(ops.can(w, "T", true), Math.ceil(short / res.perEnergy.wood - 1e-9)), true);
    }
  }
  // Shearing and quarrying, in village order: women shear first and men quarry first, each as much as
  // their day allows, or turn to the other when theirs isn't possible (no wool left on the sheep, or
  // barred by the jobs table)
  function shearAndQuarry(pool, ops, today, res, may) {
    for (const w of pool) for (const r of w.h.sex === MALE ? ["stone", "wool"] : ["wool", "stone"]) {
      if (w.e <= 0 || !may(w.h, r) || (r === "wool" && today.woolLeft <= 1e-9)) continue;
      let want = ops.can(w, PLACE_OF[r], true);
      if (r === "wool") want = Math.min(want, Math.ceil(today.woolLeft / res.perEnergy.wool - 1e-9));
      const done = ops.work(w, PLACE_OF[r], want, true);
      today.spent[r] += done;
      if (r === "wool") today.woolLeft -= done * res.perEnergy.wool;
    }
  }

  // ---------- Crafts ----------
  // One loom (紡織) and one forge (鍛造) at the house, one person at each at a time. A craft takes its
  // materials up front and is worked until done, over as many days as it takes: by its crafter if they
  // have energy left, otherwise by the first who may; when they run out, the next who may takes over.
  // With nothing under way, a station starts the item of its trade the village has started fewest of,
  // if the materials are in store (startCraft).
  // stations: { weave, forge }, each { job: { id, left } or null, holder }. today: { craftEnergy, done }
  function startCraft(items, st, store, started) {
    let best = null;
    for (const it of items) if (store[it.material] >= it.cost && (!best || started[it.id] < started[best.id])) best = it;
    if (!best) return false;
    store[best.material] -= best.cost; started[best.id]++;
    st.job = { id: best.id, left: best.energy };
    return true;
  }
  function craftAtStations(pool, ops, cr, stations, store, started, today, may) {
    for (const kind of ["weave", "forge"]) {
      const items = cr.items.filter((it) => it.job === kind);
      if (!items.length) continue;
      const st = stations[kind], able = (x) => x.e > 0 && may(x.h, kind) && ops.can(x, "H") > 0;
      let w = (st.holder && pool.find((x) => x.h === st.holder && able(x))) || pool.find(able);
      while (w) {
        st.holder = w.h;
        if (!st.job && !startCraft(items, st, store, started)) break;
        const amount = ops.work(w, "H", Math.min(st.job.left, ops.can(w, "H")));
        st.job.left -= amount; today.craftEnergy += amount;
        if (st.job.left <= 1e-9) { today.done[st.job.id] = (today.done[st.job.id] || 0) + 1; st.job = null; }
        if (!able(w)) w = pool.find(able);
      }
      if (!st.job) st.holder = null;
    }
  }

  // ---------- The Resources and Craft pages, day by day ----------
  // The sheep's fleeces (fleece[k] = sheep carrying k wool), the stores of wool, stone and timber, the
  // crafts and the loom and forge. startDay(day) grows the fleeces and returns the day's extra jobs for
  // assignEnergy; endDay() puts what came in into store and returns the day's totals. state(): the
  // pieces Micro mode works with directly.
  function makeEconomy(res, cr, sheepAdults, may) {
    const store = { wool: 0, stone: 0, wood: 0 }, energy = { wool: 0, stone: 0, wood: 0 };   // energy spent so far: fractions carry over
    const fleece = new Int32Array(res.fleece + 1);
    const crafted = {}, started = {};
    if (cr) for (const it of cr.items) { crafted[it.id] = 0; started[it.id] = 0; }
    const stations = cr ? { weave: { job: null, holder: null }, forge: { job: null, holder: null } } : null;
    const busy = (h) => !!stations && ((!!stations.weave.job && stations.weave.holder === h) || (!!stations.forge.job && stations.forge.holder === h));
    const woolOnSheep = () => { let t = 0; for (let k = 1; k < fleece.length; k++) t += k * fleece[k]; return t; };
    let today = null;
    return {
      startDay(day) {
        // Every sheep grows res.regrow wool a day, up to a full fleece; sheep that came of age arrive
        // full, and sheep that died are taken from the commonest fleece
        const full = res.fleece, adultSheep = sheepAdults ? sheepAdults[day - 1] : 0;
        let flock = 0;
        for (let k = full - 1; k >= 0; k--) { const n = fleece[k]; if (n) { fleece[k] = 0; fleece[Math.min(full, k + res.regrow)] += n; } }
        for (let k = 0; k <= full; k++) flock += fleece[k];
        if (adultSheep > flock) fleece[full] += adultSheep - flock;
        for (let lose = flock - adultSheep; lose > 0; lose--) {
          let most = 0;
          for (let k = 1; k <= full; k++) if (fleece[k] > fleece[most]) most = k;
          fleece[most]--;
        }
        today = { woolLeft: woolOnSheep(), wood: store.wood, spent: { wool: 0, stone: 0, wood: 0 }, craftEnergy: 0, done: {} };
        return {
          wood: (pool, ops) => cutWood(pool, ops, today, res, may, busy),
          craft: cr ? (pool, ops) => craftAtStations(pool, ops, cr, stations, store, started, today, may) : null,
          collect: (pool, ops) => shearAndQuarry(pool, ops, today, res, may),
        };
      },
      state: () => ({ today, store, stations, started, res, cr, busy }),
      endDay() {
        let craftDone = 0, work = 0;
        for (const id in today.done) { crafted[id] += today.done[id]; craftDone += today.done[id]; }
        const made = {};
        for (const r of RESOURCES) {
          made[r] = FoodModel.yieldOf(energy[r], today.spent[r], res.perEnergy[r]);
          energy[r] += today.spent[r]; store[r] += made[r]; work += today.spent[r];
        }
        // The wool comes off the fullest sheep first; a part-shorn sheep keeps growing from what's left
        for (let take = made.wool, k = res.fleece; take > 0 && k > 0; ) {
          if (!fleece[k]) { k--; continue; }
          const t = Math.min(k, take);
          fleece[k]--; fleece[k - t]++; take -= t;
        }
        return { resMade: made, resWork: work, craftWork: today.craftEnergy, craftDone };
      },
      // Into the day's records: the stores (and, while anyone lives, the day's totals)
      record(d, day, food) {
        d.wool[day] = store.wool; d.stone[day] = store.stone; d.wood[day] = store.wood;
        if (cr) cr.items.forEach((it, k) => { d.crafts[k][day] = crafted[it.id]; });
        if (!food) return;
        const m = food.resMade || {};
        d.woolMade[day] = m.wool || 0; d.stoneMade[day] = m.stone || 0; d.woodMade[day] = m.wood || 0;
        d.resWork[day] = food.resWork || 0; d.woolOnSheep[day] = woolOnSheep();
        if (cr) {
          d.craftWork[day] = food.craftWork || 0; d.craftDone[day] = food.craftDone || 0;
          d.crafting[day] = (stations.weave.job ? 1 : 0) + (stations.forge.job ? 1 : 0);
        }
      },
    };
  }

  // ---------- School ----------
  // The scholar's working day: the scholar adjustment (shift %) on top of the elder share
  function scholarDay(h, p, elderAttr, school) {
    const k = HumanModel.stage(h, p) === "elder" ? elderAttr : 1;
    return workDay(h.power * k * (1 - school.shift / 100), h.intel * k * (1 + school.shift / 100));
  }
  const scholarIQ = (h, p, elderAttr, school) =>
    Math.floor(h.intel * (HumanModel.stage(h, p) === "elder" ? elderAttr : 1) * (1 + school.shift / 100) + 1e-9);

  // A child takes home `got` knowledge; every knowPerIntel of it is +1 Intelligence for life. Returns the gain.
  function learn(h, got, school) {
    h.knowledge = (h.knowledge || 0) + got;
    const gain = Math.floor(h.knowledge / school.knowPerIntel + 1e-9) - (h.learned || 0);
    if (gain > 0) { h.intel += gain; h.learned = (h.learned || 0) + gain; return gain; }
    return 0;
  }
  // One day of school, at the house. The scholar works through their day teaching whenever a child is
  // in class and writing poetry otherwise; a child is in class from when they're free (h.from, hours
  // after waking; their food work comes first) except at lunch, and spends their spare energy (h.spare)
  // only while the scholar teaches. Over the hours both are there, the child takes home
  // effectiveness × min(scholar's rate, child's rate) × hours knowledge (fractions kept): the smaller of the two's
  // energy spent. People wake at different times, so with a schedule (S) the hours are the average over
  // the difference in their wake-up times (sharedHours); without one, both start together.
  // `spent`: the scholar's energy that took (the longest lesson); the rest goes to poetry. used: each
  // child's own energy spent in class (their energy an hour × the hours).
  function teach(scholar, kids, p, elderAttr, school, S) {
    const sc = scholarDay(scholar, p, elderAttr, school);
    const sTime = sc.rate > 0 ? sc.energy / sc.rate : 0;
    const taught = S ? workSpans(sTime, S) : null;
    const used = new Map();
    let knowledge = 0, gained = 0, lesson = 0;
    for (const h of kids) {
      const full = workDay(h.power, h.intel);
      const kEnergy = h.spare !== undefined ? h.spare : full.energy;
      const kTime = full.rate > 0 ? kEnergy / full.rate : 0;
      const t = S ? sharedHours(taught, classSpans(h.from !== undefined ? h.from : S.meal, S), kTime, S) : Math.min(kTime, sTime);
      const got = school.knowPerEnergy * Math.min(sc.rate, full.rate) * t;
      gained += learn(h, got, school);
      knowledge += got;
      lesson = Math.max(lesson, t);
      used.set(h, full.rate * t);
    }
    return { knowledge, gained, hours: lesson, spent: Math.min(sc.energy, sc.rate * lesson), energy: sc.energy, used };
  }
  // The scholar writes poetry (吟詩) with the energy they didn't spend teaching: knowPerEnergy knowledge per
  // energy, and every readPerIntel of it is +1 Intelligence for life.
  function read(scholar, energy, school) {
    const got = Math.floor(energy * school.knowPerEnergy + 1e-9);
    scholar.read = (scholar.read || 0) + got;
    const gain = Math.floor(scholar.read / school.readPerIntel + 1e-9) - (scholar.readLearned || 0);
    if (gain > 0) { scholar.intel += gain; scholar.readLearned = (scholar.readLearned || 0) + gain; }
    return { read: got, readGained: Math.max(0, gain) };
  }

  // ---------- Inheritance ----------
  // Newborns get share × the average of a random adult man and woman, give or take the variation,
  // rounded down, for each attribute. Anyone who came of age today gains the bonus in both, plus
  // Power the extra food they ate as a child buys (powerFromFood).
  // Extra food buys Power one point at a time, the next point costing powerFoodBase + max(0, Power −
  // powerFoodFrom) food; what can't buy another point is lost. Returns the Power gained.
  function powerFromFood(power, food, ih) {
    let gained = 0;
    for (;;) {
      const cost = ih.powerFoodBase + Math.max(0, power + gained - ih.powerFoodFrom);
      if (food < cost - 1e-9) return gained;
      food -= cost; gained++;
    }
  }
  function inheritAttrs(people, p, irand, attrs, ih) {
    let men = null, women = null;
    for (const h of people) {
      if (h.power === undefined) {   // born today
        if (!men) {
          men = []; women = [];
          for (const g of people) if (g.power !== undefined && HumanModel.stage(g, p) === "adult") (g.sex === MALE ? men : women).push(g);
        }
        const dad = men[Math.floor(irand() * men.length)], mum = women[Math.floor(irand() * women.length)];
        const born = (a, b) => {
          const vary = ih.variation > 0 ? (ih.variation / 100) * (2 * irand() - 1) : 0;
          return Math.max(0, Math.floor(ih.share * ((a + b) / 2) * (1 + vary) + 1e-9));
        };
        h.power = dad && mum ? born(dad.power, mum.power) : attrs.power;
        h.intel = dad && mum ? born(dad.intel, mum.intel) : attrs.intel;
        h.grown = false; h.extra = 0; h.knowledge = 0; h.learned = 0;
      } else if (!h.grown && h.age >= p.M) {
        h.grown = true;
        h.power += ih.grow; h.intel += ih.grow;
        h.power += powerFromFood(h.power, h.extra, ih);
      }
    }
  }

  // ---------- Happiness ----------
  // Happiness, 0 to 10: a base from Intelligence, 10 − ⌊Intelligence ÷ iqStep⌋, plus 1 for every
  // perEnergy of energy someone left unspent yesterday (h.joy). Each person's own chance of a child is
  // p × happiness ÷ 5 (p, the Humans page's chance, at happiness 5), and a couple's is the average of
  // the two partners'.
  const MAX_HAPPY = 10, MID_HAPPY = 5;
  const baseHappiness = (intel, hp) => Math.min(MAX_HAPPY, Math.max(0, MAX_HAPPY - Math.floor(intel / hp.iqStep + 1e-9)));
  const happinessOf = (h, hp) => Math.min(MAX_HAPPY, baseHappiness(h.intel, hp) + (h.joy || 0));
  const birthChance = (happy, p) => (p.p * happy) / MID_HAPPY;
  // The happiness a day's energy left unspent adds tomorrow
  const joyOf = (left, hp) => Math.max(0, Math.floor(left / hp.perEnergy + 1e-9));

  // ---------- One village ----------
  function run(cfg) {
    const { F, UP, US, cowAdults, work, inherit, school, detailed } = cfg;
    const none = work === "none", hands = work === "hands", energy = work === "energy";
    const HARVEST_LAST = harvestLastOf(work), HARVEST_DAYS = HARVEST_LAST - HARVEST_FIRST + 1;
    const isHarvest = (doy) => doy >= HARVEST_FIRST && doy <= HARVEST_LAST;
    const attrs = cfg.attrs || { power: 100, intel: 100 }, elderAttr = cfg.elderAttr ?? 1;
    const cowE = FoodModel.cowEnergyOf(F), fieldE = FoodModel.fieldEnergyOf(F);
    const S = none ? null : cfg.travel || null;   // the day and the walking
    const micro = cfg.mode === "micro" && !!S && !none;
    const roles = cfg.roles || LEGACY_ROLES;
    const roleOf = (h) => { const st = HumanModel.stage(h, p); return st === "child" ? "child" : st === "elder" ? "elder" : h.sex === MALE ? "man" : "woman"; };
    // may(h, job[, role]): whether a person (or a role) may do a job
    const may = (h, jobId, role) => !!roles[role || roleOf(h)][jobId];

    // Separate dice for the village, the advisor, the birth draws and Micro mode's wake-up times, so
    // each policy faces the same luck
    const rand = HerdModel.rng(cfg.seed);
    const arand = HerdModel.rng((cfg.seed ^ 0x5bd1e995) >>> 0);
    const irand = HerdModel.rng((cfg.seed ^ 0x2545f491) >>> 0);
    const mrand = HerdModel.rng((cfg.seed ^ 0x3c6ef372) >>> 0);
    const hrand = HerdModel.rng((cfg.seed ^ 0x1b873593) >>> 0);   // the Happiness page's pairing
    const gauss = () => Math.sqrt(-2 * Math.log(1 - arand())) * Math.cos(2 * Math.PI * arand());
    const scholarAdvises = cfg.advisor === "scholar";
    const sigma = cfg.advisor == null || scholarAdvises ? 0 : iqError(cfg.advisor);
    let lean = gauss();   // the advisor's lasting lean, in units of their error
    const bias = sigma * lean;

    // Same human parameters, but the food shared out each day is what's eaten from the stores
    const p = { ...UP, F: 0 };
    const st = HumanModel.startPeople(US.men, US.women, p, rand);
    if (energy) for (const h of st.people) { h.power = attrs.power; h.intel = attrs.intel; h.grown = true; h.extra = 0; }
    const stores = FoodModel.newStores(F);
    // Running totals of what's in store (food is whole, so they stay exact); the starting food never spoils
    let milkStored = 0, riceStored = 0;
    let coveredKey = null, covered = false;   // foodCoveredWithout's last answer
    const order = cfg.priority || DEFAULT_ORDER, foodOrder = order.filter((id) => id === "milk" || id === "field");
    const en = new Map(), rt = new Map();   // each person's energy for the day, and energy an hour
    // The Resources and Craft pages' sheep, stores and crafts
    const res = energy ? cfg.resources || null : null;
    const econ = res ? makeEconomy(res, cfg.craft || null, cfg.sheepAdults, may) : null;
    // The Happiness page: each person's happiness sets their chance of a child
    const joy = energy ? cfg.happiness || null : null;
    let chanceToday = 0;   // the sum of the day's couples' chances
    // The day's couples (after the deaths), as each one's chance of a child: the adult men and women
    // are paired at random, a new pairing every day, as many couples as the smaller group
    function chancesOf(people) {
      const men = [], women = [];
      for (const h of people) if (HumanModel.stage(h, p) === "adult") (h.sex === MALE ? men : women).push(h);
      for (const g of [men, women]) for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(hrand() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
      const out = [];
      for (let i = 0; i < Math.min(men.length, women.length); i++) out.push((birthChance(happinessOf(men[i], joy), p) + birthChance(happinessOf(women[i], joy), p)) / 2);
      chanceToday = out.reduce((a, b) => a + b, 0);
      return out;
    }

    const counts = new Int32Array(T + 1);
    const f32 = () => new Float32Array(T + 1), i32 = () => new Int32Array(T + 1), nan = () => new Float32Array(T + 1).fill(NaN);
    const d = detailed ? {
      men: i32(), women: i32(), boys: i32(), girls: i32(), elders: i32(), couples: i32(),
      born: i32(), died: i32(), hungry: i32(), ration: f32(), snaps: new Array(T + 1),
      made: f32(), drank: f32(), stored: f32(), spoiled: f32(),                     // milk
      riceMade: f32(), riceEaten: f32(), riceStored: f32(), riceSpoiled: f32(),     // rice
      foodEaten: f32(), foodStored: f32(),                                           // the starting food
      share: nan(), iq: nan(),                                                       // the advisor's ration and IQ
      adults: i32(), farm: i32(), milkers: i32(), kidsWork: i32(), cows: i32(), walk: f32(),   // work
      crop: f32(), field: f32(), riceLost: f32(), milkWork: f32(), farmWork: f32(),
      hunger: f32(),                                                                 // days of life lost to hunger, everyone together
      pow: f32(), int: f32(), extra: f32(),                                          // adults' attributes, children's extra food
      taught: f32(), gained: i32(), kids: i32(), picked: i32(), lesson: f32(), schPow: nan(), schInt: nan(),   // school
      read: f32(), readGained: i32(),                                                // the scholar's reading
      wool: f32(), stone: f32(), wood: f32(), woolMade: f32(), stoneMade: f32(), woodMade: f32(), resWork: f32(), woolOnSheep: i32(),   // resources
      crafts: cfg.craft ? cfg.craft.items.map(() => i32()) : null, craftWork: f32(), craftDone: i32(), crafting: i32(),   // crafts in store, energy, finished, under way
      happy: nan(), happyKids: nan(), chance: f32(), joyAdults: nan(),   // happiness: adults', children's, couples' chances together, from energy left
    } : null;
    const snap = () => {   // [id, age, sex] triples of the people drawn
      const every = Math.max(1, Math.ceil(st.people.length / MAX_ICONS));
      const out = [];
      for (const h of st.people) if (h.id % every === 0) out.push(h.id, h.age, h.sex);
      return Int32Array.from(out.slice(0, MAX_ICONS * 3));
    };
    const record = (day, ev, food) => {
      counts[day] = st.people.length;
      if (!d) return;
      const c = HumanModel.census(st.people, p);
      d.men[day] = c.men; d.women[day] = c.women; d.boys[day] = c.boys; d.girls[day] = c.girls;
      d.elders[day] = c.elders; d.couples[day] = c.couples;
      if (ev) { d.born[day] = ev.born; d.died[day] = ev.died; d.hungry[day] = ev.hungry; d.ration[day] = ev.ration; d.hunger[day] = ev.lostAll || 0; }
      else { const need = HumanModel.foodNeed(st.people, p); d.ration[day] = need > 0 ? Math.min(1, food.milkMade / need) : Infinity; }
      d.made[day] = food.milkMade; d.drank[day] = food.milkEaten; d.spoiled[day] = food.milkSpoiled;
      d.riceMade[day] = food.riceMade; d.riceEaten[day] = food.riceEaten; d.riceSpoiled[day] = food.riceSpoiled;
      d.stored[day] = milkStored; d.riceStored[day] = riceStored;
      d.foodEaten[day] = food.foodEaten || 0; d.foodStored[day] = stores.food;
      if (food.share !== undefined) { d.share[day] = food.share; d.iq[day] = food.iq; }
      if (!none) {
        d.adults[day] = food.adults; d.farm[day] = food.farm; d.milkers[day] = food.milkers; d.kidsWork[day] = food.kidsWork || 0;
        d.cows[day] = food.cows; d.crop[day] = food.crop; d.field[day] = food.field; d.riceLost[day] = food.riceLost;
        d.milkWork[day] = food.milkWork || 0; d.farmWork[day] = food.farmWork || 0; d.walk[day] = food.walk || 0;
      }
      if (energy) {   // adults' average attributes, and the children's extra food
        d.extra[day] = food.extra || 0;
        let pw = 0, it = 0, n = 0;
        for (const h of st.people) if (HumanModel.stage(h, p) === "adult") { pw += h.power; it += h.intel; n++; }
        d.pow[day] = n ? pw / n : NaN; d.int[day] = n ? it / n : NaN;
      }
      if (school) {
        d.taught[day] = food.taught || 0; d.gained[day] = food.gained || 0; d.kids[day] = food.kids || 0;
        d.picked[day] = food.picked || 0; d.lesson[day] = food.lesson || 0; d.read[day] = food.read || 0; d.readGained[day] = food.readGained || 0;
        if (food.scholar) { d.schPow[day] = food.scholar.power; d.schInt[day] = food.scholar.intel; }
      }
      if (econ) econ.record(d, day, food);
      if (joy && ev) { d.happy[day] = food.happy; d.happyKids[day] = food.happyKids; d.chance[day] = food.chance; d.joyAdults[day] = food.joyAdults; d.couples[day] = ev.couples; }
      d.snaps[day] = snap();
    };

    const c0 = HumanModel.census(st.people, p);
    record(0, null, {
      milkMade: none ? FoodModel.wholeFood(cowAdults[0] * Math.min(DAY_ENERGY, cowE), F.milkPerEnergy) : 0,
      milkEaten: 0, milkSpoiled: 0, riceMade: 0, riceEaten: 0, riceSpoiled: 0,
      adults: c0.men + c0.women + c0.elders, farm: 0, milkers: 0, cows: cowAdults[0], crop: 0, field: 0, riceLost: 0,
    });

    let last = T, capped = false, extinctDay = st.people.length ? null : 0;
    let milkEnergy = 0;   // energy spent milking so far, so milk fractions carry over
    let tended = 0, tendEnergy = 0, field = 0;   // this year's tending (share of the most), its energy, and ripe rice standing
    let scholar = null, lastAdvisor = null;   // lastAdvisor: the scholar who last advised
    const stopAt = cfg.stopAfter || T;   // Micro mode's day viewer stops after the day it shows
    // The whole run's totals, kept even without the day-by-day records (Micro mode's comparison).
    // pow, int: the adults' average, summed over the last year's days with adults (attrDays)
    const tally = { peopleDays: 0, milk: 0, rice: 0, hunger: 0, walk: 0, wool: 0, stone: 0, crafts: 0, taught: 0, gained: 0, pow: 0, int: 0, attrDays: 0, born: 0, happy: 0, happyDays: 0 };

    for (let day = 1; day <= stopAt; day++) {
      if (extinctDay !== null) {   // nobody left: the cows go unmilked and the rice untended
        if (d) {
          d.snaps[day] = new Int32Array(0);
          if (none) d.made[day] = Math.floor(cowAdults[day - 1] * FoodModel.milkPerDay(F)); else d.cows[day] = cowAdults[day - 1];
          if (econ) econ.record(d, day, null);   // what was gathered stays in store
        }
        continue;
      }
      // 1. Stored food ages a day; anything past its keeping time spoils
      const { milkSpoiled, riceSpoiled } = FoodModel.ageStores(stores);
      milkStored -= milkSpoiled; riceStored -= riceSpoiled;
      const doy = dayOfYear(day), cows = cowAdults[day - 1];
      let milkSpent, riceMade = 0, riceLost = 0, crop = 0, grownUps = 0, farmers = false;
      let w = { farm: 0, milkers: 0, farmWork: 0 }, lesson = { knowledge: 0, gained: 0, hours: 0 }, reading = { read: 0, readGained: 0 }, kidCount = 0, picked = 0, made = {};
      // Each person's timeline for hunger ({ Lh, E }), or for hands: [{ n, tl }] for the grown-ups
      let timelines = null, handLines = null, walk = 0, trace = null;

      if (none) {
        // 2. Nobody works: each adult cow gives a standard day's milk; the year's rice comes in evenly
        milkSpent = cows * Math.min(DAY_ENERGY, cowE);
        const c = HumanModel.census(st.people, p);
        farmers = c.men + c.women > 0;
        if (isHarvest(doy) && farmers) riceMade = FoodModel.spread(F.riceYear, HARVEST_DAYS, doy - HARVEST_FIRST + 1);
      } else {
        // 2. The scholar steps down at elder age or death; a new one is appointed only if the
        //    village can spare them. Then the grown-ups (and children, if needed) go to work.
        if (school) {
          if (scholar && (scholar.age >= scholar.life || HumanModel.stage(scholar, p) === "elder")) scholar = null;
          if (!scholar) {
            const cand = pickScholar(st.people, p);
            if (cand && foodCoveredWithout(cand, st.people, p, cows)) { scholar = cand; picked = 1; }
          }
        }
        if (doy === 1) { tended = 0; tendEnergy = 0; }
        if (doy === HARVEST_FIRST) field = hands
          ? Math.min(FULL_CREW * F.fieldCap, FoodModel.wholeFood(Math.round(tended * FULL_CREW * DAY_ENERGY), F.ricePerEnergy))
          : FoodModel.wholeFood(tendEnergy, F.ricePerEnergy);
        const tending = doy < HARVEST_FIRST;
        const riceWanted = tending ? FULL_CREW
          : doy > HARVEST_LAST ? 0
          : hands ? Math.min(FULL_CREW, Math.ceil(field / HARVEST_PER_HAND - 1e-9)) : Math.min(FULL_CREW, field / HARVEST_PER_HAND);
        if (cfg.traceDay === day) trace = cfg.trace = {};
        if (hands) {
          const c = HumanModel.census(st.people, p);
          grownUps = c.men + c.women + c.elders;
          const fj = tending ? "tend" : "harvest", perCow = Math.min(DAY_ENERGY, cowE);
          if (micro) {
            const m = MicroModel.day({ S, rand: mrand, hands: true, people: st.people, p, may, cows, cowE: perCow, fieldE: DAY_ENERGY, riceWanted, tending, trace,
              energyOf: (h) => (HumanModel.stage(h, p) === "child" ? null : { e: DAY_ENERGY, r: 1 }) });
            w = m.work; timelines = m.timelines; walk = m.walk;
          } else {
            const groups = [["elder", c.elders], ["man", c.men], ["woman", c.women]].map(([r, n]) => ({ n, milk: may(null, "milk", r), field: may(null, fj, r) }));
            w = assignHands(groups, cows, riceWanted, perCow, S || NO_MAP, tending);
            handLines = w.timelines; walk = w.walk;
          }
          if (tending) tended += w.farmEnergy / (FULL_CREW * DAY_ENERGY);
          milkSpent = w.milkEnergy;
        } else {
          const adults = [], elders = [], kids = [];
          en.clear();
          for (const h of st.people) {
            if (h.power === undefined) { h.power = attrs.power; h.intel = attrs.intel; }   // born with attrs, without inheritance
            h.spare = undefined; h.from = undefined;
            const stage = HumanModel.stage(h, p);
            if (h === scholar) continue;   // the scholar only teaches
            const k = stage === "elder" ? elderAttr : 1, wd = workDay(h.power * k, h.intel * k);
            en.set(h, wd.energy); rt.set(h, wd.rate);
            if (stage === "child") { kids.push(h); continue; }
            (stage === "adult" ? adults : elders).push(h);
          }
          grownUps = adults.length + elders.length;
          // The Resources and Craft pages' jobs take their place in the day's order
          const extra = econ ? econ.startDay(day) : null;
          const sr = scholar ? (scholar.sex === MALE ? "scholarM" : "scholarF") : null;
          if (micro) {
            const m = MicroModel.day({ S, rand: mrand, people: st.people, p, may, cows, cowE, fieldE, riceWanted, tending, order, trace,
              happyOf: joy ? (h) => happinessOf(h, joy) : null,
              energyOf: (h) => (en.has(h) ? { e: en.get(h), r: rt.get(h) } : null),
              econ: econ ? econ.state() : null,
              school: scholar ? { scholar, day: scholarDay(scholar, p, elderAttr, school), params: school, teaches: may(null, "teach", sr), reads: may(null, "read", sr), pupils: may(null, "teach", "child"), learn, read } : null });
            w = m.work; timelines = m.timelines; walk = m.walk;
            if (scholar) { lesson = m.lesson; reading = m.reading; kidCount = m.pupils; }
            if (joy) for (const h of st.people) h.joyNext = joyOf(m.left.get(h) || 0, joy);
          } else {
            const clocks = new Map(), Sd = S || NO_MAP;
            const helpers = kids.slice().sort((a, b) => en.get(b) - en.get(a));   // strongest children first
            // With a schedule, grown-ups come to the day's jobs in the order they wake: a new order each day
            const grown = [...elders, ...adults];
            if (S) for (let i = grown.length - 1; i > 0; i--) { const j = Math.floor(mrand() * (i + 1)); [grown[i], grown[j]] = [grown[j], grown[i]]; }
            w = assignEnergy(grown, cows, riceWanted, tending, helpers, en, cowE, fieldE, Sd, rt, may, order, extra, clocks);
            timelines = new Map();
            for (const [h, c] of clocks) { timelines.set(h, dayEnd(c, Sd, c.spent)); walk += c.walked; }
            if (scholar) {
              const pupils = may(null, "teach", "child") && may(null, "teach", sr) ? kids : [];
              kidCount = pupils.length;
              if (pupils.length) lesson = teach(scholar, pupils, p, elderAttr, school, Sd);
              const sd = scholarDay(scholar, p, elderAttr, school), left = pupils.length ? lesson.energy - lesson.spent : sd.energy;
              const reads = left > 0 && may(null, "read", sr);
              if (reads) reading = read(scholar, left, school);
              // Their day at the house: teaching and poetry, a whole energy at a time like anyone's work
              const cl = newClock(Sd);
              workAt(cl, "H", reads ? sd.energy : sd.energy - left, sd.rate, Sd, false);
              timelines.set(scholar, dayEnd(cl, Sd, reads || left <= 1e-9));
              if (joy) scholar.joyNext = joyOf(reads ? 0 : left, joy);
            }
            // Energy left unspent: after the day's jobs, less a child's time in class
            if (joy) for (const [h, cl] of clocks) h.joyNext = joyOf(cl.left - ((lesson.used && lesson.used.get(h)) || 0), joy);
          }
          if (econ) made = econ.endDay();
          if (tending) { tended += w.tendEnergy / (FULL_CREW * fieldE); tendEnergy += w.tendEnergy; }
          milkSpent = w.milkEnergy;
        }
        crop = tended / Math.min(doy, TEND_DAYS);
        if (isHarvest(doy)) riceMade = Math.min(field, (w.farmEnergy * HARVEST_PER_HAND) / DAY_ENERGY);
        field -= riceMade;
        if (doy === HARVEST_LAST) { riceLost = field; field = 0; }
      }
      // 3. Today's food goes into the stores; milk fractions carry over
      const milkMade = FoodModel.yieldOf(milkEnergy, milkSpent, F.milkPerEnergy);
      milkEnergy += milkSpent;
      stores.milk[0] = milkMade;
      stores.rice[0] = riceMade;
      milkStored += milkMade; riceStored += riceMade;

      // 4. The advisor sets a share: food in store plus what's still to come before the next harvest,
      //    spread over the days until then, with an error that shrinks with IQ (a lean plus a wobble)
      const need = HumanModel.foodNeed(st.people, p);
      let share = 1, advIQ = cfg.advisor;
      if (scholarAdvises) {
        advIQ = scholar ? scholarIQ(scholar, p, elderAttr, school) : null;   // no scholar: nobody rations
        if (scholar && scholar !== lastAdvisor) { lean = gauss(); lastAdvisor = scholar; }   // a new scholar brings their own lean
      }
      if (advIQ != null) {
        let horizon, riceToCome = 0;
        if (doy < HARVEST_FIRST) horizon = HARVEST_FIRST - doy;
        else {
          horizon = YEAR - doy + HARVEST_FIRST;
          if (doy <= HARVEST_LAST) riceToCome = none
            ? (farmers ? ((HARVEST_LAST - doy) * F.riceYear) / HARVEST_DAYS : 0)
            : Math.min(field, (HARVEST_LAST - doy) * w.farmWork * HARVEST_PER_HAND);
        }
        const supply = milkStored + riceStored + stores.food + milkMade * (horizon - 1) + riceToCome;
        const sg = scholarAdvises ? iqError(advIQ) : sigma;
        const err = (scholarAdvises ? sg * lean : bias) + (sg / 2) * gauss();
        share = need > 0 ? Math.min(1, (supply / (need * horizon)) * Math.exp(err)) : 1;
      }

      // 5. People eat their share, whatever spoils soonest first. On days everyone ate their full
      //    need, food that would spoil overnight goes to the children, split evenly, up to a cap each.
      const { milkEaten, riceEaten, foodEaten } = FoodModel.eat(stores, need * share);
      milkStored -= milkEaten; riceStored -= riceEaten;
      let extra = 0;
      if (inherit && inherit.extraCap > 0 && milkEaten + riceEaten + foodEaten >= Math.round(need)) {
        const kids = st.people.filter((h) => h.age < p.M);
        if (kids.length) {
          const got = FoodModel.eatExpiring(stores, kids.length * inherit.extraCap);
          milkStored -= got.milkEaten; riceStored -= got.riceEaten;
          extra = got.milkEaten + got.riceEaten;
          for (const h of kids) h.extra += extra / kids.length;
        }
      }

      // 6. What was eaten is shared out by need; hunger, ageing and deaths, births. Newborns take
      //    after their parents; anyone who came of age gets their bonus. With a schedule, each person's
      //    hunger follows their day (hungerOf).
      p.F = milkEaten + riceEaten + foodEaten;
      let lossOf = null;
      if (S) {
        const g = need > 0 ? Math.min(1, p.F / need) : 1, home = atHome(S);
        const needOf = (h) => (h.age < p.M ? p.c * HumanModel.CHILD_FOOD : p.c);
        let grownLoss = 0;   // hands: the grown-ups' average loss
        if (handLines) { let n = 0; for (const x of handLines) { grownLoss += x.n * hungerOf(g, x.tl, S, p.k, p.c); n += x.n; } grownLoss = n ? grownLoss / n : 0; }
        const idleKid = atHome(S, true);
        lossOf = (h) => (handLines ? (h.age >= p.M ? grownLoss : hungerOf(g, idleKid, S, p.k, needOf(h))) : hungerOf(g, (timelines && timelines.get(h)) || home, S, p.k, needOf(h)));
        if (trace) trace.share = g;
      }
      // Happiness today (from yesterday's energy left), for the births and the records
      let happy = 0, happyKids = 0, joyAdults = 0;
      if (joy) {
        let a = 0, k = 0, ja = 0;
        for (const h of st.people) {
          const st0 = HumanModel.stage(h, p);
          if (h.intel === undefined) continue;
          if (st0 === "adult") { happy += happinessOf(h, joy); joyAdults += h.joy || 0; a++; } else if (st0 === "child") { happyKids += happinessOf(h, joy); k++; }
        }
        happy = a ? happy / a : NaN; joyAdults = a ? joyAdults / a : NaN; happyKids = k ? happyKids / k : NaN;
      }
      const ev = HumanModel.stepPeople(st, p, rand, lossOf, joy ? chancesOf : null);
      if (joy) for (const h of st.people) { h.joy = h.joyNext || 0; h.joyNext = 0; }
      if (inherit) inheritAttrs(st.people, p, irand, attrs, inherit);
      record(day, ev, {
        milkMade, milkEaten, milkSpoiled, riceMade, riceEaten, riceSpoiled, foodEaten, share: advIQ != null ? share : undefined, iq: advIQ, extra,
        adults: grownUps, farm: w.farm, milkers: w.milkers, kidsWork: w.kidsWorked, cows, crop, field, riceLost,
        milkWork: w.milkWork, farmWork: w.farmWork, walk, ...made,
        taught: lesson.knowledge, gained: lesson.gained, kids: kidCount, picked, lesson: lesson.hours, scholar, ...reading,
        happy, happyKids, chance: chanceToday, joyAdults,
      });
      tally.born += ev.born;
      if (joy && isFinite(happy)) { tally.happy += happy; tally.happyDays++; }
      tally.peopleDays += counts[day - 1]; tally.milk += milkMade; tally.rice += riceMade; tally.hunger += ev.lostAll || 0; tally.walk += walk;
      if (made.resMade) { tally.wool += made.resMade.wool; tally.stone += made.resMade.stone; }
      tally.crafts += made.craftDone || 0; tally.taught += lesson.knowledge || 0; tally.gained += lesson.gained || 0;
      if (energy && day > T - YEAR) {
        let pw = 0, it = 0, n = 0;
        for (const h of st.people) if (HumanModel.stage(h, p) === "adult") { pw += h.power; it += h.intel; n++; }
        if (n) { tally.pow += pw / n; tally.int += it / n; tally.attrDays++; }
      }
      if (st.people.length === 0) extinctDay = day;
      if (st.people.length > MAX_PEOPLE) { capped = true; last = day; break; }
    }
    if (stopAt < T && !capped) last = Math.min(last, stopAt);
    return { counts, last, capped, extinctDay, survived: capped || counts[T] > 0, tally, ...d };

    // The adult with the highest Intelligence (first on a tie)
    function pickScholar(people, p) {
      let best = null;
      for (const h of people) if (HumanModel.stage(h, p) === "adult" && (!best || h.intel > best.intel)) best = h;
      return best;
    }
    // Could the grown-ups, without this person, still fill every food job at the busiest time:
    // every adult cow fully milked and all the fields worked while tending, with no children?
    // The answer only changes with the cows, the candidate and the grown-ups, so the last one is kept
    // (coveredKey, covered)
    function foodCoveredWithout(cand, people, p, cows) {
      let key = `${cows}|${cand.id}`;
      for (const h of people) { const stage = HumanModel.stage(h, p); if (stage !== "child") key += `|${h.id}${stage[0]}${h.power},${h.intel}`; }
      if (key !== coveredKey) { coveredKey = key; covered = foodCovered(cand, people, p, cows); }
      return covered;
    }
    function foodCovered(cand, people, p, cows) {
      const adults = [], elders = [], e = new Map(), rate = new Map();
      for (const h of people) {
        if (h === cand) continue;
        const stage = HumanModel.stage(h, p);
        if (stage === "child") continue;
        const k = stage === "elder" ? elderAttr : 1, wd = workDay(h.power * k, h.intel * k);
        e.set(h, wd.energy); rate.set(h, wd.rate);
        (stage === "adult" ? adults : elders).push(h);
      }
      const r = assignEnergy([...elders, ...adults], cows, FULL_CREW, true, [], e, cowE, fieldE, S || NO_MAP, rate, may, foodOrder, null, null);
      return r.milkShort <= 1e-9 && r.freeHands >= FULL_CREW;
    }
  }

  window.VillageModel = {
    T, YEAR, RUNS, MAX_ICONS, MAX_PEOPLE, HUMAN_SALT, FULL_CREW, HARVEST_FIRST, TEND_DAYS, HARVEST_PER_HAND, DAY_ENERGY,
    DEFAULT_ORDER, RESOURCES, PLACE_OF, MAX_HAPPY, MID_HAPPY, baseHappiness, happinessOf, birthChance, joyOf, powerFromFood, dayOfYear, harvestLastOf, workDay, runHerd, run, scholarDay, scholarIQ, teach, learn, read,
    startCraft, assignEnergy, assignHands, cutWood, shearAndQuarry, craftAtStations,
  };
})();
