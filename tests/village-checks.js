// One test job of tests/run.js, in its own process: plays villages with VillageModel.run and checks, day by
// day, what must always hold (the onDay hook), then the day-by-day records. Started by run.js (fork); each
// message is a job { label, cfg, mode, days, seeds, player, set }, answered with { label, found, ms }, found
// being [{ kind, n, example }]. cfg: a page's run config as run.js captured it (JSON, travel left out: the
// default map's is used).
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.join(__dirname, "..");
const MODELS = ["herd-model.js", "human-model.js", "food-model.js", "map-model.js", "roles-model.js", "weather-model.js", "day-model.js", "village-model.js", "micro-model.js", "strategy-model.js"];

// The models, as the pages load them, in a window of their own
const ctx = { Math, console, Float32Array, Float64Array, Int32Array, Int8Array, Uint8Array, Uint16Array, Array, Number, isFinite, JSON, Infinity, NaN, Set, Map, WeakMap, Object, ArrayBuffer, localStorage: { getItem: () => null, setItem() {} }, CustomEvent: class {}, dispatchEvent() {} };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of MODELS) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { VillageModel: VM, HumanModel: HM, HerdModel, MapModel } = ctx;
const RES = ["wool", "stone", "wood"];
const total = (a) => { let t = 0; for (const v of a) t += v; return t; };
// Records that may hold NaN on a day (nobody to average, no weather, …)
const MAY_NAN = new Set(["share", "happy", "happyKids", "joyAdults", "happyNight", "pow", "int", "schPow", "schInt", "tempLo", "tempHi", "well", "fieldWater", "land", "ration"]);

// The config, revived: typed arrays back, the default map's day, and set ("a.b.c=v;…") applied
function configOf(job) {
  const cfg = JSON.parse(JSON.stringify(job.cfg), (k, x) => (x && x.__ta ? ctx[x.__ta].from(x.v) : x));
  if (cfg.travel) cfg.travel = MapModel.travelOf({ ...MapModel.DEFAULTS });
  if (job.set) for (const kv of job.set.split(";")) {
    const [p, v] = kv.split("="), ks = p.split(".");
    let o = cfg;
    for (const k of ks.slice(0, -1)) o = o[k] = Array.isArray(o[k]) ? o[k].slice() : { ...o[k] };
    o[ks[ks.length - 1]] = Number(v);
  }
  return cfg;
}

