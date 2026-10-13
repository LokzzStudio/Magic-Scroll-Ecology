// Shared village simulation for the Food, Advisor, Production, Attribute, Inheritance and Education
// pages. VillageModel.run(cfg) plays one village for 3,600 days; cfg switches on each page's rules:
//   work      "none"   nobody works: each adult cow gives a standard day's milk, and the year's rice
//                      comes in evenly over days 181–210 (Food, Advisor)
//             "hands"  one job a day per grown-up, each a standard day of 10 energy (Production)
//             "energy" everyone spends their own day's energy, from Power and Intelligence (Attribute on)
//   advisor   null (everyone eats their need), an IQ, or "scholar" (the scholar advises; with no
//             scholar, nobody rations)
//   attrs     starting grown-ups' { power, intel }; elderAttr: the share of both elders work with
//   inherit   null, or { share, variation, grow, extraCap, foodPerPower }: children take after parents
//   school    null, or { knowPerEnergy, knowPerIntel, readPerIntel, shift }: a scholar teaches the
//             children and reads with the energy left over
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

  // ---------- Cows ----------
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
  // Production: one job a day. Every adult cow gets a milker, elders first; adults left over go to
  // the rice, up to the hands it wants.
  function assignHands(adults, elders, cows, riceWanted) {
    const elderMilkers = Math.min(cows, elders);
    const adultMilkers = Math.min(cows - elderMilkers, adults);
    return { farm: Math.min(riceWanted, adults - adultMilkers), milkers: elderMilkers + adultMilkers };
  }

  // Attribute on: everyone spends their day's energy (en: energy per person). Milking first: a cow's
  // milk takes cowE energy, and people (elders first) milk one cow after another while their energy
  // lasts. Adults put what's left into the rice: while tending, the 4 fields go to the 4 with the most
  // left, a field taking at most fieldE a day; at harvest, adults are added until the rice has the work
  // it wants. Then children fill what the grown-ups left undone, strongest first, and keep the rest
  // (spare). Each grown-up counts toward the job they spent most of their energy on.
  function assignEnergy(adults, elders, cows, riceWanted, tending, kids, en, cowE, fieldE) {
    let need = cows * cowE, milkers = 0, milkEnergy = 0, farm = 0, farmWork = 0, farmEnergy = 0, tendEnergy = 0, fields = 0;
    const left = [];   // adults' energy left after milking
    for (const group of [elders, adults]) {
      for (const h of group) {
        let e = en.get(h);
        const milked = Math.min(e, need);
        need -= milked; e -= milked; milkEnergy += milked;
        if (group === adults && e > 0) left.push({ e, milked });
        else if (milked > 0) milkers++;
      }
    }
    left.sort((a, b) => b.e - a.e);
    for (const w of left) {
      if (tending ? fields < FULL_CREW : farmWork < riceWanted - 1e-9) {
        fields++;
        farmWork += w.e / DAY_ENERGY; farmEnergy += w.e;
        if (tending) tendEnergy += Math.min(w.e, fieldE);
        if (w.e >= w.milked) farm++; else milkers++;
      } else if (w.milked > 0) milkers++;
    }
    let kidsWorked = 0;
    for (const h of kids) {
      let e = en.get(h), farmed = 0;
      const milked = Math.min(e, need);
      need -= milked; e -= milked; milkEnergy += milked;
      if (e > 0 && tending && fields < FULL_CREW) {
        fields++; farmed = e; e = 0;
        tendEnergy += Math.min(farmed, fieldE); farmWork += farmed / DAY_ENERGY; farmEnergy += farmed;
      } else if (e > 0 && !tending && farmWork < riceWanted - 1e-9) {
        farmed = Math.min(e, Math.ceil((riceWanted - farmWork) * DAY_ENERGY - 1e-9)); e -= farmed;   // whole energy, so rice stays whole
        farmWork += farmed / DAY_ENERGY; farmEnergy += farmed;
      }
      h.spare = e;
      if (milked + farmed > 0) kidsWorked++;
    }
    return { milkers, milkWork: milkEnergy / DAY_ENERGY, milkEnergy, farm, farmWork, farmEnergy, tendEnergy, kidsWorked, milkShort: need, fields };
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

  // The scholar reads (讀書) with the energy they didn't spend teaching: knowPerEnergy knowledge per
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

    const counts = new Int32Array(T + 1);
    const f32 = () => new Float32Array(T + 1), i32 = () => new Int32Array(T + 1), nan = () => new Float32Array(T + 1).fill(NaN);
    const d = detailed ? {
      men: i32(), women: i32(), boys: i32(), girls: i32(), elders: i32(), couples: i32(),
      born: i32(), died: i32(), hungry: i32(), ration: f32(), snaps: new Array(T + 1),
      made: f32(), drank: f32(), stored: f32(), spoiled: f32(),                     // milk
      riceMade: f32(), riceEaten: f32(), riceStored: f32(), riceSpoiled: f32(),     // rice
      foodEaten: f32(), foodStored: f32(),                                           // the starting food
      share: nan(), iq: nan(),                                                       // the advisor's ration and IQ
      adults: i32(), farm: i32(), milkers: i32(), kidsWork: i32(), cows: i32(),      // work
      crop: f32(), field: f32(), riceLost: f32(), milkWork: f32(), farmWork: f32(),
      pow: f32(), int: f32(), extra: f32(),                                          // adults' attributes, children's extra food
      taught: f32(), gained: i32(), kids: i32(), picked: i32(), lesson: f32(), schPow: nan(), schInt: nan(),   // school
      read: f32(), readGained: i32(),                                                // the scholar's reading
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
        d.milkWork[day] = food.milkWork || 0; d.farmWork[day] = food.farmWork || 0;
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
    const en = new Map();   // each person's energy for the day

    for (let day = 1; day <= T; day++) {
      if (extinctDay !== null) {   // nobody left: the cows go unmilked and the rice untended
        if (d) { d.snaps[day] = new Int32Array(0); if (none) d.made[day] = Math.floor(cowAdults[day - 1] * FoodModel.milkPerDay(F)); else d.cows[day] = cowAdults[day - 1]; }
        continue;
      }
      // 1. Stored food ages a day; anything past its keeping time spoils
      const { milkSpoiled, riceSpoiled } = FoodModel.ageStores(stores);
      milkStored -= milkSpoiled; riceStored -= riceSpoiled;
      const doy = dayOfYear(day), cows = cowAdults[day - 1];
      let milkSpent, riceMade = 0, riceLost = 0, crop = 0, grownUps = 0, farmers = false;
      let w = { farm: 0, milkers: 0, farmWork: 0 }, lesson = { knowledge: 0, gained: 0, hours: 0 }, reading = { read: 0, readGained: 0 }, kidCount = 0, picked = 0;

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
          w = assignHands(c.men + c.women, c.elders, cows, riceWanted);
          if (tending) tended += w.farm / FULL_CREW;
          milkSpent = w.milkers * Math.min(DAY_ENERGY, cowE);
        } else {
          const adults = [], elders = [], kids = [];
          en.clear();
          for (const h of st.people) {
            if (h.power === undefined) { h.power = attrs.power; h.intel = attrs.intel; }   // born with attrs, without inheritance
            h.spare = undefined;
            const stage = HumanModel.stage(h, p);
            if (stage === "child") { kids.push(h); en.set(h, workDay(h.power, h.intel).energy); continue; }
            if (h === scholar) continue;   // the scholar only teaches
            const k = stage === "elder" ? elderAttr : 1;
            en.set(h, workDay(h.power * k, h.intel * k).energy);
            (stage === "adult" ? adults : elders).push(h);
          }
          grownUps = adults.length + elders.length;
          const helpers = kids.slice().sort((a, b) => en.get(b) - en.get(a));   // strongest children first
          w = assignEnergy(adults, elders, cows, riceWanted, tending, helpers, en, cowE, fieldE);
          if (scholar) {
            kidCount = kids.length;
            if (kids.length) lesson = teach(scholar, kids, p, elderAttr, school);
            const left = kids.length ? lesson.energy - lesson.spent : scholarDay(scholar, p, elderAttr, school).energy;
            if (left > 0) reading = read(scholar, left, school);
          }
          if (tending) { tended += w.tendEnergy / (FULL_CREW * fieldE); tendEnergy += w.tendEnergy; }
          milkSpent = w.milkEnergy;
        }
        crop = tended / Math.min(doy, TEND_DAYS);
        if (isHarvest(doy)) riceMade = Math.min(field, hands ? w.farm * HARVEST_PER_HAND : (w.farmEnergy * HARVEST_PER_HAND) / DAY_ENERGY);
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
            : Math.min(field, (HARVEST_LAST - doy) * (hands ? w.farm : w.farmWork) * HARVEST_PER_HAND);
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
        milkWork: w.milkWork, farmWork: w.farmWork,
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
      const adults = [], elders = [], e = new Map();
      for (const h of people) {
        if (h === cand) continue;
        const stage = HumanModel.stage(h, p);
        if (stage === "child") continue;
        const k = stage === "elder" ? elderAttr : 1;
        e.set(h, workDay(h.power * k, h.intel * k).energy);
        (stage === "adult" ? adults : elders).push(h);
      }
      const r = assignEnergy(adults, elders, cows, FULL_CREW, true, [], e, cowE, fieldE);
      return r.milkShort <= 1e-9 && r.fields >= FULL_CREW;
    }
  }

  window.VillageModel = {
    T, YEAR, RUNS, MAX_ICONS, MAX_PEOPLE, HUMAN_SALT, FULL_CREW, HARVEST_FIRST, TEND_DAYS, HARVEST_PER_HAND, DAY_ENERGY, MAX_HOURS,
    dayOfYear, harvestLastOf, workDay, runHerd, run, scholarDay, scholarIQ, teach,
  };
})();
