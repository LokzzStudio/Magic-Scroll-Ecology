// Shared village simulation for the Food, Attribute, Inheritance, Education, Happiness, Resources and
// Craft pages. VillageModel.run(cfg) plays one village for 18,000 days (50 years); cfg switches on each page's rules:
//   work      "none"   nobody works: each adult cow gives a standard day's milk, and the year's rice
//                      comes in evenly over days 181–210 (Food)
//             "energy" everyone spends their own day's energy, from Power and Intelligence (Attribute on)
//   mode      "macro" (the default): each day's work is worked out for the village as a whole;
//             "micro": person by person through the day (micro-model.js), for checking the macro
//             model and for watching a day (traceDay: the day to keep a record of, as cfg.trace)
//   advisor   null (everyone eats their need), an IQ, or "scholar" (the scholar with the highest
//             Intelligence advises; with no scholar, nobody rations)
//   shares    null, or { grown, kids }: the player rations instead, each a fraction of need (children's
//             above 1 is extra food, from the Inheritance page on)
//   attrs     starting grown-ups' { power, intel }; elderAttr: the share of both elders work with
//   inherit   null, or { share, variation, grow, powerBase, bornPower }: children are born with
//             bornPower and take their Intelligence after their parents
//   school    null, or { knowPerEnergy, knowBase, shift, most }: up to `most` scholars teach the
//             children and write poetry (吟詩) with the energy left over
//   travel    null, or the map and the day (MapModel.travelOf): when people wake, how long they're out,
//             lunch and meals, and the walking between places (Attribute on). With it, hunger is felt
//             through the day (hungerOf) instead of all at once.
//   roles     a jobs table (RolesModel): who may do which job; RolesModel's default table without one
//   resources null, or { fleece, regrow, perEnergy: { wool, stone, wood }, tiers: { wood, stone } (the
//             forest's and the mine's; SR without) } with cfg.sheepAdults (and
//             cfg.sheepTiers, runHerd's tiers; all SR without): grown-ups' energy left after the
//             food work shears wool, quarries stone and cuts wood, each in lots of a tier (Resources)
//   craft     null, or { items: [{ id, job, needs: { material: amount }, energy, wear }], bonus }: one loom
//             and one forge at the house turn stores into crafts (N to UR), each lasting wear energy of its use;
//             bonus[t]: a 刀 or 叉 of tier t's bonus to effectiveness (toolBonus without) (Craft)
//   cold      null, or { sets, stats, k, clothStep, fireStep, fireHours, fireReach, fireEnergy }: in Micro
//             mode, each village's own weather (WeatherModel.simulateYear with the Weather page's sets and
//             each season's temperature figures) gives each hour's temperature; out of the house below 0 °C
//             (felt: 衣 and fires add warmth) people suffer hypothermia, at a toll like hunger's (Clothing)
//   kit       null, or { blade, fork, clothes, hat, tier }: that many 刀, 叉 (Craft), 衣 and 笠 (Clothing) of that tier in store on day 1
//   water     null, or { cap, ground, at, use, growth }: the well (cap) and the 4 fields' water (Watering),
//             with the Clothing page's weather: see the Watering section of run
//   rain      null, or { sets, stats, hatStep, limit }: in Micro mode, the same weather's rainfall hour by
//             hour (0–10, snow too) cuts work out of the house by (felt ÷ 10)², felt = the rainfall less
//             hatStep × their 笠's tier; from limit on they go home and stay in, unless a 笠 brings it
//             under; rain burns a fire down faster, by the same cut, and at 10 none can be lit (Clothing)
//   priority  the order of the day's jobs from the Attribute page on: "milk", "field", "craft",
//             "collect", "teach", "read" (DEFAULT_ORDER without one)
//   happiness null, or { iqStep }: each person's happiness (0–100) sets their own chance of a
//             child, and couples last for life (Happiness)
//   skills    null, or { exp: [to level 1, …, to level 4], bonus: [% at level 1, …, % at level 4] }:
//             everyone gets better at the jobs they do, each energy there doing more (Resources)
// Needs herd-model.js, human-model.js, food-model.js, ration-model.js, roles-model.js and day-model.js (the day: the
// clock, walking, lunch, carrying and hunger) loaded first, and micro-model.js for Micro mode.
(function () {
  const T = 18000, YEAR = 360;
  const RUNS = 20;                 // runs per page; the first is the one drawn
  const MAX_ICONS = 90;            // people or animals drawn per group
  const MAX_PEOPLE = 2000;         // a run stops once it grows past this, to keep the page fast
  const HUMAN_SALT = 200000;       // keeps the people's dice apart from the cows'
  const FULL_CREW = FoodModel.TEND_CREW;   // 4 fields, so a full crew is 4
  const HARVEST_FIRST = 181, TEND_DAYS = HARVEST_FIRST - 1;
  const HARVEST_PER_HAND = 2500;   // rice a standard day (100 energy) brings in at harvest
  const DAY_ENERGY = FoodModel.DAY_ENERGY;
  const { MALE } = HumanModel;
  const { iqError } = RationModel;
  const { newClock, workAt, canAt, dayEnd, hungerOf, atHome, workSpans, classSpans, sharedHours, NO_MAP } = DayModel;

  const dayOfYear = (day) => ((day - 1) % YEAR) + 1;
  // Shuffles arr in place (Fisher–Yates, on the dice rnd) and returns it
  const shuffle = (arr, rnd) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  // Last harvest day: nobody working means a short harvest that brings itself in
  const harvestLastOf = (work) => (work === "none" ? 210 : 270);

  // One person's working day. Power is durability (energy = Power, whole); Intelligence is
  // efficiency (Intelligence ÷ 10 energy an hour: a standard day's energy in DAY_HOURS). How much of it
  // gets done is up to the day (DayModel.workAt).
  const DAY_HOURS = 10;
  function workDay(power, intel) {
    const energy = Math.floor((DAY_ENERGY * power) / 100 + 1e-9), rate = (intel / 100) * (DAY_ENERGY / DAY_HOURS);
    return { durability: energy, rate, hours: rate > 0 ? energy / rate : 0, energy, output: energy / DAY_ENERGY };
  }

  // ---------- Herds (cows, and the Resources page's sheep) ----------
  // perIcon: only animals whose id is a multiple of it are kept for drawing
  // tier: the starting animals' (HerdModel.TIERS), maxTier the highest a newborn can be; tiers[t][day]:
  // the adults of tier t
  function runHerd(HP, start, seed, detailed, perIcon, tier = 3, maxTier = HerdModel.HERD_MAX_TIER) {
    const rand = HerdModel.rng(seed);
    const state = HerdModel.startHerd(start, HP, rand, tier, HerdModel.rng((seed + HerdModel.TIER_SALT) >>> 0), maxTier);
    const counts = new Int32Array(T + 1), adults = new Int32Array(T + 1), tiers = [null, 1, 2, 3, 4].map((t) => t && new Int32Array(T + 1));
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
      for (const a of state.herd) if (a.age < HP.M) young++; else tiers[a.tier][day]++;
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
    return { counts, adults, tiers, last: T, extinctDay, survived: counts[T] > 0, ...d };
  }

  // A cow gives as much as its one milker of the day milks from it, whatever its tier. milkGiven: the milk the adult cows
  // give on a day nobody works (Food page), a standard day's each. herd: runHerd's { adults }.
  function milkGiven(F, herd, day) {
    return Math.floor(herd.adults[day] * FoodModel.milkPerDay(F) + 1e-9);
  }

  // ---------- Work ----------
  // Attribute on: everyone spends their day's energy (en: energy per person; rate: energy an hour) on
  // the day's jobs in order (order: "milk", "field", and the extra jobs of the Resources page),
  // each person as far as their day allows (workAt).
  // Milking: one milker to an adult cow for the day, who milks it while their energy lasts (a cow has no
  // limit); the cows go first to those who may milk but not do today's field work (milk-only), then to
  // the rest, in the order given (grownUps: the order they came to work). Fields: one person to each of
  // the 4 fields a day, whoever has the most energy left first; while tending, each up to the field's daily
  // limit (fieldE); at harvest, until the rice has the work it wants. Then children fill what the grown-ups left undone,
  // strongest first, in the day's order of jobs, stopping at Education if there's class today
  // (classToday), and keep the rest (h.spare, for class from h.from hours). Each grown-up counts
  // toward the food job they spent most of their energy on. may(h, job): the jobs table. extra: { craft,
  // collect } jobs, each given the grown-ups with energy left and the day's ops. clocks: a Map
  // that gets each person's clock. eff: null, or (h, skill) → their effectiveness at it (Resources):
  // what each energy brings in there; each clock then gets the energy they spent on each skill (exp).
  const DEFAULT_ORDER = ["field", "milk", "craft", "collect", "teach", "read"];
  // An order with every job in it: any it lacks go at the end, as in the default
  const fullOrder = (order) => [...order, ...DEFAULT_ORDER.filter((id) => !order.includes(id))];
  // Whether the scholar teaches before writing poetry: Education comes first, or they may not write
  const teachesFirst = (order, mayRead) => !mayRead || order.indexOf("teach") < order.indexOf("read");
  // weather: null, or macroWeather's day (each person's clock gets their hooks, c.wx), and each work's
  // take is × its rain cut (w.wf: the share of it the rain left)
  function assignEnergy(grownUps, cows, riceWanted, tending, kids, en, fieldE, S, rate, may, order, extra, clocks, classToday, eff, weather = null) {
    let freeCows = cows, milkEnergy = 0, farmWork = 0, farmEnergy = 0, tendEnergy = 0, tendBase = 0, fields = 0;
    const fieldJob = tending ? "tend" : "harvest";
    // A person's effectiveness at a skill (SKILLS), plus the bonus of the tool they have for it (a 叉
    // hayfork farming, a 刀 blade collecting). It's a yield: at milking, tending, shearing, woodcutting
    // and quarrying (isYield) each energy takes 1 of what's there (the field's daily limit, the sheep's
    // wool; a cow, and the rest, have no limit) and brings in effectiveness × that, so a skilled hand gets
    // more out of the same cow, field or sheep; at the harvest it's speed instead (the standing rice is all there is): each
    // energy does effectiveness × its work. ops: what someone could still do at a place, and doing
    // `amount` of it (collect: carried home, 搬運), both in energy at a yield job (mult: what each brings
    // in) and in work elsewhere.
    const effOf = (w, skill) => { const t = skill === "farm" && !tending ? w.b : toolFor(w, skill); return (eff ? eff(w.h, skill) : 1) + (t ? t.bonus : 0); };   // the harvest (收割) uses a 刀
    const isYield = (skill) => skill === "milk" || skill === "wool" || skill === "wood" || skill === "stone" || (skill === "farm" && tending);
    const ops = {
      can: (w, place, collect, skill) => canAt(w.c, place, w.e, w.r, S, collect) * (isYield(skill) ? 1 : effOf(w, skill)),
      work: (w, place, amount, collect, skill) => {
        const c = w.c, yieldJob = isYield(skill), m = yieldJob ? 1 : effOf(w, skill);
        if (c.wx) { c.wetE = 0; c.rainE = 0; c.fireE = 0; }
        const done = amount > 1e-9 ? workAt(c, place, amount / m, w.r, S, collect) : 0;
        w.e -= done;
        w.wf = 1;
        if (c.wx) {   // the weather: the rain's cut, and fires lit
          w.e -= c.fireE;
          if (done > 0) w.wf = c.wetE / done;
          if (place !== "H" && done > 0) {   // what the rain and the cold took
            const full = done * effOf(w, skill), rain = c.rainE / done;
            if (weather.wet) { weather.wet.outWork += full * w.wf; weather.wet.lost += full * (1 - rain); }
            if (weather.chill) weather.chill.coldCut += full * (rain - w.wf);
          }
        }
        if (w.e < 1e-9) w.e = 0;   // a crumb left over from dividing by effectiveness is nothing
        if (w.x && done > 0) w.x[SKILL_IX[skill]] += done;
        return yieldJob ? done : done * m * w.wf;
      },
      mult: (w, skill) => effOf(w, skill),
    };
    const { can, work } = ops;
    const riceLeft = () => Math.ceil((riceWanted - farmWork) * DAY_ENERGY - 1e-9);   // whole energy, so rice stays whole
    // Each grown-up's energy left, rate and clock, and milk and field work done
    const pool = grownUps.map((h) => ({ h, e: en.get(h), r: rate.get(h), c: newClock(S), m: 0, f: 0, x: eff && clocks ? h.xp.fill(0) : null, b: undefined, fork: undefined }));   // b, fork: their blade and hayfork today (null: none)
    // In the weather, everyone wakes at an even spread over the wake-up window, in the order they come to work
    const woken = grownUps.length + kids.length, wakeAt = (k) => S.wake0 + ((S.wake1 - S.wake0) * (k + 0.5)) / woken;
    if (weather) pool.forEach((w, k) => { w.c.wx = weather.person(w.h, wakeAt(k)); });
    // One person on a cow (freeCows: those nobody has taken today), as much as their day allows
    const milkOne = (w) => {
      if (freeCows <= 0) return 0;
      const milked = work(w, "P", can(w, "P", true, "milk"), true, "milk");
      if (milked > 0) freeCows--;
      milkEnergy += milked * ops.mult(w, "milk") * w.wf;
      return milked;
    };
    const milk = () => {
      for (const fieldsToo of [false, true]) for (const w of pool) if (may(w.h, fieldJob) === fieldsToo && may(w.h, "milk")) w.m += milkOne(w);
    };
    // The field work still wanted: while tending, what's left of the 4 fields' daily limit; at harvest,
    // what's left of the work the rice wants
    const fieldLeft = () => (tending ? FULL_CREW * fieldE - tendBase : riceLeft());
    const fieldOpen = () => fields < FULL_CREW && fieldLeft() > 1e-9;
    const tools = !!(extra && extra.takeTool);   // the Craft page's tools
    // One person on a field (fields: how many are worked today), up to what's still wanted and, while
    // tending, a field's daily limit; the day's hayfork is taken before they see what they can do, and put
    // back if they do nothing
    const farmOne = (w) => {
      const key = tending ? "fork" : "b", fresh = tools && w[key] === undefined;   // tending takes a 叉, the harvest a 刀
      if (fresh) w[key] = extra.takeTool(tending ? "fork" : KNIFE);
      w.c.fieldIx = tending ? fields : -1;   // the field they're on (the Watering page's water)
      const e0 = w.e, done = work(w, "F", Math.min(can(w, "F", !tending, "farm"), fieldLeft(), tending ? fieldE : Infinity), !tending, "farm");
      w.c.fieldIx = -1;
      if (done <= 0) { if (fresh) { extra.untake(w[key]); w[key] = undefined; } return 0; }
      if (tools) extra.farmed(w[key], e0 - w.e);
      if (tending) { tendBase += done; tendEnergy += done * ops.mult(w, "farm") * w.wf; }
      farmWork += done / DAY_ENERGY; farmEnergy += done; fields++;
      return done;
    };
    const field = () => {
      for (const w of pool.filter((w) => w.e > 0 && may(w.h, fieldJob)).sort((a, b) => b.e - a.e)) {
        if (!fieldOpen()) break;
        w.f += farmOne(w);
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
    const kidPool = kids.map((h) => ({ h, e: en.get(h), r: rate.get(h), c: newClock(S), x: eff && clocks ? h.xp.fill(0) : null, b: undefined, fork: undefined }));
    if (weather) kidPool.forEach((w, k) => { w.c.wx = weather.person(w.h, wakeAt(grownUps.length + k)); });
    for (const w of kidPool) {
      let farmed = 0, milked = 0;
      for (const id of fullOrder(order || DEFAULT_ORDER)) {
        if (id === "teach" && classToday) break;
        if (id === "milk" && kidsMilk) milked = milkOne(w);
        else if (id === "field" && w.e > 0 && kidsField && fieldOpen()) farmed = farmOne(w);
      }
      w.h.spare = w.e;
      w.h.from = w.c.t + S.between(w.c.at, "H");   // back at the house for class
      if (milked + farmed > 0) kidsWorked++;
    }
    if (clocks) for (const w of pool.concat(kidPool)) { w.c.spent = w.e <= 1e-9; w.c.left = w.e; w.c.exp = w.x; clocks.set(w.h, w.c); }
    return { milkers, milkWork: milkEnergy / DAY_ENERGY, milkEnergy, farm, farmWork, farmEnergy, tendEnergy, tendBase, kidsWorked, fields };
  }

  // ---------- The weather, in Macro ----------
  // The Clothing page's cold and rain in Macro mode: Micro's rules (micro-model.js), worked along each
  // person's clock (DayModel's workWx asks their hooks, person(h, wake)), clock hour = wake + hours since
  // waking. Fires are the day's, lit by anyone worked out so far. C, Rn: the day's cold and rain, as Micro
  // gets them; E: the economy's state (衣, 笠, timber); p: the human parameters (need); water: the day's
  // watering (DayModel.wateringOf), for fields tended (c.fieldIx) or null. Returns the hooks
  // and the day's totals: chill { cold: Map(h → days of life lost), coldHours, fires } and wet { inH,
  // lost, outWork, hats }, as Micro's.
  function macroWeather(C, Rn, E, S, p, water = null) {
    const EPS = 1e-9;
    const chill = C ? { cold: new Map(), coldHours: 0, fires: 0, coldCut: 0 } : null, wet = Rn ? { inH: 0, lost: 0, outWork: 0, hats: 0 } : null;
    const Wx = DayModel.weatherOf(C, Rn, E, S, wet);
    function warmUp(x, T) { chill.coldHours += Math.max(0, T - x.coldSince); x.coldSince = null; }
    // Out of the house from t0 to t1 (hours since waking) at place (null: walking): into hypothermia, or out
    // of it, where the felt temperature crosses 0 (straight between the two), and its toll so far
    function look(x, t0, t1, place) {
      if (!C || !x.away) return;
      const f = (T) => Wx.felt(x, place, T), T0 = x.w0 + t0, T1 = x.w0 + t1, f0 = f(T0), f1 = f(T1), cross = () => (f0 === f1 ? T0 : T0 + ((T1 - T0) * f0) / (f0 - f1));
      if (x.coldSince === null) { if (f1 < 0) { x.coldSince = f0 < 0 ? T0 : cross(); x.coldLost += Wx.toll(f, x.coldSince, x.coldSince, T1, x.u); } }
      else if (f1 >= 0) { const Tw = f0 >= 0 ? T0 : cross(); x.coldLost += Wx.toll(f, x.coldSince, T0, Tw, x.u); warmUp(x, Tw); }
      else x.coldLost += Wx.toll(f, x.coldSince, T0, T1, x.u);
    }
    const tooCold = (x, place, T) => !!C && Wx.tooCold(x, place, T);
    // Indoors from the weather, for hunger (and the rain's hours in)
    const goIn = (x, t, why) => { if (x.inSince === null) { x.inSince = t; x.inWhy = why; } };
    const comeOut = (x, t) => { if (x.inSince !== null) { x.inside.push([x.inSince, t]); if (wet && x.inWhy === "rain") wet.inH += t - x.inSince; x.inSince = null; } };
    function person(h, w0) {
      const x = { h, w0, u: S.active / HumanModel.needOf(h, p), cloth: null, hat: null, timber: 0, away: false, coldSince: null, coldLost: 0, inSince: null, inWhy: null, inside: [] };
      return {
        x, water,
        leave(c, place, e) {
          const T = w0 + c.t;
          if ((Rn && !Wx.hatFor(x, T)) || (C && !Wx.dressFor(x, place, T, e))) {   // too wet or cold: in, and look again on the hour
            goIn(x, c.t, Wx.tooWet(x, T) ? "rain" : "cold");
            return Math.min(Math.floor(T + EPS) + 1 - w0, c.lunched ? S.active : S.lunch);
          }
          comeOut(x, c.t); x.away = true;
          return null;
        },
        walked(c, t0) { look(x, t0, c.t, null); },
        arrive(c, place) {
          const T = w0 + c.t;
          if (Wx.tooWet(x, T)) return "rain";
          if (C && x.timber && !Wx.noFire(T)) { Wx.light(x, place, T); chill.fires++; c.fireE += C.fireEnergy; look(x, c.t, c.t, place); }
          return tooCold(x, place, T) ? "cold" : null;
        },
        // The cuts to a unit starting now at place: the rain's, and the cold's
        rainMult: (c) => (Rn ? 1 - (Wx.wetAt(x, w0 + c.t) / 10) ** 2 : 1),
        coldMult: (c, place) => (C ? 1 - Wx.coldCut(Wx.felt(x, place, w0 + c.t)) : 1),
        worked(c, t0, place) { look(x, t0, c.t, place); },
        after: (c, place) => (tooCold(x, place, w0 + c.t) ? "cold" : Wx.tooWet(x, w0 + c.t) ? "rain" : null),
        home(c, why) {
          if (C && x.coldSince !== null) warmUp(x, w0 + c.t);
          x.away = false;
          if (x.timber) { E.untakeTimber(x.timber); x.timber = 0; }   // turned back before lighting it
          if (why === "rain" || why === "cold") goIn(x, c.t, why);
        },
        eat(c) { comeOut(x, c.t); },
        stop(c) { if (!x.away) comeOut(x, c.t); },   // waiting by the house, no longer kept in
        // The day's end: the walk home (as dayEnd), their toll, and their time in ([[from, to]] or null)
        end(c) {
          if (x.away) { const t0 = c.t; c.t += S.between(c.at, "H"); look(x, t0, c.t, null); if (C && x.coldSince !== null) warmUp(x, w0 + c.t); c.t = t0; x.away = false; }
          comeOut(x, c.t);
          if (x.timber) { E.untakeTimber(x.timber); x.timber = 0; }
          if (chill) chill.cold.set(h, x.coldLost);
          return x.inside.length ? x.inside : null;
        },
      };
    }
    return { person, chill, wet };
  }

  // ---------- Tiers ----------
  // From the Resources page on, wool, timber, stone and crafts have tiers (HerdModel.TIERS), each drawn
  // (HerdModel.drawTier) from the average of what went into it, on the village's own tier dice. What
  // goes in: a person's tier at a skill, their level there (level 0 counting as N); their human tier, ⌊(Intelligence − 1) ÷ 10 − 8⌋
  // held to 1–4 (from their rate, Intelligence ÷ 10: N to 100, R 101–110, SR 111–120, SSR above); the sheep's, the forest's and the mine's tier; and
  // a craft's materials.
  const adjSkill = (h, skill) => Math.max(1, h.level ? h.level[skill] : 0);
  const humanTier = (rate) => Math.min(4, Math.max(1, Math.floor((rate * 10 - 1) / 10 - 8 + 1e-9)));
  const LOT = 100, KNIFE = "blade";
  // Tools: a 叉 hayfork for tending, a 刀 blade for the harvest and collecting, each adding its bonus (cr.bonus, by tier) to
  // the holder's effectiveness there (a yield, as skill's); by default +20%, +40%, +60%, +80%, +100% (toolFor:
  // the one w has for a skill, or none)
  const toolBonus = (tier) => 0.2 * tier;
  // A craft's tier, N to UR: round((score + roll) ÷ 2), half up, the roll an even draw of 1.01, 1.02, …,
  // score + 1. The roll always starts near the bottom, so the better the inputs, the further it pulls
  // the tier down: all SSR (score 4.00) makes SSR half the time, and UR only 1 in 400 (the top roll);
  // below 4.00, never. Worked in hundredths, the score rounded to one (so 4.00 + 5.00 is exactly 9).
  // craftTierOdds: the chance of each tier (index 1–5) at a score.
  const CRAFT_MAX_TIER = 5, ROLL = 100;
  const craftRolls = (score) => { const s = Math.round(score * ROLL); return { s, lo: ROLL + 1, hi: Math.max(ROLL + 1, s + ROLL) }; };
  const tierOfRoll = (s, roll) => Math.min(CRAFT_MAX_TIER, Math.max(1, Math.floor((s + roll + ROLL) / (2 * ROLL))));
  function craftTier(score, rand) {
    const { s, lo, hi } = craftRolls(score);
    return tierOfRoll(s, lo + Math.floor(rand() * (hi - lo + 1)));
  }
  function craftTierOdds(score) {
    const { s, lo, hi } = craftRolls(score), odds = new Array(CRAFT_MAX_TIER + 1).fill(0);
    for (let r = lo; r <= hi; r++) odds[tierOfRoll(s, r)] += 1 / (hi - lo + 1);
    return odds;
  }
  const toolFor = (w, skill) => (skill === "farm" ? w.fork : skill === "wool" || skill === "wood" || skill === "stone" ? w.b : null);

  // ---------- Resources ----------
  // The Resources page's jobs, for grown-ups with energy left (pool: { h, e, c }), each in its place in
  // the day's order; ops: { can(w, place, collect, skill), work(w, place, amount, collect, skill) }. today: { woolLeft (on the sheep),
  // spent }.
  const RESOURCES = ["wool", "stone", "wood"];
  // How many may work the mine and the forest a day, one to a place (res.crew: { stone, wood }; these without)
  const CREW = { stone: 2, wood: 3 };
  const PLACE_OF = { wool: "P", stone: "M", wood: "T" };
  // What a grown-up collects, in the order they try it: of their own (women wool, men stone) and timber,
  // the one there was less of in store this morning (today.opening; their own on a tie), then the other,
  // then the other sex's. (The morning's stores, not counting today's take: in Micro everyone chooses
  // before much is brought in, so Macro, which works one person's whole day out at a time, does the same.)
  function collectOrder(h, today) {
    const own = h.sex === MALE ? "stone" : "wool", has = (r) => today.opening[r];
    return [...(has("wood") < has(own) ? ["wood", own] : [own, "wood"]), own === "wool" ? "stone" : "wool"];
  }
  // Shearing, quarrying and woodcutting, in village order, each as much as their day allows, in their
  // collectOrder; a job isn't possible when barred by the jobs table, or with no place left for them: one
  // shearer to a sheep with wool on it (the fullest first, each getting at most its wool), one person to a
  // place at the mine or the forest (today.places: the crew each may have). They take the best free blade for the day first, and put
  // it back if they collect nothing.
  function collect(pool, ops, store, today, res, may, E) {
    const taken = { wool: 0, stone: 0, wood: 0 };
    for (const w of pool) {
      const fresh = w.b === undefined;
      if (fresh) w.b = E.takeTool(KNIFE);
      let any = false;
      for (const r of collectOrder(w.h, today)) {
        if (w.e <= 0 || !may(w.h, r) || taken[r] >= today.places[r]) continue;
        let want = ops.can(w, PLACE_OF[r], true, r);   // energy
        if (r === "wool") want = Math.min(want, Math.ceil(today.woolLeft / res.perEnergy.wool - 1e-9), today.sheepWool[taken.wool] / res.perEnergy.wool);
        if (want <= 1e-9) continue;
        const e0 = w.e, done = ops.work(w, PLACE_OF[r], want, true, r), got = done * ops.mult(w, r) * w.wf;
        if (done > 0) { any = true; taken[r]++; }
        E.collected(r, w.h, w.b, got, e0 - w.e);
        today.spent[r] += got;
        if (r === "wool") today.woolLeft -= done * res.perEnergy.wool;
      }
      if (fresh && !any) { E.untake(w.b); w.b = undefined; }
    }
  }

  // ---------- Crafts ----------
  // One loom (紡織) and one forge (鍛造) at the house, one person at each a day. A craft takes its
  // materials up front and is worked until done, over as many days as it takes, by whoever has the
  // station that day: as in Micro, the first who's free of the food work (in the day's order), or with
  // none free, the first who may; when they run out, the station waits for tomorrow.
  // With nothing under way, a station's next item is the one of its trade the village has started fewest
  // of (the first on a tie); it waits for all that item's materials to be in store (startCraft).
  // stations: { weave, forge }, each { job }. job: { id, left, mat (its materials' tier), w, s, h
  // (work on it, × the crafter's skill tier, × their human tier) } or null. E.startCraft(items, st):
  // starts the station's next item if its materials are in store (makeEconomy).
  function craftAtStations(pool, ops, cr, stations, E, may) {
    for (const kind of ["weave", "forge"]) {
      const items = cr.items.filter((it) => it.job === kind);
      if (!items.length) continue;
      const st = stations[kind], able = (x) => x.e > 0 && may(x.h, kind) && ops.can(x, "H", false, kind) > 0;
      const w = pool.find((x) => !(x.m > 0) && !(x.f > 0) && able(x)) || pool.find(able);   // today's crafter
      while (w && able(w)) {
        if (!st.job && !E.startCraft(items, st)) break;
        E.creditCraft(st, kind, w.h, w.r, ops.work(w, "H", Math.min(st.job.left, ops.can(w, "H", false, kind)), false, kind));
      }
    }
  }

  // ---------- The Resources page and after, day by day ----------
  // The sheep's fleeces by tier (fleece[t][k] = sheep of tier t carrying k wool), the stores of wool,
  // stone and timber (and their lots by tier), the crafts by tier and the loom and forge. startDay(day)
  // grows the fleeces and returns the day's extra jobs for assignEnergy; endDay() puts what came in into
  // store and returns the day's totals. state(): the pieces Micro mode works with directly. tiles: { stone,
  // wood }, how many may work the mine and the forest a day, one person to each place.
  function makeEconomy(res, cr, sheepAdults, sheepTiers, may, trand, tiles, cold = false, rainy = false, kit = null) {
    const store = { wool: 0, stone: 0, wood: 0 }, energy = { wool: 0, stone: 0, wood: 0 };   // energy spent so far: fractions carry over
    const fleece = [null, 1, 2, 3, 4].map((t) => t && new Int32Array(res.fleece + 1));
    const adultsOf = (t, day) => (sheepTiers ? sheepTiers[t][day - 1] : t === 3 && sheepAdults ? sheepAdults[day - 1] : 0);
    // Lots: the units of each tier in store (lots[r][t]), and the lot still filling (open[r]: units and
    // the sum of their factor averages). A lot closes at 100 units, or early when a craft needs it.
    const lots = Object.fromEntries(RESOURCES.map((r) => [r, new Float64Array(5)])), open = Object.fromEntries(RESOURCES.map((r) => [r, { n: 0, f: 0 }]));
    const closeLot = (r) => { const o = open[r]; if (o.n > 0) lots[r][HerdModel.drawTier(o.f / o.n, trand)] += o.n; o.n = 0; o.f = 0; };
    const addUnits = (r, n, avg) => {
      const o = open[r];
      while (n > 0) { const t = Math.min(n, LOT - o.n); o.n += t; o.f += t * avg; n -= t; if (o.n >= LOT) closeLot(r); }
    };
    // Takes n of r from the lots, worst tier first, and returns n × their average tier
    const take = (r, n) => {
      const L = lots[r];
      if (L[1] + L[2] + L[3] + L[4] < n - 1e-9) closeLot(r);
      let sum = 0;
      for (let t = 1; t <= 4 && n > 1e-9; t++) { const k = Math.min(L[t], n); L[t] -= k; n -= k; sum += k * t; }
      return sum;
    };
    // A station's next item: the one of its items started fewest (the first on a tie); whether its
    // materials are all in store
    const nextCraft = (items) => { let best = items[0]; for (const it of items) if (started[it.id] < started[best.id]) best = it; return best; };
    const ready = (it) => { for (const m in it.needs) if (store[m] < it.needs[m]) return false; return true; };
    const crafted = {}, started = {};   // crafted[id]: [all, tier 1, …, tier 4]
    if (cr) for (const it of cr.items) { crafted[it.id] = new Int32Array(CRAFT_MAX_TIER + 1); started[it.id] = 0; }
    const stations = cr ? { weave: { job: null }, forge: { job: null } } : null;
    // Each craft in store: { tier, used (energy spent using it), day (last taken) }, by tier (tools[id][t]),
    // oldest first. 刀 blades go out with collectors and harvesters, 叉 hayforks with those tending, 衣 and 笠 with everyone (dress)
    const tools = {}, wearOf = {};
    if (cr) for (const it of cr.items) { tools[it.id] = Array.from({ length: CRAFT_MAX_TIER + 1 }, () => []); wearOf[it.id] = it.wear; }
    // The starting kit: crafts in store from day 1, as if just made
    if (cr && kit) for (const id of ["blade", "fork", "clothes", "hat"]) if (tools[id]) for (let k = 0; k < (kit[id] || 0); k++) {
      tools[id][kit.tier].push({ id, tier: kit.tier, used: 0, day: 0, bonus: cr.bonus ? cr.bonus[kit.tier] : toolBonus(kit.tier) });
      crafted[id][0]++; crafted[id][kit.tier]++;
    }
    let dayNow = 0;
    const woolOnSheep = () => { let s = 0; for (let t = 1; t <= 4; t++) for (let k = 1; k <= res.fleece; k++) s += k * fleece[t][k]; return s; };
    let today = null;
    const E = {
      store,
      canStart: (items) => ready(nextCraft(items)),
      // Starts a station's next item, taking its materials (their tier: the average of what's taken)
      startCraft(items, st) {
        const it = nextCraft(items);
        if (!ready(it)) return false;
        let units = 0, tiers = 0;
        for (const m in it.needs) { tiers += take(m, it.needs[m]); units += it.needs[m]; store[m] -= it.needs[m]; }
        started[it.id]++;
        st.job = { id: it.id, left: it.energy, mat: units ? tiers / units : 0, w: 0, s: 0, h: 0 };
        return true;
      },
      // The best of a craft nobody has taken today (the oldest of its tier), kept for the day; null: none left
      takeTool(id) {
        const byTier = tools[id];
        if (!byTier) return null;
        let best = null;
        for (let t = CRAFT_MAX_TIER; t >= 1 && !best; t--) for (const b of byTier[t]) if (b.day !== dayNow) { best = b; break; }
        if (best) { best.day = dayNow; today.out[id] = (today.out[id] || 0) + 1; today.taken.push(best); }
        return best;
      },
      // Back in store untouched (taken for a job they didn't get)
      untake(t) { if (t) { t.day = 0; today.out[t.id]--; } },
      // Against the cold (the Clothing page) or the rain (笠, id "hat"): the 衣 of the lowest
      // tier at least minTier nobody has taken today, kept for the day; null: none
      clothFor(minTier, id = "clothes") {
        const byTier = tools[id];
        if (!byTier) return null;
        for (let t = Math.max(1, minTier); t <= CRAFT_MAX_TIER; t++) for (const b of byTier[t]) if (b.day !== dayNow) { b.day = dayNow; today.out[id] = (today.out[id] || 0) + 1; today.taken.push(b); return b; }
        return null;
      },
      // h puts on 衣 (or 笠: slot 2) b for the rest of the day (it wears with all their energy, as dressing does)
      wear(h, b, slot = 1) { const t = today.dressed; for (let i = 0; i < t.length; i += 3) if (t[i] === h) { t[i + slot] = b; return; } t.push(h, slot === 1 ? b : null, slot === 2 ? b : null); },
      // A timber for a fire: the lowest tier at least minTier in store (closed lots; 0: none), and taking one
      timberFor(minTier) { if (store.wood < 1) return 0; for (let t = Math.max(1, minTier); t <= 4; t++) if (lots.wood[t] >= 1 - 1e-9) return t; return 0; },
      takeTimber(t) { lots.wood[t] -= 1; store.wood -= 1; today.burned++; },
      untakeTimber(t) { lots.wood[t] += 1; store.wood += 1; today.burned--; },   // brought back unlit
      // Farming energy wears the tool used: a 叉 tending, a 刀 at the harvest
      farmed(tool, energy) { if (tool) tool.used += energy; },
      // work (energy spent) collected of r by h with blade b: their skill tier, and (crafts) their 刀's (none:
      // N), count by the work; the energy wears the blade
      collected(r, h, b, work, energy) {
        const f = today.fac[r];
        f.w += work; f.s += work * adjSkill(h, r); f.b += work * (b ? b.tier : 1);
        if (b) b.used += energy;
      },
      take,
      // work on a station's craft by h (energy an hour: rate); done, it takes its tier
      creditCraft(st, kind, h, rate, work) {
        const j = st.job;
        j.left -= work; j.w += work; j.s += work * adjSkill(h, kind); j.h += work * humanTier(rate); today.craftEnergy += work;
        if (j.left <= 1e-6) {   // done, but for rounding: its tier
          const tier = craftTier((j.s / j.w + j.h / j.w + j.mat) / 3, trand);
          today.done.push(j.id, tier); st.job = null;
        }
      },
    };
    return {
      startDay(day) {
        // Every sheep grows res.regrow wool a day, up to a full fleece; of each tier, sheep that came of
        // age arrive full, and sheep that died are taken from the commonest fleece
        const full = res.fleece;
        for (let t = 1; t <= 4; t++) {
          const fl = fleece[t], adultSheep = adultsOf(t, day);
          let flock = 0;
          for (let k = full - 1; k >= 0; k--) { const n = fl[k]; if (n) { fl[k] = 0; fl[Math.min(full, k + res.regrow)] += n; } }
          for (let k = 0; k <= full; k++) flock += fl[k];
          if (adultSheep > flock) fl[full] += adultSheep - flock;
          for (let lose = flock - adultSheep; lose > 0; lose--) {
            let most = 0;
            for (let k = 1; k <= full; k++) if (fl[k] > fl[most]) most = k;
            fl[most]--;
          }
        }
        dayNow = day;
        // Each sheep's wool, fullest first: a shearer to each
        const sheepWool = [];
        for (let k = full; k >= 1; k--) for (let t = 1; t <= 4; t++) for (let n = fleece[t][k]; n > 0; n--) sheepWool.push(k);
        today = { woolLeft: woolOnSheep(), sheepWool, places: { wool: sheepWool.length, stone: tiles.stone, wood: tiles.wood },
          spent: { wool: 0, stone: 0, wood: 0 }, opening: { ...store }, craftEnergy: 0, burned: 0, done: [], out: {}, worn: {}, dressed: [], taken: [],
          fac: Object.fromEntries(RESOURCES.map((r) => [r, { w: 0, s: 0, b: 0 }])) };
        return {
          craft: cr ? (pool, ops) => craftAtStations(pool, ops, cr, stations, E, may) : null,
          collect: (pool, ops) => collect(pool, ops, store, today, res, may, E),
          farmed: cr ? E.farmed : null, takeTool: cr ? E.takeTool : null, untake: E.untake,
        };
      },
      // Everyone who'll spend energy today, in village order, takes the best 衣 and the best 笠; worn(h,
      // energy) at the end of the day wears them by all the energy they spent
      dress(h) { if (cr) today.dressed.push(h, cold ? null : E.takeTool("clothes"), rainy ? null : E.takeTool("hat")); },   // with the cold, 衣 is for warmth only, and with the rain 笠 for the rain only (clothFor)
      worn(spentOf) {
        const t = today.dressed;
        for (let i = 0; i < t.length; i += 3) { const e = spentOf(t[i]); if (t[i + 1]) t[i + 1].used += e; if (t[i + 2]) t[i + 2].used += e; }
      },
      state: () => ({ today, store, stations, res, cr, takeTool: E.takeTool, untake: E.untake, clothFor: E.clothFor, wear: E.wear, timberFor: E.timberFor, takeTimber: E.takeTimber, untakeTimber: E.untakeTimber, farmed: E.farmed, collected: E.collected, canStart: E.canStart, startCraft: E.startCraft, creditCraft: E.creditCraft }),
      endDay() {
        let craftDone = 0, work = 0;
        // Crafts worn out today are gone (only those taken today were used); today's new ones join the store
        for (const b of today.taken) {
          if (b.gone || b.used < wearOf[b.id] - 1e-9) continue;
          const c = crafted[b.id];
          b.gone = true; c[0]--; c[b.tier]--; today.worn[b.id] = (today.worn[b.id] || 0) + 1;
          tools[b.id][b.tier] = tools[b.id][b.tier].filter((x) => !x.gone);
        }
        for (let i = 0; i < today.done.length; i += 2) {
          const id = today.done[i], tier = today.done[i + 1], c = crafted[id];
          c[0]++; c[tier]++; craftDone++;
          tools[id][tier].push({ id, tier, used: 0, day: 0, bonus: cr.bonus ? cr.bonus[tier] : toolBonus(tier) });
        }
        const made = {};
        for (const r of RESOURCES) {
          made[r] = FoodModel.yieldOf(energy[r], today.spent[r], res.perEnergy[r]);
          energy[r] += today.spent[r]; store[r] += made[r]; work += today.spent[r];
        }
        // The wool comes off the fullest sheep first (the higher tier first among equals); a part-shorn
        // sheep keeps growing from what's left
        let shorn = 0, sheepT = 0;
        for (let take = made.wool, k = res.fleece; take > 0 && k > 0; ) {
          let t = 4;
          while (t >= 1 && !fleece[t][k]) t--;
          if (!t) { k--; continue; }
          const n = Math.min(k, take);
          fleece[t][k]--; fleece[t][k - n]++; take -= n; shorn += n; sheepT += n * t;
        }
        // Into lots: the day's units of each resource share one factor average: its collectors' skill
        // tiers by work, the sheep's tiers by the wool shorn (or the forest's or the mine's), and from the
        // Craft page on its collectors' 刀 tiers by work (none: N)
        for (const r of RESOURCES) {
          const f = today.fac[r];
          if (made[r] <= 0 || f.w <= 0) continue;
          const place = r === "wool" ? (shorn ? sheepT / shorn : 0) : (res.tiers && res.tiers[r]) || 3;
          addUnits(r, made[r], cr ? (f.s / f.w + place + f.b / f.w) / 3 : (f.s / f.w + place) / 2);
        }
        return { resMade: made, resWork: work, craftWork: today.craftEnergy, craftDone, burned: today.burned };
      },
      // Into the day's records: the stores (and, while anyone lives, the day's totals)
      record(d, day, food) {
        d.wool[day] = store.wool; d.stone[day] = store.stone; d.wood[day] = store.wood;
        RESOURCES.forEach((r, i) => { for (let t = 1; t <= 4; t++) d.lots[i][t - 1][day] = lots[r][t]; });
        for (let t = 1; t <= 4; t++) { let n = 0; for (let k = 0; k <= res.fleece; k++) n += fleece[t][k]; d.sheepTiers[t - 1][day] = n; }
        if (cr) cr.items.forEach((it, k) => {
          d.crafts[k][day] = crafted[it.id][0];
          for (let t = 1; t <= CRAFT_MAX_TIER; t++) d.craftTiers[k][t - 1][day] = crafted[it.id][t];
          if (food && today) { d.out[k][day] = today.out[it.id] || 0; d.worn[k][day] = today.worn[it.id] || 0; }
        });
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
  // A scholar's working day, and their Intelligence at work as the advisor's IQ: the scholar adjustment
  // (shift %: more Intelligence, less Power) on top of the elder share
  function scholarDay(h, p, elderAttr, school) {
    const k = HumanModel.stage(h, p) === "elder" ? elderAttr : 1;
    return workDay(h.power * k * (1 - school.shift / 100), h.intel * k * (1 + school.shift / 100));
  }
  const scholarIQ = (h, p, elderAttr, school) =>
    Math.floor(h.intel * (HumanModel.stage(h, p) === "elder" ? elderAttr : 1) * (1 + school.shift / 100) + 1e-9);

  // The next point of Power or Intelligence at `at`: (max(100, at) − 100)² + the base cost
  const dearer = (at, base) => { const d = Math.max(100, at) - 100; return d * d + base; };
  // A child takes home `got` knowledge (h.knowBank: what's put by toward the next point); it buys
  // Intelligence one point at a time, for life (nextIntelCost: the next point's knowledge). Returns the gain.
  const nextIntelCost = (intel, school) => dearer(intel, school.knowBase);
  function learn(h, got, school) {
    h.knowledge = (h.knowledge || 0) + got; h.knowBank = (h.knowBank || 0) + got;
    let gain = 0;
    for (let cost = nextIntelCost(h.intel, school); h.knowBank >= cost - 1e-9; cost = nextIntelCost(h.intel, school)) { h.knowBank -= cost; h.intel++; gain++; }
    h.learned = (h.learned || 0) + gain;
    return gain;
  }
  // One day of one scholar's class, at the house. The scholar works through their day teaching whenever a child is
  // in class and writing poetry otherwise; a child is in class from when they're free (h.from, hours
  // after waking; their food work comes first) except at lunch, and spends their spare energy (h.spare)
  // only while the scholar teaches. Over the hours both are there, the child takes home
  // effectiveness × min(scholar's rate, child's rate) × hours ÷ the children in the class knowledge (fractions
  // kept): the smaller of the two's energy spent, shared out. People wake at different times, so with a schedule (S) the hours are the average over
  // the difference in their wake-up times (sharedHours); without one, both start together.
  // `spent`: the scholar's energy that took (the longest lesson); the rest goes to poetry. used: each
  // child's own energy spent in class (their energy an hour × the hours). eff: the scholar's
  // effectiveness at teaching (Resources), 1 without: knowledge × it.
  function teach(scholar, kids, p, elderAttr, school, S, eff = 1) {
    const sc = scholarDay(scholar, p, elderAttr, school), rate = sc.rate;
    const sTime = rate > 0 ? sc.energy / rate : 0;
    const taught = S ? workSpans(sTime, S) : null;
    const used = new Map();
    let knowledge = 0, gained = 0, lesson = 0;
    for (const h of kids) {
      const full = workDay(h.power, h.intel);
      const kEnergy = h.spare !== undefined ? h.spare : full.energy;
      const kTime = full.rate > 0 ? kEnergy / full.rate : 0;
      const t = S ? sharedHours(taught, classSpans(h.from !== undefined ? h.from : S.meal, S), kTime, S) : Math.min(kTime, sTime);
      const got = (school.knowPerEnergy * eff * Math.min(rate, full.rate) * t) / kids.length;
      gained += learn(h, got, school);
      knowledge += got;
      lesson = Math.max(lesson, t);
      used.set(h, full.rate * t);
    }
    return { knowledge, gained, hours: lesson, spent: Math.min(sc.energy, rate * lesson), energy: sc.energy, used };
  }
  // The scholar writes poetry (吟詩) with the energy they didn't spend teaching: knowPerEnergy knowledge per
  // energy (× their effectiveness at poetry, eff). It doesn't change their Intelligence.
  function read(scholar, energy, school, eff = 1) {
    const got = Math.floor(energy * school.knowPerEnergy * eff + 1e-9);
    scholar.read = (scholar.read || 0) + got;
    return { read: got };
  }

  // ---------- Inheritance ----------
  // Newborns are born with Power ih.bornPower (BORN_POWER without; h.basePower: the Power they were
  // born with), and Intelligence share × the average of a random adult man and woman's, give or take the
  // variation, rounded down. Milk goes to the
  // children first: whatever milk a child drinks above their need is extra milk, and it buys Power as it
  // comes (h.milkBank: what's put by toward the next point), one point at a time, for good. The food a
  // child goes without takes Power away, 1 point for every HUNGER_FOOD of it (h.hungerBank: toward the
  // next), even below what they were born with. Anyone who came of age today gains the bonus in both;
  // what's left in their banks is lost.
  // Extra milk buys Power one point at a time (nextPointCost: the next point's milk); powerFromFood: the
  // Power a lump of it buys, for the pages' hints.
  const HUNGER_FOOD = 100, BORN_POWER = 70;
  const nextPointCost = (power, ih) => dearer(power, ih.powerBase);
  function powerFromFood(power, food, ih) {
    let gained = 0;
    for (;;) {
      const cost = nextPointCost(power + gained, ih);
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
        h.power = h.basePower = ih.bornPower ?? BORN_POWER;
        h.intel = dad && mum ? born(dad.intel, mum.intel) : attrs.intel;
        h.grown = false; h.milkBank = 0; h.hungerBank = 0; h.knowledge = 0; h.knowBank = 0; h.learned = 0;
      } else if (!h.grown && h.age >= p.M) {
        h.grown = true;
        h.power += ih.grow; h.intel += ih.grow;
        h.milkBank = 0; h.hungerBank = 0;
      }
    }
  }

  // ---------- Happiness ----------
  // Happiness, 0 to 100: a base from Intelligence, 100 − ⌊Intelligence ÷ iqStep⌋, plus ⌊√(the energy
  // someone left unspent at the end of their last day)⌋ (h.joy): it changes at night,
  // in time for that night's births, and stays through the next day. Each person's own chance of a child is
  // p × happiness ÷ 50 (p, the Humans page's chance, at happiness 50), and a couple's is the average of
  // the two partners'.
  const MAX_HAPPY = 100, MID_HAPPY = 50;
  const baseHappiness = (intel, hp) => Math.min(MAX_HAPPY, Math.max(0, MAX_HAPPY - Math.floor(intel / hp.iqStep + 1e-9)));
  // (each person's base is kept until their Intelligence changes)
  const happinessOf = (h, hp) => {
    if (h.baseFor !== h.intel || h.baseHp !== hp) { h.baseFor = h.intel; h.baseHp = hp; h.base = baseHappiness(h.intel, hp); }
    return Math.min(MAX_HAPPY, h.base + (h.joy || 0));
  };
  const birthChance = (happy, p) => (p.p * happy) / MID_HAPPY;
  // The happiness a day's energy left unspent adds tomorrow
  const joyOf = (left) => Math.floor(Math.sqrt(Math.max(0, left)) + 1e-9);

  // ---------- Skills ----------
  // Everyone has a level, 0 to MAX_LEVEL, at each skill, from the exp they've earned at it: 1 exp for
  // each energy spent on that job (fractions kept). Going from level L to L + 1 takes exp[L] more exp
  // (100, 1,000, 10,000, 100,000: level 4 at 111,100 in all). At level L ≥ 1 each energy there brings in
  // 1 + bonus[L − 1]% (by default +5%, +10%, +20%, +40%): more milk, rice from the same field (tending), wool
  // from the same sheep, more timber, stone, knowledge or poetry; at the harvest and at crafts, it's
  // done that much faster. Levels go up at the
  // end of the day, for the next day's work. Skills aren't passed on: the born start at level 0.
  const SKILLS = [
    { id: "milk", zh: "採牛奶", en: "Milking" }, { id: "farm", zh: "耕田", en: "Farming" },
    { id: "wood", zh: "伐木", en: "Woodcutting" }, { id: "weave", zh: "紡織", en: "Weaving" },
    { id: "forge", zh: "鍛造", en: "Forging" }, { id: "wool", zh: "採羊毛", en: "Shearing" },
    { id: "stone", zh: "採石", en: "Quarrying" }, { id: "teach", zh: "教育", en: "Teaching" },
    { id: "poetry", zh: "吟詩", en: "Poetry" },
  ];
  const MAX_LEVEL = 4;
  // The exp a level ends at: level L + 1 starts at exp[0] + … + exp[L] (none past the top)
  function nextAt(level, sk) {
    if (level >= MAX_LEVEL) return Infinity;
    let at = 0;
    for (let k = 0; k <= level; k++) at += sk.exp[k];
    return at;
  }
  // The level a skill's exp reaches
  function levelOf(exp, sk) {
    let level = 0;
    while (level < MAX_LEVEL && exp >= nextAt(level, sk) - 1e-9) level++;
    return level;
  }
  const effAt = (level, sk) => 1 + (level > 0 ? sk.bonus[level - 1] : 0) / 100;
  const SKILL_IX = Object.fromEntries(SKILLS.map(({ id }, k) => [id, k]));
  // A person's skills, by skill id: exp, level, effectiveness, and the exp the next level comes at
  function newSkills(h, sk) {
    h.exp = {}; h.level = {}; h.eff = {}; h.next = {}; h.xp = new Float64Array(SKILLS.length);   // xp: the day's energy by skill (assignEnergy)
    for (const { id } of SKILLS) { h.exp[id] = 0; h.level[id] = 0; h.eff[id] = 1; h.next[id] = nextAt(0, sk); }
  }
  // A day's energy spent on each skill (spent[k]: SKILLS[k]) goes into exp; levels go up with it
  function earn(h, spent, sk) {
    for (let k = 0; k < SKILLS.length; k++) {
      if (!(spent[k] > 0)) continue;
      const id = SKILLS[k].id, exp = (h.exp[id] += spent[k]);
      if (exp < h.next[id] - 1e-9) continue;
      const level = levelOf(exp, sk);
      h.level[id] = level; h.eff[id] = effAt(level, sk); h.next[id] = nextAt(level, sk);
    }
  }
  // Micro mode's energy spent by job, as spent by skill
  const SKILL_JOB = { milk: "milk", farm: "field", wood: "wood", weave: "weave", forge: "forge", wool: "wool", stone: "stone", teach: "teach", poetry: "poetry" };
  const bySkill = (spent) => { const out = new Float64Array(SKILLS.length); for (let k = 0; k < SKILLS.length; k++) out[k] = spent[SKILL_JOB[SKILLS[k].id]] || 0; return out; };

  // ---------- One village ----------
  // Everything the village pages keep on a person, set up front in one order when they join the village
  // (the start, or birth), so every person has the same shape (quicker for the browser). Undefined or
  // null means not yet: Power and Intelligence come at the start or birth (inheritAttrs), skills on the
  // first day (newSkills).
  function prepare(h) {
    h.power = undefined; h.intel = undefined; h.grown = undefined; h.milkBank = 0; h.hungerBank = 0; h.knowledge = 0; h.knowBank = 0; h.learned = 0;
    h.read = 0; h.spare = undefined; h.from = undefined; h.role = undefined;
    h.joy = 0; h.joyNext = 0; h.partner = null; h.baseFor = undefined; h.baseHp = null; h.base = 0;
    h.exp = null; h.level = null; h.eff = null; h.next = null; h.xp = null;
  }

  function run(cfg) {
    const { F, UP, US, cowAdults, work, inherit, school, detailed } = cfg;
    const herd = { adults: cowAdults };   // the cows (Herd)
    const none = work === "none", energy = work === "energy";
    const HARVEST_LAST = harvestLastOf(work), HARVEST_DAYS = HARVEST_LAST - HARVEST_FIRST + 1;
    const isHarvest = (doy) => doy >= HARVEST_FIRST && doy <= HARVEST_LAST;
    const attrs = cfg.attrs || { power: 100, intel: 100 }, elderAttr = cfg.elderAttr ?? 1;
    const fieldE = FoodModel.fieldEnergyOf(F);
    const S = none ? null : cfg.travel || null;   // the day and the walking
    const micro = cfg.mode === "micro" && !!S && !none;
    // The Clothing page's cold: this village's weather, on its own dice (with a schedule, Macro or Micro);
    // and its rain, the same weather hour by hour
    const sched = !!S && !none;
    const cold = sched && cfg.cold && window.WeatherModel ? cfg.cold : null;
    const rain = sched && cfg.rain && window.WeatherModel ? cfg.rain : null, wx = cold || rain;
    // The Watering page: the well and each field's water (0–10), the fields tended this year, and the rice
    // the water grew this year. Each day the well refills (worked out after the day): from the ground at
    // the land's water level ÷ 2 an hour while it holds under water.ground, and from the rain at its
    // rainfall an hour up to water.cap. A field nobody tended today takes the land's level; each seeded
    // field (tended this year, before the harvest) grows water.growth[its level, rounded down] rice.
    const waterCfg = sched && cfg.water && wx ? cfg.water : null;
    const waterSt = waterCfg ? { well: waterCfg.cap, level: [5, 5, 5, 5], farmed: [false, false, false, false], seeded: [false, false, false, false], started: false } : null;
    let waterRice = 0;
    // The day's end for the water: untended fields take the land's level, seeded ones grow, and the well
    // refills over the day (the ground's share while under water.ground, worked out between the rain's changes)
    function endWaterDay(dw, wd, tending) {
      const st = waterSt, land = Math.max(0, Math.min(10, wd.water ?? 5)), g = land / 2, cap = waterCfg.cap, ground = Math.min(cap, waterCfg.ground), ra = wd.rainAt || [0, 0];
      let grew = 0;
      for (let k = 0; k < st.level.length; k++) {
        if (!st.farmed[k]) st.level[k] = land;
        if (tending && st.seeded[k]) grew += waterCfg.growth[Math.min(10, Math.floor(st.level[k] + 1e-9))];
      }
      waterRice += grew;
      let well = st.well;
      for (let i = 0; i < ra.length; i += 2) {
        let dt = (i + 2 < ra.length ? ra[i + 2] : 24) - ra[i];
        const r = ra[i + 1];
        if (well < ground && g + r > 0) { const t = Math.min(dt, (ground - well) / (g + r)); well += (g + r) * t; dt -= t; }
        if (dt > 0 && r > 0 && well < cap) well = Math.min(cap, well + r * dt);
      }
      st.well = Math.min(cap, well);
      return { grew, trips: dw.day.trips, river: dw.day.river, well: st.well, level: st.level.reduce((a, b) => a + b, 0) / st.level.length, land };
    }
    const wdays = wx ? WeatherModel.simulateYear(wx.sets, (cfg.seed ^ 0x2c1b3c6d) >>> 0, wx.stats, Math.ceil(Math.min(T, cfg.stopAfter || T) / YEAR), undefined, !!rain) : null;
    const roles = cfg.roles || RolesModel.DEFAULTS;
    const roleOf = (h) => { const st = HumanModel.stage(h, p); return st === "child" ? "child" : st === "elder" ? (h.sex === MALE ? "oldMan" : "oldWoman") : h.sex === MALE ? "man" : "woman"; };
    // may(h, job[, role]): whether a person (or a role) may do a job; h.role is set at the start of each day
    const may = (h, jobId, role) => !!roles[role || h.role][jobId];

    // Separate dice for the village, the advisor, the birth draws and Micro mode's wake-up times, so
    // each policy faces the same luck
    const rand = HerdModel.rng(cfg.seed);
    const arand = HerdModel.rng((cfg.seed ^ 0x5bd1e995) >>> 0);
    const irand = HerdModel.rng((cfg.seed ^ 0x2545f491) >>> 0);
    const mrand = HerdModel.rng((cfg.seed ^ 0x3c6ef372) >>> 0);
    const hrand = HerdModel.rng((cfg.seed ^ 0x1b873593) >>> 0);   // the Happiness page's pairing
    const crand = HerdModel.rng((cfg.seed ^ 0x4f1bbcdc) >>> 0);   // who goes to which scholar's class
    const gauss = () => Math.sqrt(-2 * Math.log(1 - arand())) * Math.cos(2 * Math.PI * arand());
    const scholarAdvises = cfg.advisor === "scholar";
    const sigma = cfg.advisor == null || scholarAdvises ? 0 : iqError(cfg.advisor);
    let lean = gauss();   // the advisor's lasting lean, in units of their error
    const bias = sigma * lean;

    // Same human parameters, but the food shared out each day is what's eaten from the stores, and
    // elders eat with the elder penalty (or the default share before the Attribute page)
    const p = { ...UP, F: 0, elderFood: cfg.elderAttr ?? HumanModel.ELDER_FOOD };
    const st = HumanModel.startPeople(US.men, US.women, p, rand);
    for (const h of st.people) prepare(h);
    if (energy) for (const h of st.people) { h.power = attrs.power; h.intel = attrs.intel; h.grown = true; }
    const stores = FoodModel.newStores(F);
    // Running totals of what's in store (food is whole, so they stay exact); the starting food never spoils
    let milkStored = 0, riceStored = 0;
    const order = fullOrder(cfg.priority || DEFAULT_ORDER);
    const en = new Map(), rt = new Map();   // each person's energy for the day, and energy an hour
    // The Resources page's sheep, stores and crafts (and every page after it)
    const res = energy ? cfg.resources || null : null;
    const econ = res ? makeEconomy(res, cfg.craft || null, cfg.sheepAdults, cfg.sheepTiers || null, may, HerdModel.rng((cfg.seed + HerdModel.TIER_SALT) >>> 0),
      { ...CREW, ...(res.crew || {}) }, !!cold, !!rain, cfg.kit || null) : null;
    // The Happiness page: each person's happiness sets their chance of a child
    const joy = energy ? cfg.happiness || null : null;
    let couples = [], chanceToday = 0;   // couples, [man, woman] in the order they paired, and the sum of tonight's chances
    // Skills (the Resources page on): everyone gets more out of the work they've done most
    const skills = energy ? cfg.skills || null : null;
    const eff = skills ? (h, id) => h.eff[id] : null;
    // The night's fertile couples (after the deaths), as each one's chance of conceiving and the woman (only
    // those whose woman can conceive: HumanModel.canConceive). Couples last for
    // life: one ends only when a partner dies, and the other is single again. Then the adult men and
    // women without a partner pair up at random, as many as the smaller group. A couple stays together
    // when a partner becomes an elder, but only couples of two adults can have a child.
    function chancesOf(people) {
      const alive = new Set(people), adult = (h) => HumanModel.stage(h, p) === "adult";
      couples = couples.filter(([m, f]) => { const keep = alive.has(m) && alive.has(f); if (!keep) { m.partner = null; f.partner = null; } return keep; });
      const men = [], women = [];
      for (const h of people) if (!h.partner && adult(h)) (h.sex === MALE ? men : women).push(h);
      for (const g of [men, women]) for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(hrand() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
      for (let i = 0; i < Math.min(men.length, women.length); i++) { men[i].partner = women[i]; women[i].partner = men[i]; couples.push([men[i], women[i]]); }
      const out = [];
      for (const [m, f] of couples) if (adult(m) && adult(f) && HumanModel.canConceive(f, p)) out.push([(birthChance(happinessOf(m, joy), p) + birthChance(happinessOf(f, joy), p)) / 2, f]);
      chanceToday = out.reduce((a, [c]) => a + c, 0);
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
      share: nan(), shareKids: nan(), iq: nan(),                                     // the ration asked for (grown-ups', children's, of need) and the advisor's IQ
      adults: i32(), farm: i32(), milkers: i32(), kidsWork: i32(), cows: i32(), walk: f32(),   // work
      crop: f32(), field: f32(), riceLost: f32(), milkWork: f32(), farmWork: f32(),
      hunger: f32(),                                                                 // days of life lost to hunger, everyone together
      cold: f32(), coldHours: f32(), coldCut: f32(), fires: i32(), burned: i32(), tempLo: nan(), tempHi: nan(),   // the cold: days of life lost to it, hours in hypothermia, fires lit, timber burned, the day's low and high
      heavy: f32(), rainIn: f32(), rainLost: f32(), outWork: f32(), hats: i32(),
      well: nan(), fieldWater: nan(), land: nan(), waterRice: f32(), trips: i32(), riverTrips: i32(),   // the water: the well's at day's end, the fields' average, the land's, rice the water grew, water carried   // the rain: its hours at the limit or more, everyone's hours in from it, the work out of the house it took and what was done, 笠 put on
      pow: f32(), int: f32(), extra: f32(),                                          // adults' attributes, children's extra food
      taught: f32(), gained: i32(), kids: i32(), picked: i32(), lesson: f32(), schPow: nan(), schInt: nan(), scholars: i32(),   // school
      read: f32(),                                                // the scholar's reading
      wool: f32(), stone: f32(), wood: f32(), woolMade: f32(), stoneMade: f32(), woodMade: f32(), resWork: f32(), woolOnSheep: i32(),   // resources
      lots: res ? RESOURCES.map(() => [f32(), f32(), f32(), f32()]) : null, sheepTiers: res ? [i32(), i32(), i32(), i32()] : null,   // wool, timber, stone in closed lots by tier; adult sheep by tier
      crafts: cfg.craft ? cfg.craft.items.map(() => i32()) : null, craftWork: f32(), craftDone: i32(), crafting: i32(),   // crafts in store, energy, finished, under way
      craftTiers: cfg.craft ? cfg.craft.items.map(() => Array.from({ length: CRAFT_MAX_TIER }, i32)) : null,   // crafts in store by tier
      out: cfg.craft ? cfg.craft.items.map(i32) : null, worn: cfg.craft ? cfg.craft.items.map(i32) : null,   // crafts in use, and worn out, each day
      happy: nan(), happyKids: nan(), chance: f32(), joyAdults: nan(), happyNight: nan(), pairs: i32(),   // happiness: adults' and children's by day, fertile couples' chances together, adults' from energy left, adults' at night; all couples
      skillAvg: skills ? SKILLS.map(nan) : null, skillTop: skills ? SKILLS.map(i32) : null, skillExp: skills ? SKILLS.map(f32) : null,   // skills: grown-ups' average level, the highest anyone has, exp earned that day
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
      if (ev) { d.born[day] = ev.born; d.died[day] = ev.died; d.hungry[day] = ev.hungry; d.ration[day] = ev.ration; d.hunger[day] = (ev.lostAll || 0) - (food.coldLost || 0); }
      else { const need = HumanModel.foodNeed(st.people, p); d.ration[day] = need > 0 ? Math.min(1, food.milkMade / need) : Infinity; }
      d.made[day] = food.milkMade; d.drank[day] = food.milkEaten; d.spoiled[day] = food.milkSpoiled;
      d.riceMade[day] = food.riceMade; d.riceEaten[day] = food.riceEaten; d.riceSpoiled[day] = food.riceSpoiled;
      d.stored[day] = milkStored; d.riceStored[day] = riceStored;
      d.foodEaten[day] = food.foodEaten || 0; d.foodStored[day] = stores.food;
      if (food.share !== undefined) { d.share[day] = food.share; d.shareKids[day] = food.shareKids; d.iq[day] = food.iq; }
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
      if (food.wd) {
        d.cold[day] = food.coldLost || 0; d.coldHours[day] = food.coldHours || 0; d.coldCut[day] = food.coldCut || 0; d.fires[day] = food.fires || 0; d.burned[day] = food.burned || 0;
        d.tempLo[day] = food.wd.temp - food.wd.swing / 2; d.tempHi[day] = food.wd.temp + food.wd.swing / 2;
        if (food.waterDay) { const w = food.waterDay; d.well[day] = w.well; d.fieldWater[day] = w.level; d.land[day] = w.land; d.waterRice[day] = w.grew; d.trips[day] = w.trips; d.riverTrips[day] = w.river; }
        if (food.wet) {
          const a = food.wd.rainAt;
          let hv = 0;
          for (let i = 0; i < a.length; i += 2) if (a[i + 1] >= food.wet.limit) hv += (i + 2 < a.length ? a[i + 2] : 24) - a[i];
          d.heavy[day] = hv; d.rainIn[day] = food.wet.inH; d.rainLost[day] = food.wet.lost; d.outWork[day] = food.wet.outWork; d.hats[day] = food.wet.hats;
        }
      }
      if (school) {
        d.taught[day] = food.taught || 0; d.gained[day] = food.gained || 0; d.kids[day] = food.kids || 0;
        d.picked[day] = food.picked || 0; d.lesson[day] = food.lesson || 0; d.read[day] = food.read || 0;
        if (food.scholar) { d.schPow[day] = food.scholar.power; d.schInt[day] = food.scholar.intel; }
        d.scholars[day] = food.scholars || 0;
      }
      if (econ) econ.record(d, day, food);
      if (skills && ev) {
        let n = 0;
        const sum = new Float64Array(SKILLS.length), top = new Int32Array(SKILLS.length);
        for (const h of st.people) {
          if (!h.level) continue;
          const grown = HumanModel.stage(h, p) !== "child";
          if (grown) n++;
          for (let k = 0; k < SKILLS.length; k++) { const lv = h.level[SKILLS[k].id]; if (grown) sum[k] += lv; if (lv > top[k]) top[k] = lv; }
        }
        for (let k = 0; k < SKILLS.length; k++) { d.skillAvg[k][day] = n ? sum[k] / n : NaN; d.skillTop[k][day] = top[k]; d.skillExp[k][day] = food.exp[k]; }
      }
      if (joy && ev) { d.happy[day] = food.happy; d.happyKids[day] = food.happyKids; d.chance[day] = food.chance; d.joyAdults[day] = food.joyAdults; d.happyNight[day] = food.happyNight; d.couples[day] = ev.couples; d.pairs[day] = food.pairs; }
      d.snaps[day] = snap();
    };

    const c0 = HumanModel.census(st.people, p);
    record(0, null, {
      milkMade: none ? milkGiven(F, herd, 0) : 0,
      milkEaten: 0, milkSpoiled: 0, riceMade: 0, riceEaten: 0, riceSpoiled: 0,
      adults: c0.men + c0.women + c0.elders, farm: 0, milkers: 0, cows: cowAdults[0], crop: 0, field: 0, riceLost: 0,
    });

    let last = T, capped = false, extinctDay = st.people.length ? null : 0;
    let milkEnergy = 0;   // energy spent milking so far, so milk fractions carry over
    let tended = 0, tendEnergy = 0, field = 0;   // this year's tending (share of the most), its energy, and ripe rice standing
    // scholars: in the order appointed; scholar: the one who advises (the highest Intelligence, first
    // appointed on a tie); lastAdvisor: the scholar who last advised
    let scholars = [], scholar = null, lastAdvisor = null;
    const stopAt = cfg.stopAfter || T;   // Micro mode's day viewer stops after the day it shows
    // The whole run's totals, kept even without the day-by-day records (Micro mode's comparison).
    // pow, int: the adults' average, summed over the last year's days with adults (attrDays)
    // level: the grown-ups' average level over every skill, summed over the last year's days with grown-ups (levelDays)
    const tally = { peopleDays: 0, milk: 0, rice: 0, hunger: 0, cold: 0, coldHours: 0, coldCut: 0, fires: 0, rainIn: 0, rainLost: 0, outWork: 0, hats: 0, waterRice: 0, trips: 0, riverTrips: 0, walk: 0, wool: 0, stone: 0, crafts: 0, taught: 0, gained: 0, pow: 0, int: 0, attrDays: 0, born: 0, happy: 0, happyDays: 0, level: 0, levelDays: 0 };

    for (let day = 1; day <= stopAt; day++) {
      if (extinctDay !== null) {   // nobody left: the cows go unmilked and the rice untended
        if (d) {
          d.snaps[day] = new Int32Array(0);
          if (none) d.made[day] = milkGiven(F, herd, day - 1); else d.cows[day] = cowAdults[day - 1];
          if (econ) econ.record(d, day, null);   // what was gathered stays in store
        }
        continue;
      }
      // 1. Stored food ages a day; anything past its keeping time spoils
      const { milkSpoiled, riceSpoiled } = FoodModel.ageStores(stores);
      milkStored -= milkSpoiled; riceStored -= riceSpoiled;
      const doy = dayOfYear(day), cows = cowAdults[day - 1];
      let milkSpent, riceMade = 0, riceLost = 0, crop = 0, grownUps = 0, farmers = false;
      let w = { farm: 0, milkers: 0, farmWork: 0 }, lesson = { knowledge: 0, gained: 0, hours: 0 }, reading = { read: 0 }, kidCount = 0, picked = 0, made = {};
      // Each person's timeline for hunger ({ Lh, E }); the day's exp, everyone together, by skill
      let timelines = null, walk = 0, trace = null, chill = null, wet = null, waterDay = null;   // chill: the day's cold (Micro, Clothing); wet: its rain
      const expToday = new Float64Array(SKILLS.length);
      const gain = (h, spent) => { earn(h, spent, skills); for (let k = 0; k < SKILLS.length; k++) if (spent[k] > 0) expToday[k] += spent[k]; };

      if (none) {
        // 2. Nobody works: each adult cow gives a standard day's milk; the year's rice comes in evenly
        milkSpent = milkGiven(F, herd, day - 1) / F.milkPerEnergy;
        const c = HumanModel.census(st.people, p);
        farmers = c.men + c.women > 0;
        if (isHarvest(doy) && farmers) riceMade = FoodModel.spread(F.riceYear, HARVEST_DAYS, doy - HARVEST_FIRST + 1);
      } else {
        // 2. Scholars step down at elder age or death; new ones are appointed only if the village can
        //    spare them. Then the grown-ups (and children, if needed) go to work.
        for (const h of st.people) {
          h.role = roleOf(h);   // the jobs table's row for the day
          if (skills && !h.exp) newSkills(h, skills);   // the born, and day 1: level 0 at everything
        }
        if (school) {
          scholars = scholars.filter((s) => s.age < s.life && HumanModel.stage(s, p) !== "elder");
          // One for each child who may go to class (at least one, to advise on food), at most
          // school.most (1 without), the highest Intelligence first, while the village can spare them
          let children = 0;
          if (may(null, "teach", "child")) for (const h of st.people) if (HumanModel.stage(h, p) === "child") children++;
          const want = Math.min(school.most ?? 1, Math.max(1, children));
          while (scholars.length < want) {
            const cand = pickScholar(st.people, p, scholars);
            if (!cand || !canSpare([...scholars, cand], st.people, p, cows)) break;
            scholars.push(cand); picked++;
          }
          scholar = null;
          for (const s of scholars) if (!scholar || s.intel > scholar.intel) scholar = s;
        }
        const isScholar = new Set(scholars);
        if (doy === 1) { tended = 0; tendEnergy = 0; waterRice = 0; if (waterSt) waterSt.seeded.fill(false); }
        if (doy === HARVEST_FIRST) field = Math.max(0, FoodModel.wholeFood(tendEnergy, F.ricePerEnergy) + Math.round(waterRice));
        const tending = doy < HARVEST_FIRST;
        const riceWanted = tending ? FULL_CREW : doy > HARVEST_LAST ? 0 : Math.min(FULL_CREW, field / HARVEST_PER_HAND);
        if (cfg.traceDay === day) trace = cfg.trace = {};
        const adults = [], elders = [], kids = [];
        en.clear();
        for (const h of st.people) {
          if (h.power === undefined) { h.power = attrs.power; h.intel = attrs.intel; }   // born with attrs, without inheritance
          h.spare = undefined; h.from = undefined;
          const stage = HumanModel.stage(h, p);
          if (isScholar.has(h)) continue;   // scholars only teach
          const k = stage === "elder" ? elderAttr : 1, wd = workDay(h.power * k, h.intel * k);
          en.set(h, wd.energy); rt.set(h, wd.rate);
          if (stage === "child") { kids.push(h); continue; }
          (stage === "adult" ? adults : elders).push(h);
        }
        grownUps = adults.length + elders.length;
        // The Resources page's jobs take their place in the day's order; everyone with energy dresses
        const extra = econ ? econ.startDay(day) : null;
        if (econ) for (const h of st.people) if (isScholar.has(h) || en.get(h) > 0) econ.dress(h);
        // Class today: the scholars who teach before poetry (by their row of the Jobs table), and the
        // children who may go, split as evenly as can be among them at random (classOf: each child's scholar)
        const rowOf = (s) => (s.sex === MALE ? "scholarM" : "scholarF");
        const teachers = scholars.filter((s) => may(null, "teach", rowOf(s)) && teachesFirst(order, may(null, "read", rowOf(s))));
        // classes: each teacher's children, in village order
        const classOf = new Map(), classes = new Map(teachers.map((s) => [s, []]));
        if (teachers.length && may(null, "teach", "child")) {
          shuffle(kids.slice(), crand).forEach((h, i) => classOf.set(h, teachers[i % teachers.length]));
          for (const h of kids) classes.get(classOf.get(h)).push(h);
        }
        const classToday = classOf.size > 0;
        // The day's cold and rain (the Clothing page), hour by hour. A day whose coldest hour (temp − swing ÷ 2)
        // isn't below 0 has no cold to feel, so none is worked out (but for a day being watched)
        const wd = wdays ? wdays[day - 1] : null;
        const dayCold = cold && (wd.temp - wd.swing / 2 < 0 || trace) ? { ...cold, tempAt: (h) => WeatherModel.hourTemp(wd.temp, wd.swing, h) } : null;
        const dayWater = waterSt ? DayModel.wateringOf(waterCfg, waterSt, S) : null;
        if (waterSt && !waterSt.started) { waterSt.level.fill(Math.max(0, Math.min(10, wd.water ?? 5))); waterSt.started = true; }   // day 1: the land's
        if (waterSt) waterSt.farmed.fill(false);
        const dayRain = rain ? { hatStep: rain.hatStep, limit: rain.limit, at: (h) => WeatherModel.rainAtHour(wd.rainAt, h), fireOut: (t0, hours) => WeatherModel.fireOut(wd.rainAt, t0, hours) } : null;
        if (micro) {
          const m = MicroModel.day({ S, rand: mrand, people: st.people, p, may, cows, fieldE, riceWanted, tending, order, trace,
            happyOf: joy ? (h) => happinessOf(h, joy) : null, eff, levelsOf: skills ? (h) => h.level : null,
            energyOf: (h) => (en.has(h) ? { e: en.get(h), r: rt.get(h) } : null),
            econ: econ ? econ.state() : null, cold: dayCold, rain: dayRain, water: dayWater,
            school: scholars.length ? { scholars: scholars.map((s) => ({ h: s, day: scholarDay(s, p, elderAttr, school), reads: may(null, "read", rowOf(s)) })), classOf, params: school, learn, read } : null });
          w = m.work; timelines = m.timelines; walk = m.walk; if (m.cold) chill = m; if (m.wet) wet = { ...m.wet, limit: rain.limit };   // chill: m.cold, coldHours, coldCut, fires
          if (scholars.length) { lesson = m.lesson; reading = m.reading; kidCount = m.pupils; }
          if (joy) for (const h of st.people) h.joyNext = joyOf(m.left.get(h) || 0, joy);
          if (skills) for (const [h, sp] of m.spent) gain(h, bySkill(sp));
          if (econ) econ.worn((h) => { const sp = m.spent.get(h); let e = 0; if (sp) for (const k in sp) e += sp[k]; return e; });
        } else {
          const clocks = new Map(), Sd = S || NO_MAP;
          const scholarSpent = new Map();
          const helpers = kids.slice().sort((a, b) => en.get(b) - en.get(a));   // strongest children first
          // With a schedule, grown-ups come to the day's jobs in the order they wake: a new order each day
          const grown = [...elders, ...adults];
          if (S) shuffle(grown, mrand);
          const weather = dayCold || dayRain || dayWater ? macroWeather(dayCold, dayRain, econ ? econ.state() : null, S, p, dayWater) : null;
          w = assignEnergy(grown, cows, riceWanted, tending, helpers, en, fieldE, Sd, rt, may, order, extra, clocks, classToday, eff, weather);
          timelines = new Map();
          for (const [h, c] of clocks) {
            const inside = c.wx ? c.wx.end(c) : null, tl = dayEnd(c, Sd, c.spent);
            if (inside) tl.inside = inside;
            timelines.set(h, tl); walk += c.walked; if (skills) gain(h, c.exp);
          }
          if (weather) { if (weather.chill) chill = weather.chill; if (weather.wet) wet = { ...weather.wet, limit: rain.limit }; }
          // Each scholar teaches their class, if they have one, and writes poetry with the rest
          if (scholars.length) lesson = { knowledge: 0, gained: 0, hours: 0, used: new Map() };
          for (const s of scholars) {
            const pupils = classes.get(s) || [], sd = scholarDay(s, p, elderAttr, school);
            let left = sd.energy;
            if (pupils.length) {
              const l = teach(s, pupils, p, elderAttr, school, Sd, skills ? s.eff.teach : 1);
              lesson.knowledge += l.knowledge; lesson.gained += l.gained; lesson.hours = Math.max(lesson.hours, l.hours);
              for (const [h, u] of l.used) lesson.used.set(h, u);
              left = l.energy - l.spent; kidCount += pupils.length;
            }
            const reads = left > 0 && may(null, "read", rowOf(s)), taught = sd.energy - left;
            if (reads) reading.read += read(s, left, school, skills ? s.eff.poetry : 1).read;
            // Their day at the house: teaching and poetry, a unit at a time like anyone's work
            const cl = newClock(Sd);
            workAt(cl, "H", reads ? sd.energy : taught, sd.rate, Sd, false);
            timelines.set(s, dayEnd(cl, Sd, reads || left <= 1e-9));
            if (skills) gain(s, bySkill({ teach: taught, poetry: reads ? left : 0 }));
            scholarSpent.set(s, reads ? sd.energy : taught);
            if (joy) s.joyNext = joyOf(reads ? 0 : left, joy);
          }
          // Energy left unspent: after the day's jobs, less a child's time in class
          const leftOf = (h, cl) => cl.left - ((lesson.used && lesson.used.get(h)) || 0);
          if (joy) for (const [h, cl] of clocks) h.joyNext = joyOf(leftOf(h, cl), joy);
          if (econ) {
            econ.worn((h) => (scholarSpent.has(h) ? scholarSpent.get(h) : clocks.has(h) ? en.get(h) - leftOf(h, clocks.get(h)) : 0));
          }
        }
        if (econ) made = econ.endDay();
        if (waterSt) waterDay = endWaterDay(dayWater, wd, tending);
        if (tending) { tended += w.tendBase / (FULL_CREW * fieldE); tendEnergy += w.tendEnergy; }
        milkSpent = w.milkEnergy;
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

      // 4. The day's ration, as shares of need for the grown-ups and the children. The advisor plans the
      //    day's food: food in store plus what's still to come before the next harvest, spread over the
      //    days until then, with an error that shrinks with IQ (a lean plus a wobble), but never less than
      //    the food that would spoil tonight (the oldest milk and rice in store). Short of everyone's
      //    need, all get the same share; past it, the children get all the extra food it
      //    plans out of the milk and rice (planOwn), split evenly (Inheritance): the starting food doesn't count as
      //    extra food. Or the player sets both shares (cfg.shares).
      const need = HumanModel.foodNeed(st.people, p);
      const kidCountNow = st.people.reduce((n, h) => n + (h.age < p.M ? 1 : 0), 0), kidNeed = kidCountNow * p.c * HumanModel.CHILD_FOOD, grownNeed = need - kidNeed;

      let plan = need, planOwn = need, advIQ = cfg.advisor;
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
        plan = (supply / horizon) * Math.exp(err);
        planOwn = ((supply - stores.food) / horizon) * Math.exp(err);
        const spoils = stores.milk[stores.milk.length - 1] + stores.rice[stores.rice.length - 1];   // eaten today or lost
        plan = Math.max(plan, spoils); planOwn = Math.max(planOwn, spoils);
      }
      let gGrown = 1, gKids = 1;   // shares of need asked for (children's above 1: extra food)
      const rationed = !!cfg.shares || advIQ != null;
      if (cfg.shares) {
        gGrown = cfg.shares.grown;
        gKids = kidNeed > 0 ? (inherit ? cfg.shares.kids : Math.min(1, cfg.shares.kids)) : 0;
      } else if (advIQ != null && need > 0) {
        gGrown = gKids = Math.min(1, plan / need);
        if (inherit && planOwn > need && kidNeed > 0) gKids = 1 + (planOwn - need) / kidNeed;
      }

      // 5. People eat, whatever spoils soonest first. With less in store than asked for, every share
      //    shrinks alike. Of the milk eaten, the children's food comes first: the milk they drink above
      //    their need is extra milk.
      const want = grownNeed * gGrown + kidNeed * gKids;
      const { milkEaten, riceEaten, foodEaten } = FoodModel.eat(stores, want);
      milkStored -= milkEaten; riceStored -= riceEaten;
      const eatenAll = milkEaten + riceEaten + foodEaten, got = want > 0 ? eatenAll / want : 1;
      // Each group's share of its need, for hunger (alike: one share of everyone's need, as eaten ÷ need)
      const alike = gGrown === gKids, share = alike ? Math.min(1, need > 0 ? eatenAll / need : 1) : Math.min(1, gGrown * got);
      const shareKids = alike ? share : Math.min(1, gKids * got);
      const extra = gKids > 1 + 1e-9 ? Math.max(0, kidNeed * (gKids * got - 1)) : 0;
      const kidsMilk = Math.min(milkEaten, kidNeed * gKids * got), extraMilk = Math.max(0, kidsMilk - kidNeed);
      // Each child's Power: today's extra milk buys points, kept for good; the food they went without
      // takes a point for every HUNGER_FOOD of it
      if (inherit && kidCountNow > 0) {
        const missed = Math.max(0, 1 - shareKids) * p.c * HumanModel.CHILD_FOOD;
        for (const h of st.people) if (h.age < p.M && h.basePower !== undefined) {
          h.milkBank += extraMilk / kidCountNow;
          for (let cost = nextPointCost(h.power, inherit); h.milkBank >= cost - 1e-9; cost = nextPointCost(h.power, inherit)) { h.milkBank -= cost; h.power++; }
          h.hungerBank += missed;
          while (h.hungerBank >= HUNGER_FOOD - 1e-9) { h.hungerBank -= HUNGER_FOOD; h.power = Math.max(0, h.power - 1); }
        }
      }

      // 6. What was eaten is shared out by need; hunger, ageing and deaths, births. Newborns take
      //    after their parents; anyone who came of age gets their bonus. With a schedule, each person's
      //    hunger follows their day (hungerOf).
      p.F = eatenAll - extra;
      // Each person's share: the grown-ups', or the children's (at most their need)
      const needOf = (h) => HumanModel.needOf(h, p), shareOf = (h) => (h.age < p.M ? shareKids : share);
      let lossOf = (h) => HumanModel.hungerLoss(Math.max(0, 1 - shareOf(h)) * needOf(h), p);
      if (S) {
        const home = atHome(S);
        lossOf = (h) => hungerOf(shareOf(h), (timelines && timelines.get(h)) || home, S, p.k, needOf(h));
        if (trace) { trace.share = share; trace.shareKids = shareKids; }
      }
      // The day's hypothermia toll, on top (the Clothing page)
      let coldLost = 0;
      if (chill) { const hungerOnly = lossOf; for (const v of chill.cold.values()) coldLost += v; lossOf = (h) => hungerOnly(h) + (chill.cold.get(h) || 0); }
      // Happiness through the day (from the last day's energy left), for the records; then at night
      // today's energy left sets everyone's happiness, which tonight's births go by
      let happy = 0, happyKids = 0, joyAdults = 0, happyNight = 0;
      if (joy) {
        let a = 0, k = 0;
        const adults = [];
        for (const h of st.people) {
          const st0 = HumanModel.stage(h, p);
          if (h.intel === undefined) continue;
          if (st0 === "adult") { happy += happinessOf(h, joy); joyAdults += h.joy || 0; a++; adults.push(h); } else if (st0 === "child") { happyKids += happinessOf(h, joy); k++; }
        }
        for (const h of st.people) { h.joy = h.joyNext || 0; h.joyNext = 0; }
        for (const h of adults) happyNight += happinessOf(h, joy);
        happy = a ? happy / a : NaN; joyAdults = a ? joyAdults / a : NaN; happyKids = k ? happyKids / k : NaN; happyNight = a ? happyNight / a : NaN;
      }
      const ev = HumanModel.stepPeople(st, p, rand, lossOf, joy ? chancesOf : null);
      for (let i = st.people.length - ev.born; i < st.people.length; i++) prepare(st.people[i]);   // the born, at the end
      if (inherit) inheritAttrs(st.people, p, irand, attrs, inherit);
      record(day, ev, {
        milkMade, milkEaten, milkSpoiled, riceMade, riceEaten, riceSpoiled, foodEaten, share: rationed ? gGrown : undefined, shareKids: rationed ? gKids : undefined, iq: advIQ, extra: extraMilk,
        adults: grownUps, farm: w.farm, milkers: w.milkers, kidsWork: w.kidsWorked, cows, crop, field, riceLost,
        milkWork: w.milkWork, farmWork: w.farmWork, walk, ...made, exp: expToday,
        taught: lesson.knowledge, gained: lesson.gained, kids: kidCount, picked, lesson: lesson.hours, scholar, scholars: scholars.length, ...reading,
        happy, happyKids, chance: chanceToday, joyAdults, happyNight, pairs: couples.length,
        coldLost, coldHours: chill ? chill.coldHours : 0, coldCut: chill ? chill.coldCut : 0, fires: chill ? chill.fires : 0, wd: wdays ? wdays[day - 1] : null, wet, waterDay,
      });
      tally.born += ev.born;
      if (joy && isFinite(happy)) { tally.happy += happy; tally.happyDays++; }
      tally.peopleDays += counts[day - 1]; tally.milk += milkMade; tally.rice += riceMade; tally.hunger += (ev.lostAll || 0) - coldLost; tally.walk += walk;
      tally.cold += coldLost; tally.coldHours += chill ? chill.coldHours : 0; tally.coldCut += chill ? chill.coldCut : 0; tally.fires += chill ? chill.fires : 0;
      if (waterDay) { tally.waterRice += waterDay.grew; tally.trips += waterDay.trips; tally.riverTrips += waterDay.river; }
      if (wet) { tally.rainIn += wet.inH; tally.rainLost += wet.lost; tally.outWork += wet.outWork; tally.hats += wet.hats; }
      if (made.resMade) { tally.wool += made.resMade.wool; tally.stone += made.resMade.stone; }
      tally.crafts += made.craftDone || 0; tally.taught += lesson.knowledge || 0; tally.gained += lesson.gained || 0;
      if (energy && day > T - YEAR) {
        let pw = 0, it = 0, n = 0;
        for (const h of st.people) if (HumanModel.stage(h, p) === "adult") { pw += h.power; it += h.intel; n++; }
        if (n) { tally.pow += pw / n; tally.int += it / n; tally.attrDays++; }
        if (skills) {
          let lv = 0, g = 0;
          for (const h of st.people) if (h.level && HumanModel.stage(h, p) !== "child") { for (const { id } of SKILLS) lv += h.level[id]; g++; }
          if (g) { tally.level += lv / (g * SKILLS.length); tally.levelDays++; }
        }
      }
      if (st.people.length === 0) extinctDay = day;
      if (st.people.length > MAX_PEOPLE) { capped = true; last = day; break; }
    }
    if (stopAt < T && !capped) last = Math.min(last, stopAt);
    return { counts, last, capped, extinctDay, survived: capped || counts[T] > 0, tally, ...d };

    // The adult with the highest Intelligence (first on a tie), not already a scholar
    function pickScholar(people, p, taken) {
      let best = null;
      for (const h of people) if (HumanModel.stage(h, p) === "adult" && !taken.includes(h) && (!best || h.intel > best.intel)) best = h;
      return best;
    }
    // Could the village spare these people from the food work: without them and the children, are there
    // still a full crew (4) of grown-ups who may tend, with energy? And from a second scholar on, could
    // the grown-ups left feed the whole village by milking alone (one to a cow: the best milkers' energy ×
    // milk effectiveness × their skill at it)?
    function canSpare(them, people, p, cows) {
      let crew = 0;
      const milk = [];
      for (const h of people) {
        if (them.includes(h)) continue;
        const stage = HumanModel.stage(h, p);
        if (stage === "child") continue;
        const k = stage === "elder" ? elderAttr : 1, e = workDay(h.power * k, h.intel * k).energy;
        if (e > 0 && may(h, "tend")) crew++;
        if (may(h, "milk")) milk.push(e * F.milkPerEnergy * (eff ? eff(h, "milk") : 1));
      }
      if (crew < FULL_CREW) return false;
      if (them.length < 2) return true;
      milk.sort((a, b) => b - a);
      let made = 0;
      for (let i = 0; i < Math.min(cows, milk.length); i++) made += milk[i];
      return made >= HumanModel.foodNeed(people, p) - 1e-9;
    }
  }

  window.VillageModel = {
    T, YEAR, RUNS, MAX_ICONS, MAX_PEOPLE, HUMAN_SALT, FULL_CREW, HARVEST_FIRST, TEND_DAYS, HARVEST_PER_HAND, DAY_ENERGY, HUNGER_FOOD, nextPointCost, nextIntelCost,
    milkGiven, DEFAULT_ORDER, fullOrder, teachesFirst, SKILLS, MAX_LEVEL, effAt, MAX_HAPPY, MID_HAPPY, baseHappiness, happinessOf, birthChance, powerFromFood, dayOfYear, harvestLastOf, workDay, runHerd, run, scholarDay, scholarIQ, teach, learn, read,
    collectOrder, assignEnergy, CRAFT_MAX_TIER, craftTier, craftTierOdds,
  };
})();