function check(job) {
  const found = new Map();
  const note = (kind, ...example) => { const f = found.get(kind) || { kind, n: 0, example }; f.n++; found.set(kind, f); };
  const base = configOf(job), energy = base.work === "energy", HP = { ...HerdModel.DEFAULTS }, HS = { ...HerdModel.START };
  for (let i = 0; i < job.seeds; i++) {
    const cows = VM.runHerd(HP, HS.N0, 7919 + i, false, 1, HS.cowTier), sheep = VM.runHerd(HP, HS.N0, 7919 + 500000 + i, false, 1, HS.sheepTier);
    const adultSheep = (day) => (sheep.tiers ? [1, 2, 3, 4].reduce((a, t) => a + (sheep.tiers[t] ? sheep.tiers[t][day - 1] : 0), 0) : sheep.adults[day - 1]);
    let lastAge = new Map();
    const cfg = { ...base, mode: job.mode, seed: 7919 + VM.HUMAN_SALT + i, cowAdults: cows.adults, cowTiers: cows.tiers, sheepAdults: sheep.adults, sheepTiers: sheep.tiers, detailed: true,
      player: job.player ? { id: job.player, handsOff: 10, runDays: VM.T } : null };
    if (job.days < VM.T) cfg.stopAfter = job.days;
    cfg.onDay = (day, s) => {
      const { people, stores, p } = s;
      // Food: the running totals are the batches', nothing negative
      if (Math.abs(s.milkStored - total(stores.milk)) > 1e-6) note("milk: running total ≠ the batches in store", day, s.milkStored, total(stores.milk));
      if (Math.abs(s.riceStored - total(stores.rice)) > 1e-6) note("rice: running total ≠ the batches in store", day, s.riceStored, total(stores.rice));
      for (const a of [stores.milk, stores.rice]) for (const v of a) if (!(v >= -1e-9)) { note("a food batch negative or NaN", day, v); break; }
      if (!(stores.food >= -1e-9)) note("starting food negative", day, stores.food);
      // People
      const ids = new Set(), alive = new Set(people);
      for (const h of people) {
        if (ids.has(h.id)) note("two people with one id", day, h.id);
        ids.add(h.id);
        if (!isFinite(h.age) || !isFinite(h.life)) note("age or lifespan not finite", day, h.id);
        if (h.age >= h.life) note("alive past their lifespan", day, h.id, h.age, h.life);
        if (energy && h.power !== undefined) {
          if (!isFinite(h.power) || !isFinite(h.intel)) note("Power or Intelligence not finite", day, h.id);
          const stage = HM.stage(h, p), floor = stage === "child" ? 70 - (s.inherit ? s.inherit.grow : 0) : 70;
          if (h.power < floor - 1e-9 || h.intel < floor - 1e-9) note(`Power or Intelligence below the floor (${stage})`, day, h.power, h.intel);
        }
        if (h.partner) {
          if (!alive.has(h.partner)) note("partner not alive", day, h.id);
          else if (h.partner.partner !== h) note("partners not each other's", day, h.id);
          if (h.partner.sex === h.sex) note("partners of one sex", day);
        }
        if (h.carry > 0 && (h.sex !== HM.FEMALE || HM.stage(h, p) !== "adult")) note("someone not an adult woman expecting", day, h.sex, h.age);
        if (lastAge.has(h.id) && h.age !== lastAge.get(h.id) + 1) note("aged other than a day", day, h.id);
        if (h.short > 0 && h.life0 - h.life !== Math.floor(p.k * h.short + 1e-9)) note("hunger's toll ≠ ⌊k × food missed⌋", day, h.life0 - h.life, p.k * h.short);
        if (h.level) for (const k in h.level) if (!(h.level[k] >= 0 && h.level[k] <= 4)) note("a skill level out of 0–4", k, h.level[k]);
        if (h.joy !== undefined && !(h.joy >= 0)) note("energy left negative or NaN", day, h.joy);
        // 發呆 first: nothing spent
        if (s.joy && h.order && h.order[0] === "idle" && s.en.has(h) && h.joy !== Math.floor(s.en.get(h) / (s.joy.joyStep || 1) + 1e-9)) note("someone ordered to 發呆 spent energy", day, h.joy, s.en.get(h));
      }
      for (const cp of s.couples) {
        const [m, f] = cp;
        if (!alive.has(m) || !alive.has(f)) note("a couple with someone not alive", day);
        else if (m.partner !== f || f.partner !== m) note("a couple who aren't partners", day);
        if (cp.noBirth && f.carry === p.G) note("a couple held off children conceived", day);
      }
      lastAge = new Map(people.map((h) => [h.id, h.age]));
      // The economy: lots add up to the stores, the crafts' counts to the tools, the flock to the herd, the
      // places to their crews, the wool off the sheep to the wool taken
      const E = s.econ;
      if (E) {
        for (const r of RES) {
          const inLots = E.lots[r][1] + E.lots[r][2] + E.lots[r][3] + E.lots[r][4] + E.open[r].n;
          if (Math.abs(inLots - E.store[r]) > 1e-6) note(`${r}: lots ≠ store`, day, inLots, E.store[r]);
          if (E.store[r] < -1e-6) note(`${r}: store negative`, day, E.store[r]);
          for (let t = 1; t <= 4; t++) if (E.lots[r][t] < -1e-9) note(`${r}: a lot negative`, day, t, E.lots[r][t]);
          if (E.today.atPlace[r] > E.today.places[r]) note(`${r}: more people than places`, day, E.today.atPlace[r], E.today.places[r]);
        }
        const shorn = E.today.woolStart - E.woolOnSheep(), taken = E.today.woolStart - E.today.woolLeft;
        if (Math.abs(shorn - taken) > 1) note("wool shorn off the sheep ≠ wool taken", day, shorn, taken);
        if (E.cr) for (const it of E.cr.items) {
          const c = E.crafted[it.id];
          let sum = 0;
          for (let t = 1; t <= 5; t++) {
            sum += c[t];
            if (c[t] !== E.tools[it.id][t].length) note(`${it.id}: count ≠ crafts in store`, day, t, c[t], E.tools[it.id][t].length);
            for (const b of E.tools[it.id][t]) if (b.tier !== t) note(`${it.id}: a craft filed under another tier`, day);
          }
          if (sum !== c[0]) note(`${it.id}: total ≠ the tiers'`, day, c[0], sum);
        }
        let flock = 0;
        for (let t = 1; t <= 4; t++) for (let k = 0; k <= E.res.fleece; k++) { if (E.fleece[t][k] < 0) note("a fleece count negative", day); flock += E.fleece[t][k]; }
        if (flock !== adultSheep(day)) note("flock ≠ the herd's adult sheep", day, flock, adultSheep(day));
      }
      if (s.water) {
        if (!(s.water.well >= -1e-9 && s.water.well <= s.waterCfg.cap + 1e-9)) note("the well out of range", day, s.water.well);
        for (const l of s.water.level) if (!(l >= -1e-9 && l <= 10 + 1e-9)) note("a field's water out of 0–10", day, l);
      }
    };
    let r;
    try { r = VM.run(cfg); } catch (e) { note("CRASH: " + e.message, (e.stack || "").split("\n").slice(1, 3).join(" | ")); continue; }
    // The records: today's stock = yesterday's + made − eaten − spoiled
    for (let d = 1; d <= r.last; d++) {
      if (!r.stored) break;
      const m = r.stored[d - 1] + r.made[d] - r.drank[d] - r.spoiled[d] - r.stored[d];
      if (Math.abs(m) > 0.5) note("milk records: stock ≠ flows", d, m);
      const q = r.riceStored[d - 1] + r.riceMade[d] - r.riceEaten[d] - r.riceSpoiled[d] - r.riceStored[d];
      if (Math.abs(q) > 0.5) note("rice records: stock ≠ flows", d, q);
    }
    for (const k of Object.keys(r)) {
      const a = r[k];
      if (a instanceof ctx.Float32Array && !MAY_NAN.has(k)) for (let d = 1; d <= r.last; d++) if (Number.isNaN(a[d]) && r.counts[d]) { note(`NaN in the records: ${k}`, d); break; }
    }
    for (const k of ["peak", "milk", "rice", "hunger", "walk", "crafts"]) if (!isFinite(r.tally[k])) note(`run total not finite: ${k}`);
  }
  return [...found.values()];
}

