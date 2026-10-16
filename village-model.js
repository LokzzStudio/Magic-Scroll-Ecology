// Shared village simulation for the Food, Advisor, Production, Attribute, Inheritance, Education,
// Resources and Craft pages. VillageModel.run(cfg) plays one village for 3,600 days; cfg switches on
// each page's rules:
//   work      "none"   nobody works: each adult cow gives a standard day's milk, and the year's rice
//                      comes in evenly over days 181–210 (Food, Advisor)
//             "hands"  one job a day per grown-up, each a standard day of 10 energy (Production)
//             "energy" everyone spends their own day's energy, from Power and Intelligence (Attribute on)
//   advisor   null (everyone eats their need), an IQ, or "scholar" (the scholar advises; with no
//             scholar, nobody rations)
//   attrs     starting grown-ups' { power, intel }; elderAttr: the share of both elders work with
//   inherit   null, or { share, variation, grow, extraCap, foodPerPower }: children take after parents
//   school    null, or { knowPerEnergy, knowPerIntel, readPerIntel, shift }: a scholar teaches the
//             children and writes poetry (吟詩) with the energy left over
//   travel    null, or { pasture, farm, load, dayHours } (MapModel.travelOf): round-trip hours to the
//             pasture and the farm; work and walking share the day's hours (Production on)
//   roles     a jobs table (RolesModel) of who can milk, tend, harvest, learn, read and teach; without
//             one, the rules before it: children help with everything, elders only milk
//   resources null, or { fleece, regrow, woodTarget, perEnergy: { wool, stone, wood } } with
//             cfg.sheepAdults: grown-ups' energy left after the food work cuts wood (while timber is
//             short), shears wool and quarries stone (Resources)
//   craft     null, or { items: [{ id, job, material, cost, energy }] }: one loom and one forge at the
//             house turn stores into crafts (Craft)
//   priority  the order of the day's jobs from the Attribute page on: "milk", "field", "wood", "craft",
//             "collect" (DEFAULT_ORDER without one)
// Needs herd-model.js, human-model.js, food-model.js and ration-model.js loaded first.
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
  const MAX_HOURS = 10;
  const { MALE } = HumanModel;
  const { iqError } = RationModel;

  const dayOfYear = (day) => ((day - 1) % YEAR) + 1;
  // Who does what when no jobs table is given (the rules before it)
  const job = (...ids) => Object.fromEntries(["milk", "tend", "harvest", "read", "teach"].map((j) => [j, ids.includes(j)]));
  const LEGACY_ROLES = { child: job("milk", "tend", "harvest", "teach"), man: job("milk", "tend", "harvest"), woman: job("milk", "tend", "harvest"),
    scholarM: job("read", "teach"), scholarF: job("read", "teach"), elder: job("milk") };
  // Last harvest day: nobody working means a short harvest that brings itself in
  const harvestLastOf = (work) => (work === "none" ? 210 : 270);

  // One person's working day. Power is durability (Power ÷ 10 energy); Intelligence is efficiency
  // (Intelligence ÷ 100 energy an hour, for at most 10 hours). Energy is whole, rounded down.
  function workDay(power, intel) {
    const durability = Math.floor((DAY_ENERGY * power) / 100 + 1e-9);
    const rate = intel / 100;   // energy an hour
    const energy = Math.min(durability, Math.floor((intel * MAX_HOURS) / 100 + 1e-9));
    return { durability, rate, hours: rate > 0 ? energy / rate : 0, energy, energyLeft: durability - energy, output: energy / DAY_ENERGY };
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

  // ---------- Walking ----------
  // Round trips to carry `amount` energy of work home: collecting (milking, harvest) takes one for every
  // `load` energy, a part load counting; other work (tending) one a day.
  const tripsFor = (amount, load, collect) => (amount <= 0 ? 0 : collect ? Math.ceil(amount / load - 1e-9) : 1);
  // The most of `e` energy a worker doing `rate` energy an hour gets done in `hours`, at a place `trip`
  // hours there and back, in whole energy. Walking only cuts the work once work and walking pass `hours`.
  function workCap(e, rate, hours, trip, load, collect) {
    if (!(rate > 0) || !(hours > 0) || !isFinite(trip)) return 0;
    if (!(trip > 0)) return Math.min(e, Math.floor(rate * hours + 1e-9));
    if (!collect) return Math.max(0, Math.min(e, Math.floor(rate * (hours - trip) + 1e-9)));
    const perLoad = load / rate + trip, full = Math.floor(hours / perLoad + 1e-9);
    const rest = hours - full * perLoad - trip;
    return Math.min(e, full * load + (rest > 0 ? Math.min(load, Math.floor(rate * rest + 1e-9)) : 0));
  }

  // ---------- Work ----------
  // Production: one job a day. Every adult cow gets a milker, first from those who can milk but not
  // farm (elders, by default); those left who can farm go to the rice, up to the hands it wants.
  // groups: [{ n, milk, field }], the grown-ups by what they may do today. With walking (tv), a hand
  // may get through less than a standard day (perCow for a milker, 10 energy on the rice); idle
  // grown-ups take up what's left undone, each only in jobs they may do.
  function assignHands(groups, cows, riceWanted, perCow, tv, tending) {
    let milkOnly = 0, both = 0, fieldOnly = 0;
    for (const g of groups) if (g.milk && g.field) both += g.n; else if (g.milk) milkOnly += g.n; else if (g.field) fieldOnly += g.n;
    const mo = Math.min(cows, milkOnly), mb = Math.min(cows - mo, both);
    let milkers = mo + mb, farm = Math.min(riceWanted, both - mb + fieldOnly);
    const fromFieldOnly = Math.min(farm, fieldOnly), fromBoth = farm - fromFieldOnly;
    if (!tv) return { farm, milkers, milkEnergy: milkers * perCow, farmEnergy: farm * DAY_ENERGY, farmWork: farm, walk: 0 };
    const sM = Math.min(perCow, workCap(DAY_ENERGY, 1, tv.dayHours, tv.pasture, tv.load, true));
    const sF = workCap(DAY_ENERGY, 1, tv.dayHours, tv.farm, tv.load, !tending);
    let milkEnergy = milkers * sM, farmEnergy = farm * sF, milkGap = milkers * (perCow - sM), farmGap = farm * (DAY_ENERGY - sF);
    let walk = milkers * tripsFor(sM, tv.load, true) * tv.pasture + farm * tripsFor(sF, tv.load, !tending) * tv.farm;
    // Idle hands each do up to s of what's undone (gap); returns how many stepped in
    const cover = (idle, s, gap, trip, collect, add) => {
      const n = s > 0 && gap > 1e-9 ? Math.min(idle, Math.ceil(gap / s - 1e-9)) : 0;
      if (n) { const got = Math.min(gap, n * s); add(got); walk += (n - 1) * tripsFor(s, tv.load, collect) * trip + tripsFor(got - (n - 1) * s, tv.load, collect) * trip; }
      return n;
    };
    const addMilk = (g) => { milkEnergy += g; milkGap -= g; }, addFarm = (g) => { farmEnergy += g; farmGap -= g; };
    const idleBoth = both - mb - fromBoth;
    milkers += cover(milkOnly - mo, sM, milkGap, tv.pasture, true, addMilk);
    const n = cover(idleBoth, sM, milkGap, tv.pasture, true, addMilk);
    milkers += n;
    farm += cover(fieldOnly - fromFieldOnly, sF, farmGap, tv.farm, !tending, addFarm);
    farm += cover(idleBoth - n, sF, farmGap, tv.farm, !tending, addFarm);
    return { farm, milkers, milkEnergy, farmEnergy, farmWork: farmEnergy / DAY_ENERGY, walk };
  }

  // Attribute on: everyone spends their day's energy (en: energy per person; rate: energy an hour) on
  // the day's jobs in order (order: "milk", "field", and the extra jobs of the Resources and Craft pages).
  // Milking: a cow's milk takes cowE energy; people milk one cow after another while their energy lasts,
  // first those who may milk but not do today's field work (elders, by default), then the rest, each in
  // village order. Fields: while tending, the 4 fields go to the 4 with the most energy left, a field
  // taking at most fieldE a day; at harvest, people join until the rice has the work it wants. Then
  // children fill what the grown-ups left undone, strongest first, and keep the rest (spare). Each
  // grown-up counts toward the food job they spent most of their energy on.
  // With walking (tv), work and walking share the day's hours, and field work a holder loses to walking
  // is taken up by others who may farm. may(h, job): the jobs table. extra: { wood, craft, collect }
  // jobs, each given the grown-ups with energy and hours left; with them, a field holder works only up
  // to the field's limit while tending.
  const DEFAULT_ORDER = ["milk", "field", "wood", "craft", "collect"];
  function assignEnergy(grownUps, cows, riceWanted, tending, kids, en, cowE, fieldE, tv, rate, may, order, extra) {
    let need = cows * cowE, milkEnergy = 0, farmWork = 0, farmEnergy = 0, tendEnergy = 0, fields = 0, walk = 0;
    const day = tv ? tv.dayHours : Infinity, toPasture = tv ? tv.pasture : 0, toFarm = tv ? tv.farm : 0;
    const can = (h, e, hours, trip, collect) => (tv ? workCap(e, rate.get(h), hours, trip, tv.load, collect) : e);
    const walked = (amount, trip, collect) => (tv ? tripsFor(amount, tv.load, collect) * trip : 0);
    const timeFor = (h, amount, trip, collect) => (tv && amount > 0 ? amount / rate.get(h) + walked(amount, trip, collect) : 0);
    const fieldJob = tending ? "tend" : "harvest";
    // Each grown-up's energy and hours left, milk and field work done, and whether they hold a field
    const pool = grownUps.map((h) => ({ h, e: en.get(h), t: day, m: 0, f: 0, holder: false }));
    const milk = () => {
      for (const fieldsToo of [false, true]) for (const w of pool) {
        if (may(w.h, fieldJob) !== fieldsToo || !may(w.h, "milk")) continue;
        const milked = Math.min(can(w.h, w.e, w.t, toPasture, true), need);
        if (milked <= 0) continue;
        need -= milked; milkEnergy += milked; walk += walked(milked, toPasture, true);
        w.e -= milked; w.m += milked; w.t -= timeFor(w.h, milked, toPasture, true);
      }
    };
    const field = () => {
      const left = pool.filter((w) => w.e > 0 && may(w.h, fieldJob)).sort((a, b) => b.e - a.e);
      let gap = 0;
      for (const w of left) {
        if (!(tending ? fields < FULL_CREW : farmWork < riceWanted - 1e-9)) continue;
        fields++; w.holder = true;
        const done = extra && tending ? Math.min(can(w.h, w.e, w.t, toFarm, false), Math.ceil(fieldE - 1e-9)) : can(w.h, w.e, w.t, toFarm, !tending);
        farmWork += done / DAY_ENERGY; farmEnergy += done; walk += walked(done, toFarm, !tending);
        if (tending) { tendEnergy += Math.min(done, fieldE); gap += Math.min(w.e, fieldE) - Math.min(done, fieldE); }
        w.e -= done; w.f += done; w.t -= timeFor(w.h, done, toFarm, !tending);
      }
      for (const w of left) {   // field work lost to walking, taken up by those without a field
        if (gap <= 1e-9) break;
        if (w.holder) continue;
        const done = Math.min(can(w.h, w.e, w.t, toFarm, false), gap);
        if (done <= 0) continue;
        gap -= done; tendEnergy += done; farmWork += done / DAY_ENERGY; farmEnergy += done; walk += walked(done, toFarm, false);
        w.e -= done; w.f += done; w.t -= timeFor(w.h, done, toFarm, false);
      }
    };
    for (const id of order || DEFAULT_ORDER) {
      if (id === "milk") milk();
      else if (id === "field") field();
      else if (extra && extra[id]) extra[id](pool.filter((w) => w.e > 0 && w.t > 0));
    }
    let milkers = 0, farm = 0;
    for (const w of pool) if (w.holder || w.f > 0) { if (w.f >= w.m) farm++; else milkers++; } else if (w.m > 0) milkers++;
    let kidsWorked = 0;
    const kidsField = may(null, fieldJob, "child"), kidsMilk = may(null, "milk", "child");
    for (const h of kids) {
      let e = en.get(h), farmed = 0;
      const milked = kidsMilk ? Math.min(can(h, e, day, toPasture, true), need) : 0;
      need -= milked; e -= milked; milkEnergy += milked; walk += walked(milked, toPasture, true);
      const t = day - timeFor(h, milked, toPasture, true);
      if (e > 0 && tending && kidsField && fields < FULL_CREW) {
        fields++; farmed = can(h, e, t, toFarm, false); e -= farmed;
        tendEnergy += Math.min(farmed, fieldE); farmWork += farmed / DAY_ENERGY; farmEnergy += farmed; walk += walked(farmed, toFarm, false);
      } else if (e > 0 && !tending && kidsField && farmWork < riceWanted - 1e-9) {
        farmed = Math.min(can(h, e, t, toFarm, true), Math.ceil((riceWanted - farmWork) * DAY_ENERGY - 1e-9)); e -= farmed;   // whole energy, so rice stays whole
        farmWork += farmed / DAY_ENERGY; farmEnergy += farmed; walk += walked(farmed, toFarm, true);
      }
      h.spare = e;
      if (milked + farmed > 0) kidsWorked++;
    }
    return { milkers, milkWork: milkEnergy / DAY_ENERGY, milkEnergy, farm, farmWork, farmEnergy, tendEnergy, kidsWorked, milkShort: need, fields, walk };
  }

  // ---------- Resources ----------
  // The Resources page's jobs, for grown-ups with energy and hours left (pool: { h, e, t }), each in
  // its place in the day's order. Collecting goes a load (tv.load energy) at a time, with a trip home
  // after each. today: { woolLeft (on the sheep), wood (timber in store this morning), spent, walk }.
  const RESOURCES = ["wool", "stone", "wood"];
  // One load of resource r by worker w, if they may and can; true if they went
  function haul(w, r, today, res, may, tv, rate) {
    const trip = !tv ? 0 : r === "wool" ? tv.pasture : r === "stone" ? tv.mine : tv.forest;
    if (!may(w.h, r) || !isFinite(trip) || (r === "wool" && today.woolLeft <= 1e-9)) return false;
    let amount = Math.min(tv ? tv.load : 2, w.e);
    if (r === "wool") amount = Math.min(amount, Math.ceil(today.woolLeft / res.perEnergy.wool - 1e-9));
    if (tv) amount = Math.min(amount, Math.floor(rate.get(w.h) * (w.t - trip) + 1e-9));
    if (amount <= 0) return false;
    w.e -= amount; w.t -= tv ? amount / rate.get(w.h) + trip : 0; today.walk += trip;
    today.spent[r] += amount;
    if (r === "wool") today.woolLeft -= amount * res.perEnergy.wool;
    return true;
  }
  // Woodcutting: while timber (in store plus what's cut today) is under woodTarget, a load at a time by
  // the first who may, anyone not in the middle of a craft before a crafter (busy)
  function cutWood(pool, today, res, may, tv, rate, busy) {
    while (today.wood + today.spent.wood * res.perEnergy.wood < res.woodTarget) {
      let went = false;
      for (const crafter of [false, true]) {
        for (const w of pool) if (w.e > 0 && busy(w.h) === crafter && haul(w, "wood", today, res, may, tv, rate)) { went = true; break; }
        if (went) break;
      }
      if (!went) break;
    }
  }
  // Shearing and quarrying: a load at a time in village order, women shearing first and men quarrying
  // first, or the other when theirs isn't possible (no wool left on the sheep, or barred by the jobs
  // table), until nobody has the energy or hours for another load
  function shearAndQuarry(pool, today, res, may, tv, rate) {
    for (let any = true; any; ) {
      any = false;
      for (const w of pool) {
        if (w.e <= 0) continue;
        for (const r of w.h.sex === MALE ? ["stone", "wool"] : ["wool", "stone"]) if (haul(w, r, today, res, may, tv, rate)) { any = true; break; }
      }
    }
  }

  // ---------- Crafts ----------
  // One loom (紡織) and one forge (鍛造) at the house: one person at each a day, no walking. A craft takes
  // its materials up front and is worked until done, over as many days as it takes: by its crafter if
  // they have energy left, otherwise by the first who may. With nothing under way, a station starts the
  // item of its trade the village has started fewest of, if the materials are in store.
  // stations: { weave, forge }, each { job: { id, left } or null, holder }. today: { craftEnergy, done }
  function craftAtStations(pool, cr, stations, store, started, today, may, tv, rate) {
    for (const kind of ["weave", "forge"]) {
      const items = cr.items.filter((it) => it.job === kind);
      if (!items.length) continue;
      const st = stations[kind], able = (x) => x.e > 0 && x.t > 1e-9 && may(x.h, kind);
      const w = (st.holder && pool.find((x) => x.h === st.holder && able(x))) || pool.find(able);
      if (!w) continue;
      st.holder = w.h;
      for (;;) {
        if (!st.job) {
          let best = null;
          for (const it of items) if (store[it.material] >= it.cost && (!best || started[it.id] < started[best.id])) best = it;
          if (!best) break;
          store[best.material] -= best.cost; started[best.id]++;
          st.job = { id: best.id, left: best.energy };
        }
        let amount = Math.min(w.e, st.job.left);
        if (tv) amount = Math.min(amount, Math.floor(rate.get(w.h) * w.t + 1e-9));
        if (amount <= 0) break;
        w.e -= amount; if (tv) w.t -= amount / rate.get(w.h);
        st.job.left -= amount; today.craftEnergy += amount;
        if (st.job.left <= 1e-9) { today.done[st.job.id] = (today.done[st.job.id] || 0) + 1; st.job = null; }
      }
      if (!st.job) st.holder = null;
    }
  }

  // ---------- The Resources and Craft pages, day by day ----------
  // The sheep's fleeces (fleece[k] = sheep carrying k wool), the stores of wool, stone and timber, the
  // crafts and the loom and forge. startDay(day) grows the fleeces and returns the day's extra jobs for
  // assignEnergy; endDay() puts what came in into store and returns the day's totals.
  function makeEconomy(res, cr, sheepAdults, may, tv, rate) {
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
        today = { woolLeft: woolOnSheep(), wood: store.wood, spent: { wool: 0, stone: 0, wood: 0 }, walk: 0, craftEnergy: 0, done: {} };
        return {
          wood: (pool) => cutWood(pool, today, res, may, tv, rate, busy),
          craft: cr ? (pool) => craftAtStations(pool, cr, stations, store, started, today, may, tv, rate) : null,
          collect: (pool) => shearAndQuarry(pool, today, res, may, tv, rate),
        };
      },
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
        return { resMade: made, resWork: work, craftWork: today.craftEnergy, craftDone, walk: today.walk };
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

  // One day of school. The scholar and every child start together and each stops when their energy
  // (a child's spare energy after any work) runs out. Over the time both are there, the scholar
  // spends S energy and the child K; the child takes home floor(S × effectiveness × min(1, K ÷ S))
  // knowledge, and every knowPerIntel of it is +1 Intelligence for life.
  // The scholar teaches until the last child leaves (or they run out); `spent` is the energy that took.
  function teach(scholar, kids, p, elderAttr, school) {
    const sc = scholarDay(scholar, p, elderAttr, school);
    const sTime = sc.rate > 0 ? sc.energy / sc.rate : 0;
    let knowledge = 0, gained = 0, hours = 0, spent = 0;
    for (const h of kids) {
      const full = workDay(h.power, h.intel);
      const kEnergy = h.spare !== undefined ? h.spare : full.energy;
      const kTime = full.rate > 0 ? kEnergy / full.rate : 0;
      let sE, kE;
      if (kTime <= sTime) { kE = kEnergy; sE = Math.floor(sc.rate * kTime + 1e-9); }
      else { sE = sc.energy; kE = Math.floor(full.rate * sTime + 1e-9); }
      const got = sE > 0 ? Math.floor(sE * school.knowPerEnergy * Math.min(1, kE / sE) + 1e-9) : 0;
      h.knowledge = (h.knowledge || 0) + got;
      const gain = Math.floor(h.knowledge / school.knowPerIntel + 1e-9) - (h.learned || 0);
      if (gain > 0) { h.intel += gain; h.learned = (h.learned || 0) + gain; gained += gain; }
      knowledge += got;
      hours = Math.max(hours, Math.min(kTime, sTime));
      spent = Math.max(spent, sE);
    }
    return { knowledge, gained, hours, spent, energy: sc.energy };
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
  // 1 Power for every foodPerPower extra food they ate as a child.
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
        h.power += ih.grow + Math.floor(h.extra / ih.foodPerPower + 1e-9);
        h.intel += ih.grow;
      }
    }
  }

  // ---------- One village ----------
  function run(cfg) {
    const { F, UP, US, cowAdults, work, inherit, school, detailed } = cfg;
    const none = work === "none", hands = work === "hands", energy = work === "energy";
    const HARVEST_LAST = harvestLastOf(work), HARVEST_DAYS = HARVEST_LAST - HARVEST_FIRST + 1;
    const isHarvest = (doy) => doy >= HARVEST_FIRST && doy <= HARVEST_LAST;
    const attrs = cfg.attrs || { power: 100, intel: 100 }, elderAttr = cfg.elderAttr ?? 1;
    const cowE = FoodModel.cowEnergyOf(F), fieldE = FoodModel.fieldEnergyOf(F);
    const travel = none ? null : cfg.travel || null;
    const roles = cfg.roles || LEGACY_ROLES;
    const roleOf = (h) => { const st = HumanModel.stage(h, p); return st === "child" ? "child" : st === "elder" ? "elder" : h.sex === MALE ? "man" : "woman"; };
    // may(h, job[, role]): whether a person (or a role) may do a job
    const may = (h, jobId, role) => !!roles[role || roleOf(h)][jobId];

    // Separate dice for the village, the advisor and the birth draws, so each policy faces the same luck
    const rand = HerdModel.rng(cfg.seed);
    const arand = HerdModel.rng((cfg.seed ^ 0x5bd1e995) >>> 0);
    const irand = HerdModel.rng((cfg.seed ^ 0x2545f491) >>> 0);
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
    const order = cfg.priority || DEFAULT_ORDER, foodOrder = order.filter((id) => id === "milk" || id === "field");
    const en = new Map(), rt = new Map();   // each person's energy for the day, and energy an hour
    // The Resources and Craft pages' sheep, stores and crafts
    const res = energy ? cfg.resources || null : null;
    const econ = res ? makeEconomy(res, cfg.craft || null, cfg.sheepAdults, may, travel, rt) : null;

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
      pow: f32(), int: f32(), extra: f32(),                                          // adults' attributes, children's extra food
      taught: f32(), gained: i32(), kids: i32(), picked: i32(), lesson: f32(), schPow: nan(), schInt: nan(),   // school
      read: f32(), readGained: i32(),                                                // the scholar's reading
      wool: f32(), stone: f32(), wood: f32(), woolMade: f32(), stoneMade: f32(), woodMade: f32(), resWork: f32(), woolOnSheep: i32(),   // resources
      crafts: cfg.craft ? cfg.craft.items.map(() => i32()) : null, craftWork: f32(), craftDone: i32(), crafting: i32(),   // crafts in store, energy, finished, under way
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
      if (ev) { d.born[day] = ev.born; d.died[day] = ev.died; d.hungry[day] = ev.hungry; d.ration[day] = ev.ration; }
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

    for (let day = 1; day <= T; day++) {
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
        if (hands) {
          const c = HumanModel.census(st.people, p);
          grownUps = c.men + c.women + c.elders;
          const fj = tending ? "tend" : "harvest";
          const groups = [["elder", c.elders], ["man", c.men], ["woman", c.women]].map(([r, n]) => ({ n, milk: may(null, "milk", r), field: may(null, fj, r) }));
          w = assignHands(groups, cows, riceWanted, Math.min(DAY_ENERGY, cowE), travel, tending);
          if (tending) tended += w.farmEnergy / (FULL_CREW * DAY_ENERGY);
          milkSpent = w.milkEnergy;
        } else {
          const adults = [], elders = [], kids = [];
          en.clear();
          for (const h of st.people) {
            if (h.power === undefined) { h.power = attrs.power; h.intel = attrs.intel; }   // born with attrs, without inheritance
            h.spare = undefined;
            const stage = HumanModel.stage(h, p);
            if (h === scholar) continue;   // the scholar only teaches
            const k = stage === "elder" ? elderAttr : 1, wd = workDay(h.power * k, h.intel * k);
            en.set(h, wd.energy); rt.set(h, wd.rate);
            if (stage === "child") { kids.push(h); continue; }
            (stage === "adult" ? adults : elders).push(h);
          }
          grownUps = adults.length + elders.length;
          const helpers = kids.slice().sort((a, b) => en.get(b) - en.get(a));   // strongest children first
          // The Resources and Craft pages' jobs take their place in the day's order
          const extra = econ ? econ.startDay(day) : null;
          w = assignEnergy([...elders, ...adults], cows, riceWanted, tending, helpers, en, cowE, fieldE, travel, rt, may, order, extra);
          if (scholar) {
            const sr = scholar.sex === MALE ? "scholarM" : "scholarF";
            const pupils = may(null, "teach", "child") && may(null, "teach", sr) ? kids : [];
            kidCount = pupils.length;
            if (pupils.length) lesson = teach(scholar, pupils, p, elderAttr, school);
            const left = pupils.length ? lesson.energy - lesson.spent : scholarDay(scholar, p, elderAttr, school).energy;
            if (left > 0 && may(null, "read", sr)) reading = read(scholar, left, school);
          }
          if (econ) { const { walk, ...rest } = econ.endDay(); made = rest; w.walk += walk; }
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
      //    after their parents; anyone who came of age gets their bonus.
      p.F = milkEaten + riceEaten + foodEaten;
      const ev = HumanModel.stepPeople(st, p, rand);
      if (inherit) inheritAttrs(st.people, p, irand, attrs, inherit);
      record(day, ev, {
        milkMade, milkEaten, milkSpoiled, riceMade, riceEaten, riceSpoiled, foodEaten, share: advIQ != null ? share : undefined, iq: advIQ, extra,
        adults: grownUps, farm: w.farm, milkers: w.milkers, kidsWork: w.kidsWorked, cows, crop, field, riceLost,
        milkWork: w.milkWork, farmWork: w.farmWork, walk: w.walk, ...made,
        taught: lesson.knowledge, gained: lesson.gained, kids: kidCount, picked, lesson: lesson.hours, scholar, ...reading,
      });
      if (st.people.length === 0) extinctDay = day;
      if (st.people.length > MAX_PEOPLE) { capped = true; last = day; break; }
    }
    return { counts, last, capped, extinctDay, survived: capped || counts[T] > 0, ...d };

    // The adult with the highest Intelligence (first on a tie)
    function pickScholar(people, p) {
      let best = null;
      for (const h of people) if (HumanModel.stage(h, p) === "adult" && (!best || h.intel > best.intel)) best = h;
      return best;
    }
    // Could the grown-ups, without this person, still fill every food job at the busiest time:
    // every adult cow fully milked and all the fields worked while tending, with no children?
    function foodCoveredWithout(cand, people, p, cows) {
      const adults = [], elders = [], e = new Map(), rate = new Map();
      for (const h of people) {
        if (h === cand) continue;
        const stage = HumanModel.stage(h, p);
        if (stage === "child") continue;
        const k = stage === "elder" ? elderAttr : 1, wd = workDay(h.power * k, h.intel * k);
        e.set(h, wd.energy); rate.set(h, wd.rate);
        (stage === "adult" ? adults : elders).push(h);
      }
      const r = assignEnergy([...elders, ...adults], cows, FULL_CREW, true, [], e, cowE, fieldE, travel, rate, may, foodOrder, null);
      return r.milkShort <= 1e-9 && r.fields >= FULL_CREW;
    }
  }

  window.VillageModel = {
    T, YEAR, RUNS, MAX_ICONS, MAX_PEOPLE, HUMAN_SALT, FULL_CREW, HARVEST_FIRST, TEND_DAYS, HARVEST_PER_HAND, DAY_ENERGY, MAX_HOURS,
    DEFAULT_ORDER, dayOfYear, harvestLastOf, workDay, workCap, tripsFor, runHerd, run, scholarDay, scholarIQ, teach,
  };
})();