// Macro against Micro, the same villages: what each brings in per person-day (job.compare)
function compare(job) {
  const base = configOf(job), HP = { ...HerdModel.DEFAULTS }, HS = { ...HerdModel.START }, keys = ["milk", "rice", "woolMade", "stoneMade", "woodMade", "crafts", "taught", "walk", "hunger"], sum = { macro: {}, micro: {} };
  for (let i = 0; i < job.seeds; i++) {
    const cows = VM.runHerd(HP, HS.N0, 7919 + i, false, 1, HS.cowTier), sheep = VM.runHerd(HP, HS.N0, 7919 + 500000 + i, false, 1, HS.sheepTier);
    for (const mode of ["macro", "micro"]) {
      const r = VM.run({ ...base, mode, player: null, seed: 7919 + VM.HUMAN_SALT + i, cowAdults: cows.adults, cowTiers: cows.tiers, sheepAdults: sheep.adults, sheepTiers: sheep.tiers, detailed: true, stopAfter: job.days });
      const t = sum[mode];
      t.days = (t.days || 0) + r.tally.peopleDays;
      for (const k of keys) {
        let v = r.tally[k];
        if (v === undefined && r[k]) { v = 0; for (let d = 1; d <= job.days; d++) v += r[k][d]; }
        t[k] = (t[k] || 0) + (v || 0);
      }
    }
  }
  return keys.map((k) => ({ kind: k, macro: sum.macro[k] / sum.macro.days, micro: sum.micro[k] / sum.micro.days }));
}

process.on("message", (job) => {
  const t0 = Date.now();
  let found;
  try { found = job.compare ? compare(job) : check(job); } catch (e) { found = [{ kind: "CRASH in the test: " + e.message, n: 1, example: [] }]; }
  process.send({ label: job.label, found, ms: Date.now() - t0 });
});
