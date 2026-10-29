// Shared page code for the village pages (Food, Attribute, Inheritance, Education, Happiness, Resources, Craft). It reads the settings of the pages before, works out the simulation options from
// the page's place in the chain, draws the read-only panel sections and every card in <main>, runs the
// villages (village-model.js) and handles the charts, the farm, the stats and playback. Each page calls
// VillagePage.start(def) with what's its own:
//   key        "food" | "attribute" | "inheritance" | "education" | "happiness" | "resources" | "craft"
//   work       "none" | "energy"; inherit, school, resources, craft, happiness, skills: which cards it shows
//   inputs     its sliders: { id, key, obj: "S" (default) | "F", round: "step" | "int" | "none" }, with
//              lo, hi and step from its settings table (SPECS), or given here (a number box #id-num, with a
//              slider #id-range if the page has one); or with tiers: true,
//              a button for each tier from lo to hi (N to SSR) in #id-seg; or with choices: [[value, label]],
//              a button for each in #id-seg
//   storeKey, defaults: where it keeps its settings and their defaults, for pages without a SPECS table
//   setup(c), beforeRun(c), drawPanel(c), config(c): page hooks. c.summaryWith(over): the page's
//   village with options changed (Macro; null until run): { survived, extinctDay, last, end (people at
//   the end), counts (people by day), tally }
// Each page runs one village, the one on screen. From the Attribute page on, the top bar switches between
// Macro mode (each day worked out for the village as a whole) and Micro mode (person by person,
// micro-model.js). Micro mode runs the village both ways, draws Micro's, and adds a day viewer
// (micro-view.js) and a comparison of the two.
// Micro is slow, so it runs only when its button is pressed: opening a page, rolling new runs or
// changing a setting goes back to Macro.
(function () {
  const VM = VillageModel, DM = DayModel;
  const { T, YEAR, MAX_ICONS, MAX_PEOPLE, HUMAN_SALT, FULL_CREW, HARVEST_FIRST, DAY_ENERGY } = VM;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (v, d = 0) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  const fmtNum = (v) => fmt(v, Number.isInteger(v) ? 0 : 2);   // 2 or 2.37
  const milkText = (v) => { const r = Math.round(v * 10) / 10; return fmt(r, r % 1 ? 1 : 0); };
  // One row each: symbol, label and value on a line, the value on a line of its own if it doesn't fit
  const paramRows = (rows) => rows.map(([s, label, v, cls = ""]) =>
    `<div class="prow ${cls}"><dt>${s}</dt><dd class="label">${label}</dd><dd class="v">${v}</dd></div>`).join("");
  const NOTE = "Showing defaults. If you changed that page and it doesn't show here, your browser keeps each local file's settings separate.";

  // The crafts, for the Craft page's settings and card: what each takes by default, and the energy of its
  // use it lasts (wear: 衣 and 笠 anything, 刀 the harvest and collecting, 叉 tending). needKey: the setting for one of its
  // materials ("hatWood")
  const CRAFTS = [
    { id: "clothes", zh: "衣", en: "Clothes", job: "weave", needs: { wool: 200, wood: 100 }, wear: 2000 },
    { id: "hat", zh: "笠", en: "Hat", job: "weave", needs: { wool: 100, wood: 200 }, wear: 2000 },
    { id: "blade", zh: "刀", en: "Blade", job: "forge", needs: { stone: 200, wood: 100 }, wear: 2000 },
    { id: "fork", zh: "叉", en: "Hayfork", job: "forge", needs: { stone: 100, wood: 200 }, wear: 2000 },
  ];
  const needKey = (it, m) => it.id + m[0].toUpperCase() + m.slice(1);
  // The settings pages' own settings, by field: [default, lowest, highest, slider step]. Each page takes
  // its defaults and slider ranges from here; the pages after it read what it saved.
  const SPECS = {
    attribute: { key: "attribute-v4", fields: { power: [100, 70, 300, 5], intel: [100, 70, 300, 5], elderPenalty: [20, 0, 50, 5] } },
    inheritance: { key: "inheritance-v14", fields: { dearerPast: [100, 0, 300, 5], share: [0.7, 0, 1, 0.05], variation: [10, 0, 50, 1], grow: [24, 0, 100, 1], powerBase: [100, 10, 1000, 10], hungerFood: [100, 1, 10000, 1] } },
    education: { key: "education-v5", fields: { maxScholars: [1, 1, 10, 1], knowPerEnergy: [1, 0.1, 5, 0.1], knowBase: [1000, 10, 1000, 10], scholarShift: [10, 0, 50, 5], intelPast: [100, 0, 300, 5] } },
    happiness: { key: "happiness-v6", fields: { happyBase: [150, 0, 300, 5], iqStep: [1, 0.5, 10, 0.5], joyStep: [1, 1, 100, 1] } },
    resources: { key: "resources-v10", fields: { fleece: [300, 10, 500, 10], regrow: [30, 1, 100, 1], woolPerEnergy: [1, 0.1, 5, 0.1], woodPerEnergy: [1, 0.1, 5, 0.1], stonePerEnergy: [1, 0.1, 5, 0.1], forestTier: [3, 1, 3, 1], mineTier: [3, 1, 3, 1], forestCrew: [3, 0, 20, 1], mineCrew: [2, 0, 20, 1],
      exp1: [100, 10, 1000000, 10], exp2: [1000, 10, 1000000, 10], exp3: [10000, 10, 1000000, 10], exp4: [100000, 10, 1000000, 10],
      bonus1: [10, 0, 500, 5], bonus2: [20, 0, 500, 5], bonus3: [30, 0, 500, 5], bonus4: [50, 0, 500, 5] } },
    clothing: { key: "clothing-v4", fields: { coldLimit: [-5, -30, 0, 1], clothStep: [5, 0, 20, 1], fireStep: [5, 0, 20, 1], fireHours: [2, 0.25, 4, 0.25], fireReach: [4, 0, 16, 1], fireEnergy: [1, 0, 20, 1],
      hatStep: [2, 0, 10, 1], rainLimit: [5, 1, 11, 1] } },
    strategy: { key: "strategy-v3", fields: { strategy: [1, 1, 4, 1], handsOff: [10, 1, 99, 1] } },
    watering: { key: "watering-v4", fields: { wellCap: [100, 10, 1000, 10], wellGround: [50, 0, 1000, 10], waterUse: [0.1, 0, 1, 0.01], waterAt: [4, 0, 10, 0.5],
      g0: [-100, -500, 500, 5], g1: [0, -500, 500, 5], g2: [25, -500, 500, 5], g3: [50, -500, 500, 5], g4: [100, -500, 500, 5], g5: [50, -500, 500, 5], g6: [25, -500, 500, 5], g7: [0, -500, 500, 5], g8: [-25, -500, 500, 5], g9: [-50, -500, 500, 5], g10: [-100, -500, 500, 5] } },
    craft: { key: "craft-v17", fields: { ...Object.fromEntries(CRAFTS.flatMap((it) => [...Object.entries(it.needs).map(([m, n]) => [needKey(it, m), [n, 0, 10000, 10]]), [it.id + "Energy", [100, 10, 2000, 10]], [it.id + "Wear", [it.wear, 500, 300000, 500]]])),       startBlades: [0, 0, 5000, 10], startForks: [0, 0, 5000, 10], startClothes: [0, 0, 5000, 10], startHats: [0, 0, 5000, 10], bonus1: [20, 0, 500, 5], bonus2: [40, 0, 500, 5], bonus3: [60, 0, 500, 5], bonus4: [80, 0, 500, 5], bonus5: [100, 0, 500, 5] } },
  };
  // Settings saved at 10 energy a day come over at the 100 base: food, wool, timber, knowledge and crafts
  // ×10 (scale), happiness's Intelligence step ÷ 10. Each new key takes from the first of its old keys
  // that's saved (from: [[key, { field: factor or 0 to drop }]]), and some from more than one (merge).
  // The older keys came over to the 10-base ones before: Inheritance v5/v6 without the fields since
  // changed, Resources v1 with Craft v1. Craft v5 (every craft 100 + 100) keeps only the energies. Education v3 (poetry 10,000 per
  // +1 Intelligence) keeps the rest of v2; Happiness v3 and v4 (each a new
  // default step) keep the rest; Craft v6 (new wear limits) keeps all but the wear,
  // v7 (new tool bonuses) all but the bonuses, v8 (new bonuses and wear) all but those; Resources v5
  // (skill levels 0–4) all but the old skill fields; v6 (skill bonuses as yields, +10–40%) all but the bonuses, v7 (+5 / 10 / 20 / 40%) all but the first three, v8 (300 wool a sheep, 30 a day) all but those two.
  // Inheritance v9 (variation 15%, base cost 100) and Education v4 (base cost 100) keep the rest; Education v5 (base cost 1,000, dearer past 100) too.
  try {
    const keyed = (k) => { const v = JSON.parse(localStorage.getItem(k) || "null"); return v && typeof v === "object" ? v : null; };
    const scaled = (old, factors) => {
      const out = {};
      for (const [k, v] of Object.entries(old)) { const f = k in factors ? factors[k] : 1; if (f) out[k] = isFinite(Number(v)) ? Number(v) * f : v; }
      return out;
    };
    const ten = (...fields) => Object.fromEntries(fields.map((f) => [f, 10]));
    const crafts = CRAFTS.flatMap((it) => [it.id + "Cost", it.id + "Energy"]), energies = CRAFTS.map((it) => it.id + "Energy");
    const res = ["fleece", "regrow", "woodTarget", "woolPerEnergy", "woodPerEnergy", "stonePerEnergy"];
    const pick = (old, keys) => Object.fromEntries(Object.entries(old).filter(([k]) => keys.includes(k)));
    const resV2 = () => keyed("resources-v2") || Object.assign({}, keyed("resources-v1"), keyed("craft-v1"));
    const MOVES = [
      ["inheritance-v8", [() => scaled(keyed("inheritance-v7") || {}, ten("extraCap", "powerFoodBase")),
        () => scaled(keyed("inheritance-v6") || {}, { extraCap: 0, powerFoodBase: 10 }), () => scaled(keyed("inheritance-v5") || {}, { extraCap: 0, powerFoodBase: 0 })]],
      ["inheritance-v9", [() => scaled(keyed("inheritance-v8") || {}, { variation: 0, powerBase: 0 })]],
      ["inheritance-v10", [() => scaled(keyed("inheritance-v9") || {}, { bornPower: 0 })]],   // Power inherited again; points dearer past 70
      ["inheritance-v11", [() => scaled(keyed("inheritance-v10") || {}, { hungerFood: 0 })]],   // hunger per −1 Power: 10
      ["inheritance-v12", [() => scaled(keyed("inheritance-v11") || {}, { dearerPast: 0, variation: 0, grow: 0, hungerFood: 0 })]],   // dearer past 80, variation 10%, no coming-of-age bonus, hunger per −1 Power 100
      ["inheritance-v13", [() => scaled(keyed("inheritance-v12") || {}, { dearerPast: 0, grow: 0 })]],   // Power points dearer past 100, coming-of-age bonus 20
      ["inheritance-v14", [() => scaled(keyed("inheritance-v13") || {}, { grow: 0 })]],   // coming-of-age bonus 24
      ["education-v2", [() => scaled(keyed("education-v1") || {}, ten("knowPerIntel", "readPerIntel"))]],
      ["education-v3", [() => scaled(keyed("education-v2") || {}, { readPerIntel: 0 })]],
      ["education-v4", [() => scaled(keyed("education-v3") || {}, { knowBase: 0 })]],
      ["education-v5", [() => scaled(keyed("education-v4") || {}, { knowBase: 0, intelPast: 0 })]],   // base cost 1,000, Intelligence points dearer past 100
      ["happiness-v2", [() => scaled(keyed("happiness-v1") || {}, { iqStep: 0.1 })]],
      ["happiness-v3", [() => scaled(keyed("happiness-v2") || {}, { iqStep: 0 })]],
      ["happiness-v4", [() => scaled(keyed("happiness-v3") || {}, { iqStep: 0 })]],
      ["happiness-v5", [() => scaled(keyed("happiness-v4") || {}, { iqStep: 0 })]],   // base happiness 150 − ⌊Intelligence ÷ 1⌋
      ["happiness-v6", [() => scaled(keyed("happiness-v5") || {}, { joyStep: 0 })]],   // extra happiness ⌊energy left ÷ 1⌋
      ["resources-v3", [() => Object.assign(scaled(pick(resV2(), res), ten("fleece", "regrow", "woodTarget")), scaled(keyed("skill-v1") || {}, ten("expPerLevel")))]],
      ["resources-v5", [() => scaled(keyed("resources-v4") || keyed("resources-v3") || {}, { expPerLevel: 0, perLevel: 0, exp2: 0, exp3: 0, bonus2: 0, bonus3: 0 })]],
      ["resources-v6", [() => scaled(keyed("resources-v5") || {}, { bonus1: 0, bonus2: 0, bonus3: 0, bonus4: 0 })]],
      ["resources-v7", [() => scaled(keyed("resources-v6") || {}, { bonus1: 0, bonus2: 0, bonus3: 0 })]],
      ["resources-v8", [() => scaled(keyed("resources-v7") || {}, { fleece: 0, regrow: 0 })]],
      ["resources-v9", [() => scaled(keyed("resources-v8") || {}, { bonus1: 0, bonus2: 0, bonus3: 0 })]],   // skill bonuses 10 / 20 / 30 / 40%
      ["resources-v10", [() => scaled(keyed("resources-v9") || {}, { bonus4: 0 })]],   // level 4 +50%
      ["watering-v2", [() => scaled(keyed("watering-v1") || {}, { g1: 0, g2: 0, g3: 0, g4: 0, g5: 0, g6: 0 })]],   // growth +10 at levels 1–6
      ["watering-v3", [() => scaled(keyed("watering-v2") || {}, { waterAt: 0 })]],   // fetch water at level 4
      ["watering-v4", [() => scaled(keyed("watering-v3") || {}, { g1: 0, g2: 0, g3: 0, g4: 0, g5: 0, g6: 0, g8: 0 })]],   // growth +100 at level 4, +50 at 3 and 5, +25 at 2 and 6, −25 at 8
      ["strategy-v2", [() => { const o = keyed("strategy-v1") || {}; if (Number(o.strategy) >= 3) o.strategy = Number(o.strategy) + 2; return o; }]],   // Strongest person and Best all-rounder after Brightest person
      ["strategy-v3", [() => { const o = keyed("strategy-v2") || {}; const n = Number(o.strategy); if (n >= 2) o.strategy = n <= 4 ? 2 : n - 2; return o; }]],   // Brightest and Strongest person folded into Best all-rounder
      ["clothing-v2", [() => scaled(keyed("clothing-v1") || {}, { fireHours: 0 })]],
      ["clothing-v3", [() => scaled(keyed("clothing-v2") || {}, { coldK: 0 })]],
      ["clothing-v4", [() => scaled(keyed("clothing-v3") || {}, { coldK: 0 })]],   // the toll became k × (felt ÷ 10)²
      ["craft-v2", [() => scaled(pick(resV2(), crafts), ten(...crafts))]],
      ["craft-v5", [() => pick(keyed("craft-v4") || keyed("craft-v3") || keyed("craft-v2") || {}, energies)]],
      ["craft-v6", [() => { const v5 = keyed("craft-v5") || {}; return pick(v5, Object.keys(v5).filter((k) => !k.endsWith("Wear"))); }]],
      ["craft-v7", [() => { const v6 = keyed("craft-v6") || {}; return pick(v6, Object.keys(v6).filter((k) => !k.startsWith("bonus"))); }]],
      ["craft-v8", [() => { const v7 = keyed("craft-v7") || {}; return pick(v7, Object.keys(v7).filter((k) => !k.startsWith("bonus") && !k.endsWith("Wear"))); }]],
      // v9: new recipes (clothes 200 wool, hats and hayforks 200 timber, blades 200 stone) and 300 energy each
      ["craft-v9", [() => { const v8 = keyed("craft-v8") || {}; return pick(v8, Object.keys(v8).filter((k) => !["clothesWool", "hatWood", "bladeStone", "forkWood"].includes(k) && !k.endsWith("Energy"))); }]],
      // v10: tool bonuses 20 / 40 / 60 / 80 / 100%
      ["craft-v10", [() => { const v9 = keyed("craft-v9") || {}; return pick(v9, Object.keys(v9).filter((k) => !k.startsWith("bonus"))); }]],
      ["craft-v11", [() => scaled(keyed("craft-v10") || {}, { clothesWear: 0, hatWear: 0 })]],
      ["craft-v12", [() => scaled(keyed("craft-v11") || {}, { clothesWear: 0, hatWear: 0, bladeWear: 0, forkWear: 0 })]],
      ["craft-v13", [() => scaled(keyed("craft-v12") || {}, { clothesWear: 0, hatWear: 0, bladeWear: 0, forkWear: 0 })]],
      ["craft-v14", [() => scaled(keyed("craft-v13") || {}, { clothesWear: 0, hatWear: 0, bladeWear: 0, forkWear: 0 })]],
      // v15: every craft 100 energy to make, lasting 1,500; 500 of each to start with
      ["craft-v15", [() => { const v14 = keyed("craft-v14") || {}; return pick(v14, Object.keys(v14).filter((k) => !k.endsWith("Energy") && !k.endsWith("Wear") && !k.startsWith("start"))); }]],
      ["craft-v16", [() => scaled(keyed("craft-v15") || {}, { clothesWear: 0, hatWear: 0, bladeWear: 0, forkWear: 0 })]],
      ["craft-v17", [() => scaled(keyed("craft-v16") || {}, { startBlades: 0, startForks: 0, startClothes: 0, startHats: 0 })]],   // nothing in store to start with   // every craft lasts 2,000 energy
    ];
    for (const [key, from] of MOVES) {
      if (keyed(key)) continue;
      for (const f of from) { const v = f(); if (Object.keys(v).length) { localStorage.setItem(key, JSON.stringify(v)); break; } }
    }
  } catch (e) {}
  const defaultsOf = (spec) => Object.fromEntries(Object.entries(spec.fields).map(([k, [v]]) => [k, v]));
  const roundTo = (v, step) => Number((Math.round(v / step) * step).toFixed(2));
  // What a settings page last saved (clamped and rounded as its sliders would), or its defaults
  function readSaved(spec) {
    const values = defaultsOf(spec);
    try {
      const a = JSON.parse(localStorage.getItem(spec.key) || "null");
      if (!a || typeof a !== "object") return { values, saved: false };
      for (const [k, [, lo, hi, step]] of Object.entries(spec.fields)) {
        const v = Number(a[k]);
        if (k in a && isFinite(v)) values[k] = roundTo(clamp(v, lo, hi), step);
      }
      return { values, saved: true };
    } catch (e) {
      return { values, saved: false };
    }
  }
  // Simulation options from the Education, Happiness, Resources and Craft pages' settings
  // (IH: the Inheritance page's settings, whose "dearer past" Intelligence's cost shares)
  const schoolOf = (E) => ({ knowPerEnergy: E.knowPerEnergy, knowBase: E.knowBase, shift: E.scholarShift, most: E.maxScholars, dearerPast: E.intelPast });
  const resourcesOf = (R) => ({ fleece: R.fleece, regrow: R.regrow, perEnergy: { wool: R.woolPerEnergy, stone: R.stonePerEnergy, wood: R.woodPerEnergy }, tiers: { wood: R.forestTier, stone: R.mineTier }, crew: { wood: R.forestCrew, stone: R.mineCrew } });
  const happinessOf = (H) => ({ base: H.happyBase, iqStep: H.iqStep, joyStep: H.joyStep });
  const skillsOf = (K) => ({ exp: [K.exp1, K.exp2, K.exp3, K.exp4], bonus: [K.bonus1, K.bonus2, K.bonus3, K.bonus4] });
  const craftOf = (C) => ({ items: CRAFTS.map((it) => ({ id: it.id, job: it.job, needs: Object.fromEntries(Object.keys(it.needs).map((m) => [m, C[needKey(it, m)]])), energy: C[it.id + "Energy"], wear: C[it.id + "Wear"] })),
    bonus: [0, C.bonus1 / 100, C.bonus2 / 100, C.bonus3 / 100, C.bonus4 / 100, C.bonus5 / 100] });
  // The cold (the Clothing page): the Weather page's sets, with each season's temperature figures from a
  // ten-year run of it, worked out once for each set of settings
  const coldStats = new Map();
  function coldOf(K) {
    const sets = WeatherModel.savedParams(), key = JSON.stringify(sets);
    if (!coldStats.has(key)) coldStats.set(key, Object.fromEntries(WeatherModel.SEASONS.map((s) => [s.id, WeatherModel.simulate({ ...sets[s.id] }, 360 * 24 * 10, 1, 0).temp.stats])));
    return { sets, stats: coldStats.get(key), limit: K.coldLimit, clothStep: K.clothStep, fireStep: K.fireStep, fireHours: K.fireHours, fireReach: K.fireReach, fireEnergy: K.fireEnergy };
  }
  // The rain (the Clothing page too): the same weather, with its 笠 and limit
  const rainOf = (K) => { const { sets, stats } = coldOf(K); return { sets, stats, hatStep: K.hatStep, limit: K.rainLimit }; };

  // The pages in order; each page reads the settings of the pages before it
  // (the Food page keeps the food settings)
  const CHAIN = ["herd", "humans", "food", "map", "attribute", "inheritance", "education", "happiness", "resources", "craft", "weather", "clothing", "watering", "strategy"];
  const KEYS = { herd: [HerdModel.STORE_KEY], humans: [HumanModel.STORE_KEY], food: [FoodModel.STORE_KEY], map: [MapModel.STORE_KEY], weather: window.WeatherModel ? [WeatherModel.STORE_KEY] : [],
    ...Object.fromEntries(Object.entries(SPECS).map(([name, spec]) => [name, [spec.key]])) };
  const SHEEP_SALT = 500000;   // keeps the sheep's dice apart from the cows'

  function start(def) {
    const at = (name) => CHAIN.indexOf(def.key) >= CHAIN.indexOf(name);   // this page or a later one
    const work = def.work, none = work === "none", energy = work === "energy";
    const HARVEST_LAST = VM.harvestLastOf(work);
    const isHarvest = (day) => day >= 1 && VM.dayOfYear(day) >= HARVEST_FIRST && VM.dayOfYear(day) <= HARVEST_LAST;
    const upstream = CHAIN.slice(0, CHAIN.indexOf(def.key)).flatMap((k) => KEYS[k] || []);
    // This page's settings: from its SPECS table if it has one; sliders take their ranges from it too
    const own = SPECS[def.key], storeKey = own ? own.key : def.storeKey;
    const inputs = (def.inputs || []).map((inp) => (own && own.fields[inp.key] ? { lo: own.fields[inp.key][1], hi: own.fields[inp.key][2], step: own.fields[inp.key][3], ...inp } : inp));
    const S_DEFAULTS = { seed: 1, speed: 180, ...(own ? defaultsOf(own) : def.defaults) };
    let S = { ...S_DEFAULTS };
    try { const saved = JSON.parse(localStorage.getItem(storeKey) || "null"); if (saved && typeof saved === "object") S = { ...S, ...saved }; } catch (e) {}
    const store = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} };

    // c: everything the page hooks see
    const c = { def, S, T, YEAR, fmt, fmtNum, milkText, paramRows, $, clamp, NOTE, result: {}, VM, recompute };
    if (def.key === "food") c.F = FoodModel.savedParams() || { ...FoodModel.DEFAULTS };
    let perIcon = 1, cursor = null, playing = false, rafId = 0;
    // Macro or Micro mode, from the Attribute page on
    const hasModes = at("attribute"), microOnly = !!def.microOnly;   // microOnly: the Clothing page, whose weather is Micro's alone
    let mode = "macro";
    // Micro for the next recompute only: pressing Micro (or ?mode=micro in the address) asks for it
    let microAsked = hasModes && new URLSearchParams(location.search).get("mode") === "micro";
    const syncMode = () => { for (const b of document.querySelectorAll(".mode-seg button")) b.setAttribute("aria-pressed", b.dataset.mode === mode); document.body.dataset.mode = mode; };

    function loadSettings() {
      const hp = HerdModel.savedParams(), hs = HerdModel.savedStart(), up = HumanModel.savedParams(), us = HumanModel.savedStart();
      c.saved = { herd: !!hp, humans: !!up };
      c.HP = hp || { ...HerdModel.DEFAULTS }; c.HS = hs || { ...HerdModel.START };
      c.EQ = HerdModel.equilibria(c.HP);
      perIcon = Math.max(1, Math.ceil(Math.max(c.HP.K * 1.5, c.HS.N0) / MAX_ICONS));
      c.UP = up || { ...HumanModel.DEFAULTS }; c.US = us || { ...HumanModel.START };
      if (def.key !== "food") { const fp = FoodModel.savedParams(); c.saved.food = !!fp; c.F = fp || { ...FoodModel.DEFAULTS }; }
      if (at("attribute")) { c.roles = RolesModel.current(); c.priority = RolesModel.currentPriority(); }
      if (at("attribute")) { const mp = MapModel.savedParams(); c.saved.map = !!mp; c.M = mp || { ...MapModel.DEFAULTS }; c.travel = MapModel.travelOf(c.M); }
      // The settings pages up to this one: this page's own (S, which its sliders keep in range), and
      // the earlier ones as they saved them
      c.set = {};
      for (const name of Object.keys(SPECS)) {
        if (!at(name)) continue;
        if (name === def.key) { c.set[name] = S; continue; }
        const r = readSaved(SPECS[name]);
        c.set[name] = r.values; c.saved[name] = r.saved;
      }
      c.A = c.set.attribute; c.IH = c.set.inheritance; c.ED = c.set.education; c.RS = c.set.resources; c.CR = c.set.craft;
    }
    // The simulation options this page's place in the chain switches on (see village-model.js)
    function optionsOf() {
      const { A } = c, o = { travel: c.travel || null, roles: c.roles || null, priority: c.priority || null };
      if (A) { o.attrs = { power: A.power, intel: A.intel }; o.elderAttr = 1 - A.elderPenalty / 100; }
      if (at("inheritance")) o.inherit = c.IH;
      if (at("education")) o.school = schoolOf(c.ED);
      if (at("happiness")) o.happiness = happinessOf(c.set.happiness);
      if (at("resources")) { o.resources = resourcesOf(c.RS); o.skills = skillsOf(c.RS); }
      if (at("craft")) { o.craft = craftOf(c.CR); o.kit = { tier: 2, blade: c.CR.startBlades, fork: c.CR.startForks, clothes: c.CR.startClothes, hat: c.CR.startHats }; }
      if (at("clothing")) { const K = c.set.clothing; o.cold = coldOf(K); o.rain = rainOf(K); }
      if (at("strategy") && window.StrategyModel) { const G = c.set.strategy; o.player = { id: StrategyModel.STRATEGIES[G.strategy - 1].id, handsOff: G.handsOff, runDays: T }; }
      if (at("watering")) { const V = c.set.watering; o.water = { cap: V.wellCap, ground: V.wellGround, use: V.waterUse, at: V.waterAt, growth: Array.from({ length: 11 }, (_, k) => V["g" + k]) }; }
      return o;
    }

    // ---------- Sliders ----------
    function syncInputs() {
      for (const inp of inputs) {
        const obj = inp.obj === "F" ? c.F : S, { lo, hi, step } = inp;
        let v = clamp(Number(obj[inp.key]), lo, hi);
        if (!isFinite(v)) v = (inp.obj === "F" ? FoodModel.DEFAULTS : S_DEFAULTS)[inp.key];
        v = inp.round === "int" ? Math.round(v) : inp.round === "none" ? v : Number((Math.round(v / step) * step).toFixed(2));
        obj[inp.key] = v;
        if (inp.choices) {
          $(inp.id + "-seg").innerHTML = inp.choices.map(([val, label]) => `<button type="button" data-t="${val}" aria-pressed="${v === val}">${label}</button>`).join("");
          continue;
        }
        if (inp.tiers) {
          $(inp.id + "-seg").innerHTML = [1, 2, 3, 4].filter((t) => t >= lo && t <= hi).map((t) => `<button type="button" data-t="${t}" aria-pressed="${v === t}" title="${HerdModel.TIERS[t].en} (${t})">${HerdModel.TIERS[t].code}</button>`).join("");
          continue;
        }
        const range = $(inp.id + "-range"), num = $(inp.id + "-num");
        num.min = lo; num.max = hi; num.step = step;
        if (range) { range.min = lo; range.max = hi; range.step = step; range.value = v; }
        if (document.activeElement !== num) num.value = Number.isInteger(v) ? v : +v.toFixed(2);
      }
      if (c.F) c.F.riceYear = FoodModel.riceYearOf(c.F);
    }
    let inputTimer = 0;
    for (const inp of inputs) {
      const changed = (v) => {
        if (!isFinite(v)) return;
        (inp.obj === "F" ? c.F : S)[inp.key] = v;
        clearTimeout(inputTimer);
        inputTimer = setTimeout(recompute, 80);
      };
      if (inp.tiers || inp.choices) {
        $(inp.id + "-seg").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (b) { changed(Number(b.dataset.t)); syncInputs(); } });
        continue;
      }
      if ($(inp.id + "-range")) $(inp.id + "-range").addEventListener("input", (e) => { $(inp.id + "-num").value = e.target.value; changed(Number(e.target.value)); });
      $(inp.id + "-num").addEventListener("input", (e) => { if (e.target.value !== "") changed(Number(e.target.value)); });
      $(inp.id + "-num").addEventListener("change", syncInputs);
    }

    // ---------- Running the village ----------
    // The village's herds, as a run takes them
    const herdsOf = () => ({ cowAdults: c.result.cows.main.adults, cowTiers: c.result.cows.main.tiers, sheepAdults: c.result.sheep ? c.result.sheep.main.adults : null, sheepTiers: c.result.sheep ? c.result.sheep.main.tiers : null });
    // The page's village with some options changed (the Strategy page's players), cached per set of
    // options. One not run yet comes back null and waits in `queued`: once the page is drawn, runQueued
    // runs them one a turn and draws the panels again as each comes in.
    let summaries = new Map(), queued = new Map();
    // A run kept for the comparisons: whether it survived, when it died out, its last day, the people then, its totals
    const summary = (r) => ({ survived: r.survived, extinctDay: r.extinctDay, last: r.last, end: r.counts[r.last] || 0, counts: r.counts, tally: r.tally });
    function summaryWith(over) {
      const cfg = { ...c.cfg, ...over };
      const key = cacheKey(cfg);
      if (summaries.has(key)) return summaries.get(key);
      if (!queued.has(key)) queued.set(key, cfg);
      return null;
    }
    c.summaryWith = summaryWith;
    // The queued runs: in parallel on a pool of Web Workers (village-worker.js) where the page can make
    // them, else (a page opened from a file, say) one a turn here. A new computation ends the old pool.
    const POOL = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    let pool = [];
    const endPool = () => { for (const w of pool) w.terminate(); pool = []; };
    const runCfg = (cfg) => ({ ...cfg, ...(microOnly ? { mode: "micro" } : {}), seed: c.base, detailed: false, ...herdsOf() });
    function runHere(token) {
      const step = () => {
        if (token !== job) return;
        const next = queued.entries().next();
        if (next.done) return;
        const [key, cfg] = next.value;
        summaries.set(key, summary(VM.run(runCfg(cfg))));
        queued.delete(key);
        drawPanelsAll();
        if (queued.size) setTimeout(step, 0);
      };
      if (queued.size) setTimeout(step, 0);
    }
    function runQueued(token) {
      endPool();
      if (!queued.size) return;
      const jobs = [...queued.entries()];
      let next = 0;
      const fallBack = () => { if (token !== job) return; endPool(); runHere(token); };
      const give = (w) => {
        if (token !== job || next >= jobs.length) return;
        const [key, cfg] = jobs[next++];
        w.onmessage = (e) => {
          if (token !== job) return;
          summaries.set(key, e.data);
          queued.delete(key);
          drawPanelsAll();
          give(w);
        };
        w.postMessage({ cfg: { ...runCfg(cfg), travel: null }, map: cfg.travel ? c.M : null });
      };
      try {
        for (let i = 0; i < Math.min(POOL, jobs.length); i++) {
          const w = new Worker("village-worker.js");
          w.onerror = fallBack;
          pool.push(w);
          give(w);
        }
      } catch (e) { fallBack(); }
    }

    const cacheKey = (cfg) => JSON.stringify([cfg.attrs, cfg.elderAttr, cfg.inherit, cfg.school, cfg.happiness, cfg.skills, cfg.cold ? { ...cfg.cold, stats: null } : null, cfg.rain ? { ...cfg.rain, sets: null, stats: null } : null, cfg.kit || null, cfg.water || null, cfg.player || null]);
    let job = 0;   // each recompute's number, so a computation still under way stops once it's stale
    function recompute() {
      stop();
      endPool();
      loadSettings();
      syncInputs();
      if (def.beforeRun) def.beforeRun(c);
      if (hasModes) { mode = microOnly || microAsked ? "micro" : "macro"; microAsked = false; syncMode(); }
      const herdBase = S.seed * 7919, base = herdBase + HUMAN_SALT;
      const herd = (salt, tier) => ({ main: VM.runHerd(c.HP, c.HS.N0, herdBase + salt, true, perIcon, tier) });
      const herds = { cows: herd(0, c.HS.cowTier), sheep: def.resources ? herd(SHEEP_SALT, c.HS.sheepTier) : null };
      const cfg = { work, F: c.F, UP: c.UP, US: c.US, ...optionsOf(), ...(def.config ? def.config(c) : {}) };
      store(storeKey, S);
      if (def.key === "food") store(FoodModel.STORE_KEY, c.F);
      runVillages(++job, herds, cfg, base);
    }
    // The village, once the page has had a turn to say so (the last results stay up until it's done).
    // Micro mode runs it person by person, with the same village in Macro mode alongside for the comparison.
    function runVillages(token, herds, cfg, base) {
      const isMicro = mode === "micro";
      showProgress(isMicro);
      setTimeout(() => {
        if (token !== job) return;
        c.cfg = cfg; c.base = base;
        c.result.cows = herds.cows;
        if (herds.sheep) c.result.sheep = herds.sheep;
        const one = { ...cfg, seed: base, ...herdsOf() };
        const main = VM.run({ ...one, mode: isMicro ? "micro" : "macro", detailed: true });
        const macro = isMicro && !microOnly ? VM.run({ ...one, mode: "macro", detailed: false }) : null;
        c.result.people = { main };
        c.result.compare = macro ? { macro: [macro], micro: [main] } : null;
        finish(token);
      }, 0);
    }
    // Once the village is run: the page, with the comparisons (always in Macro mode) as they come in
    function finish(token) {
      summaries = new Map([[cacheKey(c.cfg), summary(c.result.compare ? c.result.compare.macro[0] : c.result.people.main)]]); queued = new Map();
      syncSpeed();
      drawPanelsAll();
      drawStatics();
      drawFrame();
      drawModes();
      runQueued(token);
    }
    // The panels
    function drawPanelsAll() {
      drawPanels();
      if (def.drawPanel) def.drawPanel(c);
    }
    function showProgress(micro) {
      const pill = $("pill-people");
      pill.className = "pill";
      pill.innerHTML = `<span class="dot-key people"></span>${micro ? "Micro mode: running the village person by person…" : "Running the village…"}`;
    }

    // ---------- Panel sections shared by the pages ----------
    const section = (id, title, scope, body) =>
      `<section class="panel-section"${id ? ` id="${id}"` : ""}><div class="section-head"><h2>${title}</h2><p class="scope">${scope}</p></div>${body}</section>`;
    const from = (href, name) => `From the <b><a href="${href}">${name}</a></b>`;
    const change = (href, name) => `<div class="btn-row"><a class="btn" href="${href}">Change on ${name} →</a></div>`;
    function panelHTML() {
      let s = "";
      if (at("craft")) s += section("resources", "Resources and skills", from("resources.html#resources", "Resources page"),
        `<dl class="params" id="res-params"></dl>
        <p class="hint">After the food work, grown-ups with Power left to spare collect, one to a sheep and a few at a time at the mine and the forest: at 採石 / 羊毛 women shear and men quarry, at 伐木 both cut timber, each taking whichever of their two fewer people are collecting so far today. Every Power spent on a job is 1 exp in its skill, and each level above 0 brings in more for the same Power: more milk, more rice from a field, more wool from a sheep.</p>
        <p class="source" id="res-source" hidden></p>${change("resources.html#resources", "Resources")}`);
      if (at("resources")) s += section("happiness", "Happiness", from("happiness.html#happiness", "Happiness page"),
        `<dl class="params" id="happy-params"></dl>
        <p class="hint">Happiness (0–100) is the base − ⌊Intelligence ÷ the step⌋ (at least 0), plus ⌊the Power left unspent the day before ÷ the Power step⌋; each person's chance of a child goes by it, and couples last for life.</p>
        <p class="source" id="happy-source" hidden></p>${change("happiness.html#happiness", "Happiness")}`);
      if (at("happiness")) s += section("education", "Education", from("education.html#education", "Education page"),
        `<dl class="params" id="edu-params"></dl>
        <p class="hint">The village appoints a scholar for each child, the highest Intelligence first, while the others can spare them. The children are split evenly among them each day, and a class's lesson is shared out among its children. Scholars spend what's left on poetry.</p>
        <p class="source" id="edu-source" hidden></p>${change("education.html#education", "Education")}`);
      if (at("education")) s += section("inheritance", "Inheritance", from("inheritance.html#inheritance", "Inheritance page"),
        `<p class="start-line" id="attr-start"></p><dl class="params" id="inherit-params"></dl>
        <p class="hint">A newborn's Power and Intelligence are each h × the average of ${at("happiness") ? "their parents'" : "an adult man and woman drawn at random"}, give or take the variation.</p>
        <p class="source" id="inherit-source" hidden></p>
        <div class="btn-row"><a class="btn" href="inheritance.html#inheritance">Change on Inheritance →</a><a class="btn" href="attribute.html#attributes">Change on Attribute →</a></div>`);
      if (def.key !== "food") s += section("farming", "Food", from("farm.html#farming", "Food page"),
        `<dl class="params" id="food-params"></dl><p class="hint" id="rice-hint"></p><p class="source" id="food-source" hidden></p>
        ${change("farm.html#farming", "Food")}
        <dl class="foods two"><dt>Milk</dt><dd id="milk-cow"></dd><dt>Rice</dt><dd>harvest, days 181–${HARVEST_LAST}</dd></dl>
        <p class="hint">Everyone needs their Power in food a day. The children eat their need first, milk first; then the grown-ups eat theirs from what's left, whatever spoils soonest, and short of it each gets the same share of their need. Leftovers are stored until they spoil. ${at("inheritance") ? "With the grown-ups fed too, the children drink all the milk left: extra milk, which buys them Power." : ""}</p>`);
      if (!none) s += section("work", "Work", "Everyone spends their day's Power; children help when needed",
        `<dl class="foods"><dt></dt><dd class="h">Needs</dd><dd class="h v">Days</dd>
          <dt>Milk</dt><dd id="milk-work"></dd><dd class="v">all year</dd>
          <dt>Rice</dt><dd><span id="rice-who">adults</span>: tending, then harvest</dd><dd class="v">1–270</dd></dl>
        <p class="hint">${`Work is counted in <b>Power</b> spent: a person spends up to all their Power in a day (${fmt(DAY_ENERGY)} at 100 Power), back in full each morning. The jobs go in the <b>Priority</b> order (milk, then the fields, by default). Each adult cow takes one milker for the day, who milks it while their Power lasts (a cow has no limit), first anyone who may milk but not farm (by the Jobs table); grown-ups without a cow, or with Power left, go to the fields. <b>Tending</b> (days 1–180): one person to each of the 4 fields a day, whoever has the most Power left first, each up to the field's daily limit; a field gives the Power spent tending it × rice effectiveness, up to its yearly limit. <b>Harvest</b> (days 181–270): one person to a field again, and each ${fmt(DAY_ENERGY)} Power brings in ${fmt(VM.HARVEST_PER_HAND)} rice until the field is bare; rice still standing after day 270 is lost. Days 271–360 have no rice work. <span id="kids-work"></span> Who may do which job is set with the <b>Jobs</b> button at the top.`}</p>`);
      if (at("attribute")) s += section("map", "Map", from("map.html#map", "Map page"),
        `<dl class="params" id="map-params"></dl><p class="hint" id="map-hint"></p><p class="source" id="map-source" hidden></p>${change("map.html#map", "Map")}`);
      s += section("", "Cows", from("index.html#shared", "Herd page"),
        `<p class="start-line" id="herd-start"></p><dl class="params" id="herd-params"></dl><p class="source" id="herd-source" hidden></p>${change("index.html#shared", "Herd")}`);
      s += section("", "Humans", from("humans.html#params", "Humans page"),
        `<p class="start-line" id="human-start"></p><dl class="params" id="human-params"></dl><p class="source" id="human-source" hidden></p>${change("humans.html#params", "Humans")}`);
      return s;
    }

    function drawPanels() {
      const { HP, HS, UP, US, EQ, F } = c;
      const source = (id, saved) => { const el = $(id); if (el) { el.hidden = saved; el.textContent = NOTE; } };
      $("herd-params").innerHTML = paramRows([
        ["r", "Intrinsic growth rate", `${fmt(HP.r, 3)} /day`], ["K", "Carrying capacity", fmt(HP.K)], ["A", "Allee threshold", fmt(HP.A)],
        ["L", "Average lifespan", `${fmt(HP.L)} days`], ["±", "Lifespan spread", `${fmt(HP.S)}%`], ["M", "Adult at age", `${fmt(HP.M)} days`],
        ...(EQ.exists ? [["≈", "Settles at", fmt(EQ.hi, 1), "sep"], ["≈", "Tipping point", fmt(EQ.lo, 1)]] : [["!", "No herd can last", "", "sep"]]),
      ]);
      $("human-params").innerHTML = paramRows([
        ["p", "Birth chance", `${UP.p} /day`], ["L", "Average lifespan", `${fmt(UP.L)} days`], ["M", "Adult at age", `${fmt(UP.M)} days`],
        ["E", "Elder at age", `${fmt(UP.E)} days`], ["±", "Lifespan spread", `${fmt(UP.S)}%`],
        ["c", "Food need", `${fmt(UP.c, 1)} /person`, "sep"], ["k", "Hunger toll", `${Number(UP.k.toPrecision(3))} days a food missed`],
      ]);
      const tierName = (t) => `${HerdModel.TIERS[t].code} ${HerdModel.TIERS[t].en}`;
      $("herd-start").innerHTML = `Start with <b>${fmt(HS.N0)} cows</b>` + (def.resources ? ` (${tierName(HS.cowTier)}) and as many sheep (${tierName(HS.sheepTier)})` : "");
      $("human-start").innerHTML = `Start with <b>${fmt(US.men)} men</b> and <b>${fmt(US.women)} women</b>`;
      source("herd-source", c.saved.herd);
      source("human-source", c.saved.humans);

      const milkPerCow = FoodModel.milkPerDay(F), eats = YEAR * UP.c;
      if ($("food-params")) {
        $("food-params").innerHTML = paramRows([
          ["", "Rice effectiveness", `1 Power = ${fmtNum(F.ricePerEnergy)} rice (${fmt(F.riceYear)} a year)`],
          ["", "Food in store at start", `${fmt(F.foodStart)}, never spoils`],
          ["", "Milk keeps", FoodModel.keepText(F.milkKeep)], ["", "Rice keeps", FoodModel.keepText(F.riceKeep)],
          ["", "Milk effectiveness", `1 Power = ${fmtNum(F.milkPerEnergy)} milk`],

          ["", "Rice per field", `at most ${fmt(F.fieldCap)} a year (${fmt(FULL_CREW)} fields)`],
        ]);
        source("food-source", c.saved.food);
        $("milk-cow").textContent = none ? `${milkText(milkPerCow)} a day per adult cow` : "one milker to an adult cow a day, no limit per cow";
        const days = HARVEST_LAST - HARVEST_FIRST + 1, most = FULL_CREW * F.fieldCap;
        $("rice-hint").innerHTML = none
          ? `Harvested evenly over the ${days} harvest days: <b>${milkText(F.riceYear / days)}</b> rice a day. A grown-up eats <b>${milkText(eats)}</b> food a year (a child 70%), so this alone feeds about <b>${fmt(F.riceYear / eats, 1)}</b> grown-ups for a year.`
          : `Each of the ${FULL_CREW} fields gives up to <b>${fmt(F.fieldCap)}</b> rice a year, so at most <b>${fmt(most)}</b>; a field is full at ${fmt(FoodModel.fieldEnergyOf(F), 1)} Power of tending a day. Four standard workers (${fmt(DAY_ENERGY)} Power each) grow ${milkText(F.riceYear)}. At harvest, every ${fmt(DAY_ENERGY)} Power brings in ${fmt(VM.HARVEST_PER_HAND)} rice. A grown-up eats <b>${milkText(eats)}</b> food a year (a child 70%), so a full ${fmt(most)} feeds about <b>${fmt(most / eats, 1)}</b> grown-ups for a year.`;
      }
      if ($("kids-work") && c.roles) {
        const k = c.roles.child, jobs = [k.milk && "milking", (k.tend || k.harvest) && "the fields"].filter(Boolean);
        $("kids-work").innerHTML = (jobs.length
          ? `<b>Children</b> help only when the grown-ups leave work undone (${jobs.join(" and ")}), strongest first.`
          : "<b>Children</b> don't do food work.") +
          (def.school ? (k.teach ? " Whatever Power they don't need goes to class." : " They don't go to class.") : "");
      }
      if ($("rice-who") && c.roles) {
        const who = [["man", "men"], ["woman", "women"], ["oldMan", "old men"], ["oldWoman", "old women"], ["child", "children if needed"]]
          .filter(([r]) => c.roles[r].tend || c.roles[r].harvest).map(([, n]) => n);
        $("rice-who").textContent = who.length ? who.join(", ") : "nobody";
      }
      if ($("milk-work")) $("milk-work").textContent = energy
        ? `${fmtNum(F.milkPerEnergy)} milk per Power, one milker to an adult cow a day`
        : `1 adult or elder per adult cow (${milkText(milkPerCow)} milk a day)`;


      if ($("map-params")) {
        const M = c.M, d = MapModel.distances(M.tiles), tv = c.travel;
        const place = (k) => (isFinite(d[k]) ? `${fmt(d[k])} tiles · ${fmt(tv.between("H", k) * 60)} min each way` : "none on the map");
        const wake = (h) => `${fmt(Math.floor(h))}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
        $("map-params").innerHTML = paramRows([
          ["", "Pasture (milking)", place("P")], ["", "Farm (rice)", place("F")],
          ["", "Mine (stone)", place("M")], ["", "Forest (timber)", place("T")],
          ["", "Walking", `${fmt(M.minPerTile)} min a tile`, "sep"], ["", "Carried home (搬運)", `every ${fmt(tv.load)} Power of collecting`],
          ["", "Up", `between ${wake(tv.wake0)} and ${wake(tv.wake1)}, at random`],
          ["", "Out of the house", `${fmt(tv.active, 1)} h; home for lunch after ${fmt(tv.lunch, 1)} h`],
          ["", "Each meal", `${fmt(tv.meal * 60)} min by the house`],
        ]);
        // A standard worker's day (100 Power and Intelligence: 100 energy at 10 an hour) at each place, fully fed
        const sw = VM.workDay(100, 100);
        const std = (k, collect) => {
          if (!isFinite(d[k])) return "can't get there";
          const cl = DM.newClock(tv), done = DM.workAt(cl, k, DM.canAt(cl, k, sw.energy, sw.rate, tv, collect), sw.rate, tv, collect), tl = DM.dayEnd(cl, tv, done >= DAY_ENERGY - 1e-9);
          const hungry = DM.hungryHours(1, tl, tv) > 1 / 60;
          return `${done >= sw.energy ? `all ${fmt(sw.energy)} Power` : `only <b>${fmt(done)}</b> of ${fmt(sw.energy)} Power`}, ${fmt(cl.walked, 1)} h walking${hungry ? ", home late and hungry" : ""}`;
        };
        $("map-hint").innerHTML = `A standard worker (${fmt(sw.energy)} Power, ${fmt(sw.rate)} an hour) spending the day milking: ${std("P", true)}. Tending the fields: ${std("F", false)}. Everyone walks out, carries home what they collect every ${fmt(tv.load)} Power, comes home for lunch and goes back out, and works until their Power runs out or the day is over, finishing the Power they're on. A meal keeps someone full for half the day, so whoever is out longer goes hungry (it shows, but costs nothing: hunger's toll goes by the food they go without); anyone hungry with no Power left goes in early.`;
        source("map-source", c.saved.map);
      }
      if ($("res-params")) {
        const R = c.RS;
        $("res-params").innerHTML = paramRows([
          ["", "Wool per sheep", `${fmt(R.fleece)}, regrows ${fmt(R.regrow)} a day`],
          ["", "1 Power collects", `${fmtNum(R.woolPerEnergy)} wool · ${fmtNum(R.woodPerEnergy)} timber · ${fmtNum(R.stonePerEnergy)} stone`],
          ["", "Forest / mine tier", `${HerdModel.TIERS[R.forestTier].code} / ${HerdModel.TIERS[R.mineTier].code}`],
          ["", "Skill levels 1–4", `exp ${[R.exp1, R.exp2, R.exp3, R.exp4].map((v) => fmt(v)).join(" / ")} more each · +${[R.bonus1, R.bonus2, R.bonus3, R.bonus4].map((v) => fmt(v)).join(" / ")}%`],
        ]);
        source("res-source", c.saved.resources);
      }
      if ($("happy-params")) {
        const H = c.set.happiness;
        $("happy-params").innerHTML = paramRows([["", "Base happiness", fmt(H.happyBase)], ["", "Intelligence per −1 happiness", fmt(H.iqStep)], ["", "Extra happiness", `⌊Power left ÷ ${fmt(H.joyStep)}⌋`]]);
        source("happy-source", c.saved.happiness);
      }
      if ($("edu-params")) {
        $("edu-params").innerHTML = paramRows([
          ["", "Most scholars", fmt(c.ED.maxScholars)], ["", "Knowledge effectiveness", `1 Power = ${fmtNum(c.ED.knowPerEnergy)} knowledge`], ["", "Knowledge per +1 Intelligence", `(max(${fmt(c.ED.intelPast)}, Intelligence) − ${fmt(c.ED.intelPast)})² + ${fmt(c.ED.knowBase)}`], ["", "Scholar adjustment", `±${fmt(c.ED.scholarShift)}%`],
        ]);
        source("edu-source", c.saved.education);
      }
      if (at("education")) {
        $("attr-start").innerHTML = `Starting grown-ups have <b>Power ${fmt(c.A.power)}</b> and <b>Intelligence ${fmt(c.A.intel)}</b>, from the Attribute page.`;
        $("inherit-params").innerHTML = paramRows([
          ["", "Passed on (h)", `${fmt(c.IH.share, 2)} × average`], ["", "Variation at birth", `±${fmt(c.IH.variation)}%`],
          ["", "Coming-of-age bonus", `+${fmt(c.IH.grow)} each`],
          ["", "Power points dearer past", fmt(c.IH.dearerPast)], ["", "Extra milk per +1 Power", `(max(${fmt(c.IH.dearerPast)}, Power) − ${fmt(c.IH.dearerPast)})² + ${fmt(c.IH.powerBase)}`], ["", "Hunger per −1 Power", `${fmt(c.IH.hungerFood)} food a child goes without`],
        ]);
        $("inherit-source").hidden = c.saved.inheritance && c.saved.attribute;
        $("inherit-source").textContent = "Showing defaults. If you changed those pages and it doesn't show here, your browser keeps each local file's settings separate.";
      }
    }

    // ---------- Cards in <main> ----------
    const inherit = () => !!c.cfg && !!c.cfg.inherit;
    function mainHTML() {
      const card = (label, title, sub, body, cls = "") => `<section class="card${cls ? " " + cls : ""}" aria-label="${label}"><div class="card-head"><h2>${title}</h2><p>${sub}</p></div>${body}</section>`;
      const legend = (items) => `<div class="legend">${items.map(([cls, text]) => `<span><i class="swatch${cls ? " " + cls : ""}"></i>${text}</span>`).join("")}</div>`;
      let s = `<div class="status"><span class="pill" id="pill-cows">—</span><span class="pill" id="pill-people">—</span></div>`;
      if (hasModes) {
        s += card("A day, person by person", "A day, person by person", "Micro mode: the village on one day. Everyone wakes, eats, walks out and works on their own clock. Pick a day and press Play; click a row to find that person on the map.",
          `<div class="mv-pick"><button type="button" class="btn" id="mv-prev" aria-label="Day before">←</button><label for="mv-day">Day</label><input type="number" id="mv-day" min="1" max="${T}" step="1"><button type="button" class="btn" id="mv-next" aria-label="Day after">→</button><button type="button" class="btn" id="mv-farm" title="The day the Farm card is on">Farm's day</button><span class="mv-note" id="mv-note"></span></div><div id="micro-view" class="micro-view"></div>`, "micro-only");
        if (!microOnly) s += card("Macro and Micro", "Macro and Micro", "The same village, worked out for the village as a whole (Macro) and person by person (Micro). Macro is what the other mode draws.",
          `<div class="table-scroll"><table class="mm-table" id="mm-table"></table></div><p class="hint" id="mm-hint"></p>`, "micro-only");
      }
      s += card("Farm", "Farm", "Press Play or drag the slider. Young animals and children are drawn smaller.",
        `<div class="pasture"><canvas id="pasture"></canvas><div class="tag-box readout" id="readout">Day 0</div></div>
        <div class="playbar"><button type="button" class="btn primary play" id="play">Play</button>
          <input type="range" id="day" aria-label="Day" min="0" step="1"><span class="day" id="day-label">day 0</span>
          <div class="speed"><span>Speed</span><div class="seg" role="group" aria-label="Playback speed">
            <button type="button" data-speed="36" aria-pressed="false">1 yr / 10 s</button><button type="button" data-speed="180" aria-pressed="true">1 yr / 2 s</button><button type="button" data-speed="720" aria-pressed="false">1 yr / ½ s</button>
          </div></div></div>
        <p class="events" id="events"></p>`);
      s += card("Numbers over time", "Numbers over time", "Gridlines mark the years (every few years on a narrow screen).",
        `<svg class="chart" id="time-chart" height="320" role="img" aria-label="Cows and people over ${fmt(VM.T)} days"></svg>` +
        legend([["cows", "Cows"], ["people", "People"], ["dash-herd", "Where cows settle"], ["dash-people", none ? "Grown-ups the milk feeds" : "Grown-ups the collected milk feeds"]]));
      if (def.inherit) s += card("Attributes over time", "Attributes over time", "Average Power and Intelligence of this run's adults; children and elders not included.",
        `<svg class="chart" id="attr-chart" height="190" role="img" aria-label="Adults' average Power and Intelligence over ${fmt(VM.T)} days"></svg>` +
        legend([["pow", "Power (力量)"], ["int", "Intelligence (智力)"], ["settle", def.school ? "Where they settle without extra food or school" : "Where they settle without extra food"]]));
      if (def.school) s += card("School", "School", "The scholars and the children's lessons in this run.",
        `<div class="food-rows"><dl class="rows" id="school-day"></dl><dl class="rows" id="school-run"></dl></div>`);
      s += card("Food", "Food in store", none ? "Rice arrives in one burst each autumn and is eaten through the year. Shaded bands are harvests." : "Rice comes in during the autumn harvest and is eaten through the year. Shaded bands are harvests.",
        `<svg class="chart" id="food-chart" height="190" role="img" aria-label="Milk, rice and starting food in store over ${fmt(VM.T)} days"></svg>` +
        legend([["rice", "Rice in store"], ["milk", "Milk in store"], ["start-food", "Starting food left (never spoils)"], ["harvest", `Harvest (days 181–${HARVEST_LAST})`]]) +
        `<div class="food-rows"><dl class="rows" id="food-day"></dl><dl class="rows" id="food-run"></dl></div>`);
      if (def.resources) s += card("Resources", "Resources in store", `Wool, timber and stone the idle grown-ups bring home. ${def.craft ? "The loom and the forge use them up." : "Nothing uses them yet, so they pile up."}`,
        `<svg class="chart" id="res-chart" height="190" role="img" aria-label="Wool, timber and stone in store over ${fmt(VM.T)} days"></svg>` +
        legend([["res-wool", "Wool"], ["res-wood", "Timber"], ["res-stone", "Stone"]]) +
        `<div class="food-rows"><dl class="rows" id="res-day"></dl><dl class="rows" id="res-run"></dl></div>` +
        `<div class="table-scroll"><table class="mm-table tier-table" id="res-tiers"></table></div>`);
      if (def.craft) s += card("Crafts", "Crafts in store", "What the idle grown-ups make at the house, and what's in use: everyone wears 衣 and 笠, harvesters and collectors carry 刀, those tending 叉 (+20% to +100% effectiveness by tier, N to UR). Each wears out with use.",
        `<svg class="chart" id="craft-chart" height="190" role="img" aria-label="Crafted items in store over ${fmt(VM.T)} days"></svg>` +
        legend(CRAFTS.map((it) => [`craft-${it.id}`, `${it.zh} ${it.en}`])) +
        `<div class="food-rows"><dl class="rows" id="craft-day"></dl><dl class="rows" id="craft-run"></dl></div>` +
        `<div class="table-scroll"><table class="mm-table tier-table" id="craft-tiers"></table></div>`);
      if (def.happiness) s += card("Happiness", "Happiness", "Average happiness (0–100) of this run's adults and children through the day. At night each person's Power left that day changes it, and the night's births go by the new happiness; children's is shown for interest.",
        `<svg class="chart" id="happy-chart" height="190" role="img" aria-label="Adults' and children's average happiness over ${fmt(VM.T)} days"></svg>` +
        legend([["happy-adults", "Adults"], ["happy-kids", "Children"]]) +
        `<div class="food-rows"><dl class="rows" id="happy-day"></dl><dl class="rows" id="happy-run"></dl></div>`);
      if (def.skills) s += card("Skills", "Skills", "Average level (0–4) of this run's grown-ups at each skill. Only scholars teach and write poetry, so those two stay low on average; the rows give the highest anyone has.",
        `<svg class="chart" id="skill-chart" height="220" role="img" aria-label="Grown-ups' average level at each skill over ${fmt(VM.T)} days"></svg>` +
        legend(VM.SKILLS.map((sk) => [`skill-${sk.id}`, `${sk.zh} ${sk.en}`])) +
        `<div class="food-rows"><dl class="rows" id="skill-day"></dl><dl class="rows" id="skill-run"></dl></div>`);
      if (!none) s += card("Workers", "Workers", "What the adults and elders of this run do each day. Shaded bands are harvests.",
        `<svg class="chart" id="work-chart" height="190" role="img" aria-label="Adults and elders milking and farming over ${fmt(VM.T)} days"></svg>` +
        legend([["work-milk", "Milking"], ["work-rice", "On the rice"], ...(energy ? [["work-kids", "Children helping"]] : []),
          ["", def.school ? "Adults and elders, not the scholars" : "Adults and elders"], ["work-cows", "Adult cows to milk"]]));
      s += `<div class="stats"><section class="card" aria-label="Cow stats" id="stats-cows"></section><section class="card" aria-label="People stats" id="stats-people"></section></div>`;
      s += `<section class="card impl" id="rules" data-page="${def.key}" aria-label="Implementation details"><div class="card-head"><h2>Implementation details</h2><p>Every rule this page runs, for building it into the game. Numbers are the defaults.</p></div><div class="rules-body"></div></section>`;
      return s;
    }

    function drawVerdict() {
      for (const g of [{ key: "cows", name: "Cows", many: "cows" }, { key: "people", name: "People", many: "people" }]) {
        const r = c.result[g.key], m = r.main, pill = $("pill-" + g.key);
        let text;
        if (m.extinctDay === 0) { pill.className = "pill crash"; text = `No ${g.many}`; }
        else if (m.extinctDay !== null) { pill.className = "pill crash"; text = `${g.name} die out, day ${fmt(m.extinctDay)}`; }
        else if (m.capped) { pill.className = "pill ok"; text = `${g.name} pass ${fmt(MAX_PEOPLE)} by day ${fmt(m.last)}`; }
        else { pill.className = "pill ok"; text = `${g.name}: ${fmt(m.counts[T])} left`; }
        pill.innerHTML = `<span class="dot-key ${g.key}"></span>${mode === "micro" && g.key === "people" ? "Micro · " : ""}${text}`;
      }
    }

    // ---------- Charts ----------
    const scales = {};
    function niceTicks(min, max, count) {
      const raw = (max - min || 1) / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
      const step = (e < 1.5 ? 1 : e < 3 ? 2 : e < 7 ? 5 : 10) * mag, ticks = [];
      for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
      return ticks;
    }
    // Step path that only emits a segment when the count changes
    function stepPath(counts, last, x, y) {
      let prev = counts[0], d = `M${x(0).toFixed(1)} ${y(prev).toFixed(1)}`;
      for (let i = 1; i <= last; i++) if (counts[i] !== prev) { prev = counts[i]; d += `H${x(i).toFixed(1)}V${y(prev).toFixed(1)}`; }
      return d + `H${x(last).toFixed(1)}`;
    }
    // A chart's frame: scales, gridlines, year labels and axes. Returns { s, x, y, W, H, m }.
    function frame(svgId, H, yMax, opts = {}) {
      const svg = $(svgId), W = Math.max(280, svg.clientWidth || 640);
      const m = opts.m || { l: 44, r: 62, t: 12, b: 34 };
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const x = (t) => m.l + (t / T) * (W - m.l - m.r);
      const y = (v) => m.t + (1 - Math.min(v, yMax) / yMax) * (H - m.t - m.b);
      let s = "";
      if (opts.harvest) for (let yr = 0; yr < T / YEAR; yr++) {
        const a = yr * YEAR + HARVEST_FIRST, b = yr * YEAR + HARVEST_LAST;
        s += `<rect class="harvest" x="${x(a)}" y="${m.t}" width="${Math.max(1, x(b) - x(a))}" height="${y(0) - m.t}"/>`;
      }
      for (const v of niceTicks(0, yMax, opts.ticks || 4)) {
        s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
        s += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
      }
      // Day labels (and year lines) every 1, 2, 5, 10… years, as far apart as fits
      const yearPx = (W - m.l - m.r) / (T / YEAR), every = [1, 2, 5, 10, 20, 50, 100].find((k) => k * yearPx >= 48) || 100;
      for (let yr = 0; yr <= T / YEAR; yr += every) {
        if (opts.yearLines && yr > 0 && yr < T / YEAR) s += `<line class="gridline" x1="${x(yr * YEAR)}" x2="${x(yr * YEAR)}" y1="${m.t}" y2="${y(0)}"/>`;
        s += `<text x="${x(yr * YEAR)}" y="${H - m.b + 16}" text-anchor="middle">${fmt(yr * YEAR)}</text>`;
      }
      s += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
      s += `<text class="axis-title" x="${W - m.r}" y="${H - 4}" text-anchor="end">Day</text>`;
      if (opts.yTitle) s += `<text class="axis-title" transform="translate(11 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">${opts.yTitle}</text>`;
      return { svg, s, x, y, W, H, m, step: Math.max(1, Math.floor(T / (W - m.l - m.r))) };
    }
    const cursorLine = (id, f) => `<line class="cursor" id="${id}" y1="${f.m.t}" y2="${f.y(0)}"/>`;

    function drawTimeChart() {
      const pm = c.result.people.main, cows = c.result.cows.main, EQ = c.EQ;
      // How many grown-ups the milk could fully feed each day: the cows' milk, or the milk collected
      const last = none ? T : pm.last, feeds = new Float32Array(T + 1);
      for (let i = 0; i <= last; i++) feeds[i] = c.UP.c > 0 ? (none ? VM.milkGiven(c.F, cows, i) : pm.made[i]) / c.UP.c : 0;
      let yMax = Math.max(c.HS.N0, c.US.men + c.US.women, 5);
      if (EQ.exists) yMax = Math.max(yMax, EQ.hi);
      for (let i = 0; i <= last; i++) if (feeds[i] > yMax) yMax = feeds[i];
      for (const key of ["cows", "people"]) { const mr = c.result[key].main; for (let i = 0; i <= mr.last; i++) if (mr.counts[i] > yMax) yMax = mr.counts[i]; }
      const f = frame("time-chart", 320, yMax * 1.1, { m: { l: 44, r: 62, t: 14, b: 38 }, ticks: 5, yearLines: true, yTitle: "Count" });
      const { x, y, W, m } = f;
      let s = `<defs><clipPath id="plot"><rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${f.H - m.t - m.b}"/></clipPath></defs>` + f.s;
      if (EQ.exists && EQ.hi <= yMax * 1.1) {
        s += `<line class="kline" x1="${m.l}" x2="${W - m.r}" y1="${y(EQ.hi)}" y2="${y(EQ.hi)}"/>`;
        s += `<text class="klabel reflabel" x="${W - m.r + 6}" y="${y(EQ.hi) + 4}">cows ${fmt(EQ.hi, 1)}</text>`;
      }
      s += `<path class="fedline" fill="none" d="${stepPath(feeds, last, x, y)}"/>`;
      // Keep the two margin labels apart when the lines are close
      const fedEnd = feeds[last];
      let milkY = y(fedEnd) + 4;
      if (EQ.exists && EQ.hi <= yMax * 1.1 && Math.abs(milkY - (y(EQ.hi) + 4)) < 13) milkY = y(EQ.hi) + 4 + (fedEnd > EQ.hi ? -13 : 13);
      s += `<text class="fedlabel reflabel" x="${W - m.r + 6}" y="${milkY}">milk ${fmt(fedEnd, fedEnd < 10 && fedEnd % 1 ? 1 : 0)}</text>`;
      s += `<g clip-path="url(#plot)">`;
      for (const key of ["cows", "people"]) { const mr = c.result[key].main; s += `<path class="main ${key}" d="${stepPath(mr.counts, mr.last, x, y)}"/>`; }
      s += `</g>` + cursorLine("cur-line", f);
      for (const key of ["cows", "people"]) s += `<circle class="dot ${key}" id="cur-${key}" r="4.5"/>`;
      f.svg.innerHTML = s;
      scales.time = f;
    }

    function drawFoodChart() {
      const pm = c.result.people.main;
      let yMax = 50;
      for (let i = 0; i <= pm.last; i++) yMax = Math.max(yMax, pm.riceStored[i], pm.stored[i], pm.foodStored[i]);
      const f = frame("food-chart", 190, yMax * 1.1, { harvest: true }), { x, y, step } = f;
      let rice = "", milk = "", food = "";
      for (let i = 0; i <= pm.last; i += step) {
        const px = x(i).toFixed(1), m = i ? "L" : "M";
        rice += m + px + " " + y(pm.riceStored[i]).toFixed(1);
        milk += m + px + " " + y(pm.stored[i]).toFixed(1);
        food += m + px + " " + y(pm.foodStored[i]).toFixed(1);
      }
      const lastX = x(Math.floor(pm.last / step) * step).toFixed(1);
      f.svg.innerHTML = f.s + `<path class="rice-area" d="${rice}L${lastX} ${y(0)}L${x(0)} ${y(0)}Z"/><path class="rice-line" d="${rice}"/><path class="milk-line" d="${milk}"/><path class="start-food-line" d="${food}"/>` +
        cursorLine("food-line", f) + `<circle class="dot rice" id="food-dot" r="4"/>`;
      scales.food = f;
    }

    // Milkers stacked under rice hands (and children helping), with all grown-ups and the adult cows to milk as lines
    function drawWorkChart() {
      const pm = c.result.people.main;
      let yMax = 5;
      for (let i = 0; i <= T; i++) yMax = Math.max(yMax, pm.adults[i], pm.cows[i], pm.milkers[i] + pm.farm[i] + pm.kidsWork[i]);
      const f = frame("work-chart", 190, yMax * 1.1, { harvest: true, yTitle: "People" }), { x, y, step } = f;
      const days = [];
      for (let i = 0; i <= T; i += step) days.push(i);
      if (days[days.length - 1] !== T) days.push(T);
      const line = (val) => days.map((i, k) => (k ? "L" : "M") + x(i).toFixed(1) + " " + y(val(i)).toFixed(1)).join("");
      const back = (val) => days.slice().reverse().map((i) => "L" + x(i).toFixed(1) + " " + y(val(i)).toFixed(1)).join("");
      const milkTop = (i) => pm.milkers[i], riceTop = (i) => pm.milkers[i] + pm.farm[i];
      let s = f.s + `<path class="work-milk" d="${line(milkTop)}${back(() => 0)}Z"/><path class="work-rice" d="${line(riceTop)}${back(milkTop)}Z"/>`;
      if (energy) s += `<path class="work-kids" d="${line((i) => riceTop(i) + pm.kidsWork[i])}${back(riceTop)}Z"/>`;
      s += `<path class="work-cows" d="${line((i) => pm.cows[i])}"/><path class="work-adults" d="${line((i) => pm.adults[i])}"/>`;
      f.svg.innerHTML = s + cursorLine("work-line", f) + `<circle class="dot" id="work-dot" r="4"/>`;
      scales.work = f;
    }

    // Adults' average Power and Intelligence, with where they settle without extra food (or school)
    function drawAttrChart() {
      const pm = c.result.people.main, IH = c.cfg.inherit;
      const settle = IH.share < 1 ? IH.grow / (1 - IH.share) : Infinity, settles = isFinite(settle) ? [["Power", settle], ["Int", settle]] : [];
      const end = pm.extinctDay !== null ? pm.extinctDay : pm.last;
      let yMax = Math.max(c.A.power, c.A.intel, ...settles.map(([, v]) => v), 10);
      for (let i = 0; i <= end; i++) { if (pm.pow[i] > yMax) yMax = pm.pow[i]; if (pm.int[i] > yMax) yMax = pm.int[i]; }
      const f = frame("attr-chart", 190, yMax * 1.1), { x, y, W, m, step } = f;
      let s = f.s;
      settles.forEach(([name, v], k) => {
        const close = k === 1 && Math.abs(v - settles[0][1]) < yMax * 0.06;   // nudge a label that would sit on the other
        s += `<line class="settle-line" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
        s += `<text class="reflabel" x="${W - m.r + 6}" y="${y(v) + (close ? (v < settles[0][1] ? 13 : -5) : 4)}">${name} ${fmt(v)}</text>`;
      });
      const path = (arr) => {   // gaps where there are no adults
        let d = "", pen = false;
        for (let i = 0; i <= end; i += step) {
          const v = arr[i];
          if (!isFinite(v)) { pen = false; continue; }
          d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1);
          pen = true;
        }
        return d;
      };
      f.svg.innerHTML = s + `<path class="int-line" d="${path(pm.int)}"/><path class="pow-line" d="${path(pm.pow)}"/>` + cursorLine("attr-line", f) + `<circle class="dot pow" id="attr-dot" r="4"/>`;
      scales.attr = f;
    }

    // Adults' and children's average happiness, 0 to 10, with gaps where there are none
    function drawHappyChart() {
      const pm = c.result.people.main, f = frame("happy-chart", 190, VM.MAX_HAPPY, { ticks: 5 }), { x, y, step } = f;
      const path = (arr) => {
        let d = "", pen = false;
        for (let i = 1; i <= pm.last; i += step) {
          const v = arr[i];
          if (!isFinite(v)) { pen = false; continue; }
          d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1);
          pen = true;
        }
        return d;
      };
      f.svg.innerHTML = f.s + `<path class="res-line happy-kids" d="${path(pm.happyKids)}"/><path class="res-line happy-adults" d="${path(pm.happy)}"/>` +
        cursorLine("happy-line", f) + `<circle class="dot happy-adults" id="happy-dot" r="4"/>`;
      scales.happy = f;
    }
    // Grown-ups' average level at each skill, 0 to 4, with gaps where there are none
    function drawSkillChart() {
      const pm = c.result.people.main, f = frame("skill-chart", 220, VM.MAX_LEVEL, { ticks: VM.MAX_LEVEL }), { x, y, step } = f;
      const path = (arr) => {
        let d = "", pen = false;
        for (let i = 1; i <= pm.last; i += step) {
          const v = arr[i];
          if (!isFinite(v)) { pen = false; continue; }
          d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1);
          pen = true;
        }
        return d;
      };
      f.svg.innerHTML = f.s + VM.SKILLS.map((sk, k) => `<path class="res-line skill-${sk.id}" d="${path(pm.skillAvg[k])}"/>`).join("") +
        cursorLine("skill-line", f) + `<circle class="dot skill-milk" id="skill-dot" r="4"/>`;
      scales.skill = f;
    }
    // Several of the main run's series as lines (series: [[css class, array]]), with a cursor dot on the
    // one in dotClass; minTop: the least the y-axis reaches
    function drawLines(name, series, dotClass, minTop) {
      const pm = c.result.people.main;
      let yMax = minTop;
      for (const [, arr] of series) for (let i = 0; i <= pm.last; i++) yMax = Math.max(yMax, arr[i]);
      const f = frame(name + "-chart", 190, yMax * 1.1), { x, y, step } = f;
      f.svg.innerHTML = f.s + series.map(([cls, arr]) => {
        let d = "";
        for (let i = 0; i <= pm.last; i += step) d += (i ? "L" : "M") + x(i).toFixed(1) + " " + y(arr[i]).toFixed(1);
        return `<path class="res-line ${cls}" d="${d}"/>`;
      }).join("") + cursorLine(name + "-line", f) + `<circle class="dot ${dotClass}" id="${name}-dot" r="4"/>`;
      scales[name] = f;
    }
    // A day's counts by tier, as a table: rows of [name, count of tier t (0 to tiers − 1), ...the last columns]
    function tierTable(id, day, lasts, rows, tiers = 4) {
      const ts = Array.from({ length: tiers }, (_, k) => k);
      const head = ts.map((t) => `<th class="n">${HerdModel.TIERS[t + 1].code}<small>${HerdModel.TIERS[t + 1].en}</small></th>`).join("");
      $(id).innerHTML = `<thead><tr><th>Day ${fmt(day)}, by tier</th>${head}${lasts.map((l) => `<th class="n">${l}</th>`).join("")}</tr></thead><tbody>` +
        rows.map(([name, get, ...ends]) => `<tr><td>${name}</td>${ts.map((t) => `<td class="n">${fmt(get(t))}</td>`).join("")}${ends.map((e) => `<td class="n">${e}</td>`).join("")}</tr>`).join("") + `</tbody>`;
    }
    function drawResRows() {
      const pm = c.result.people.main, day = currentDay(), i = Math.min(day, pm.last), sh = c.result.sheep.main;
      let wool = 0, stone = 0, wood = 0, work = 0;
      for (let k = 1; k <= pm.last; k++) { wool += pm.woolMade[k]; stone += pm.stoneMade[k]; wood += pm.woodMade[k]; work += pm.resWork[k]; }
      $("res-day").innerHTML = `<dt class="sub">Day ${fmt(day)}</dt>
        <dt>Adult sheep / wool on them</dt><dd>${fmt(sh.adults[day])} / ${day <= pm.last && pm.counts[i] > 0 ? fmt(pm.woolOnSheep[i]) : "—"}</dd>
        <dt>Power spent on resources</dt><dd>${fmt(pm.resWork[i])}</dd>
        <dt>Brought in: wool / timber / stone</dt><dd>${fmt(pm.woolMade[i])} / ${fmt(pm.woodMade[i])} / ${fmt(pm.stoneMade[i])}</dd>
        <dt>In store: wool / timber / stone</dt><dd>${fmt(pm.wool[i])} / ${fmt(pm.wood[i])} / ${fmt(pm.stone[i])}</dd>`;
      // Lots by tier, and the lot still filling (no tier yet)
      const filling = (k, all) => { let n = all[i]; for (let t = 0; t < 4; t++) n -= pm.lots[k][t][i]; return fmt(Math.max(0, n)); };
      tierTable("res-tiers", day, ["Filling"], [["Adult sheep", (t) => pm.sheepTiers[t][i], "—"], ["Wool", (t) => pm.lots[0][t][i], filling(0, pm.wool)],
        ["Timber", (t) => pm.lots[2][t][i], filling(2, pm.wood)], ["Stone", (t) => pm.lots[1][t][i], filling(1, pm.stone)]]);
      $("res-run").innerHTML = `<dt class="sub">Whole run</dt>
        <dt>Power spent on resources</dt><dd>${fmt(work)}</dd>
        <dt>Wool / timber / stone</dt><dd>${fmt(wool)} / ${fmt(wood)} / ${fmt(stone)}</dd>`;
    }
    function drawHappyRows() {
      const pm = c.result.people.main, day = currentDay(), i = Math.min(day, pm.last), has = day > 0 && day <= pm.last;
      const num = (v, d) => (has && isFinite(v) ? fmt(v, d) : "—");
      let born = 0, happy = 0, n = 0, couples = 0;
      for (let k = 1; k <= pm.last; k++) { born += pm.born[k]; couples += pm.couples[k]; if (isFinite(pm.happy[k])) { happy += pm.happy[k]; n++; } }
      $("happy-day").innerHTML = `<dt class="sub">Day ${fmt(day)}</dt>
        <dt>Adults' happiness, on average</dt><dd>${num(pm.happy[i], 2)}</dd>
        <dt>Of it, from the day before's Power left</dt><dd>${has && isFinite(pm.joyAdults[i]) ? "+" + fmt(pm.joyAdults[i], 2) : "—"}</dd>
        <dt>Children's happiness, on average</dt><dd>${num(pm.happyKids[i], 2)}</dd>
        <dt>Adults' happiness tonight, with today's Power left</dt><dd>${num(pm.happyNight[i], 2)}</dd>
        <dt>Couples: fertile / all</dt><dd>${has ? `${fmt(pm.couples[i])} / ${fmt(pm.pairs[i])}` : "—"}</dd>
        <dt>Chance of a child tonight, all couples</dt><dd>${has ? fmt(pm.chance[i], 4) : "—"}</dd>
        <dt>Born tonight</dt><dd>${has ? fmt(pm.born[i]) : "—"}</dd>`;
      $("happy-run").innerHTML = `<dt class="sub">Whole run</dt>
        <dt>Adults' happiness, on average</dt><dd>${n ? fmt(happy / n, 2) : "—"}</dd>
        <dt>Children born</dt><dd>${fmt(born)}</dd>
        <dt>Born per fertile couple a year</dt><dd>${couples ? fmt((born / couples) * YEAR, 2) : "—"} <small>(${fmt(c.UP.p * YEAR, 2)} at happiness ${fmt(VM.MID_HAPPY)})</small></dd>`;
    }
    function drawSkillRows() {
      const pm = c.result.people.main, day = currentDay(), i = Math.min(day, pm.last), has = day > 0 && day <= pm.last && pm.counts[i] > 0;
      $("skill-day").innerHTML = `<dt class="sub">Day ${fmt(day)}: average · highest · exp today</dt>` + VM.SKILLS.map((sk, k) =>
        `<dt>${sk.zh} ${sk.en}</dt><dd>${has && isFinite(pm.skillAvg[k][i]) ? `${fmt(pm.skillAvg[k][i], 2)} · ${fmt(pm.skillTop[k][i])} · ${fmt(pm.skillExp[k][i])}` : "—"}</dd>`).join("");
      $("skill-run").innerHTML = `<dt class="sub">Whole run: exp earned</dt>` + VM.SKILLS.map((sk, k) => {
        let t = 0;
        for (let d = 1; d <= pm.last; d++) t += pm.skillExp[k][d];
        return `<dt>${sk.zh} ${sk.en}</dt><dd>${fmt(t)}</dd>`;
      }).join("");
    }
    function drawCraftRows() {
      const pm = c.result.people.main, day = currentDay(), i = Math.min(day, pm.last);
      let work = 0, done = 0;
      for (let k = 1; k <= pm.last; k++) { work += pm.craftWork[k]; done += pm.craftDone[k]; }
      $("craft-day").innerHTML = `<dt class="sub">Day ${fmt(day)}</dt>
        <dt>Crafters at work</dt><dd>${fmt(pm.crafting[i])}</dd>
        <dt>Power spent on crafts</dt><dd>${fmt(pm.craftWork[i])}</dd>
        <dt>Finished today</dt><dd>${fmt(pm.craftDone[i])}</dd>
`;
      // In store by tier, how many were in use today, and worn out today and in the whole run
      const wornRun = (k) => { let n = 0; for (let d = 1; d <= pm.last; d++) n += pm.worn[k][d]; return n; };
      tierTable("craft-tiers", day, ["In store", "In use", "Worn out", "Worn out, run"], CRAFTS.map((it, k) =>
        [`${it.zh} ${it.en}`, (t) => pm.craftTiers[k][t][i], fmt(pm.crafts[k][i]), fmt(pm.out[k][i]), fmt(pm.worn[k][i]), fmt(wornRun(k))]), 5);
      $("craft-run").innerHTML = `<dt class="sub">Whole run</dt>
        <dt>Power spent on crafts</dt><dd>${fmt(work)}</dd>
        <dt>Items finished</dt><dd>${fmt(done)}</dd>`;
    }
    function drawStatics() {
      if (!c.result.people) return;
      drawVerdict();
      drawTimeChart();
      drawFoodChart();
      const pm = c.result.people.main;
      if (def.resources) drawLines("res", [["res-wool", pm.wool], ["res-wood", pm.wood], ["res-stone", pm.stone]], "res-stone", 50);
      if (def.craft) drawLines("craft", CRAFTS.map((it, k) => [`craft-${it.id}`, pm.crafts[k]]), "craft-clothes", 5);
      if (!none) drawWorkChart();
      if (def.inherit) drawAttrChart();
      if (def.happiness) drawHappyChart();
      if (def.skills) drawSkillChart();
    }

    function moveCursor(name, lineId, dotId, val) {
      const f = scales[name];
      if (!f) return;
      const cx = f.x(currentDay()).toFixed(1);
      $(lineId).setAttribute("x1", cx); $(lineId).setAttribute("x2", cx);
      const dot = $(dotId), ok = val !== null && isFinite(val);
      dot.setAttribute("visibility", ok ? "visible" : "hidden");
      if (ok) { dot.setAttribute("cx", cx); dot.setAttribute("cy", f.y(val).toFixed(1)); }
    }
    function drawCursors() {
      const day = currentDay(), pm = c.result.people.main, i = Math.min(day, pm.last);
      const f = scales.time;
      if (f) {
        const cx = f.x(day).toFixed(1);
        $("cur-line").setAttribute("x1", cx); $("cur-line").setAttribute("x2", cx);
        for (const key of ["cows", "people"]) {
          const mr = c.result[key].main, dot = $("cur-" + key);
          dot.setAttribute("cx", cx); dot.setAttribute("cy", f.y(mr.counts[Math.min(day, mr.last)]).toFixed(1));
        }
      }
      moveCursor("food", "food-line", "food-dot", pm.riceStored[i]);
      if (def.resources) moveCursor("res", "res-line", "res-dot", pm.stone[i]);
      if (def.craft) moveCursor("craft", "craft-line", "craft-dot", pm.crafts[0][i]);
      if (!none) moveCursor("work", "work-line", "work-dot", pm.adults[day]);
      if (def.inherit) moveCursor("attr", "attr-line", "attr-dot", pm.counts[i] > 0 ? pm.pow[i] : null);
      if (def.happiness) moveCursor("happy", "happy-line", "happy-dot", day > 0 && isFinite(pm.happy[i]) ? pm.happy[i] : null);
      if (def.skills) moveCursor("skill", "skill-line", "skill-dot", day > 0 && isFinite(pm.skillAvg[0][i]) ? pm.skillAvg[0][i] : null);
    }

    // ---------- Rows under the charts ----------
    function shareText(i) {
      const pm = c.result.people.main, r = pm.ration[i];
      if (!(pm.counts[i] > 0) || !isFinite(r)) return "—";
      return r >= 10 ? "999%+" : `${fmt(r * 100)}%`;
    }
    const attrAvg = (i) => {
      const pm = c.result.people.main;
      return !(pm.counts[i] > 0) || !isFinite(pm.pow[i]) ? "—" : `${fmt(pm.pow[i])} / ${fmt(pm.int[i])}`;
    };

    function drawFoodRows() {
      const pm = c.result.people.main, day = currentDay(), i = Math.min(day, pm.last);
      const sum = (arr) => { let t = 0; for (let k = 1; k <= pm.last; k++) t += arr[k]; return t; };
      const doy = VM.dayOfYear(Math.max(1, day));
      const harvest = isHarvest(day) ? ' · <span class="harvest-tag">harvest</span>' : "";
      const idle = pm.adults[i] - pm.farm[i] - pm.milkers[i];
      const crop = day === 0 ? "—" : `${fmt(pm.crop[i] * 100)}%${doy < HARVEST_FIRST ? " so far" : ""}`;
      const made = none ? "made" : "collected", ration = `<dt>Share of need eaten</dt><dd>${isFinite(pm.share[i]) ? `${fmt(pm.share[i] * 100)}%` : "—"}</dd>`;

      $("food-day").innerHTML = `<dt class="sub">Day ${fmt(day)} · day ${doy} of the year${harvest}</dt>` + (none ? "" :
        `<dt>Milking / on the rice / idle</dt><dd>${fmt(pm.milkers[i])} / ${fmt(pm.farm[i])} / ${fmt(idle)}</dd>` +
          `<dt>Children helping</dt><dd>${fmt(pm.kidsWork[i])}</dd>
             <dt>Work done: milking / rice</dt><dd>${fmt(pm.milkWork[i] * DAY_ENERGY)} / ${fmt(pm.farmWork[i] * DAY_ENERGY)} Power</dd>
             <dt>Walking, all workers</dt><dd>${fmt(pm.walk[i], 1)} h</dd>`) +
        `<dt>Milk ${made} / drunk</dt><dd>${milkText(pm.made[i])} / ${milkText(pm.drank[i])}</dd>` + (none ? "" :
          `<dt>This year's crop, of the most</dt><dd>${crop}</dd><dt>Rice still in the field</dt><dd>${milkText(pm.field[i])}</dd>`) +
        `<dt>Rice harvested / eaten</dt><dd>${milkText(pm.riceMade[i])} / ${milkText(pm.riceEaten[i])}</dd>
         <dt>Starting food eaten</dt><dd>${milkText(pm.foodEaten[i])}</dd>
         <dt>In store: milk / rice / starting</dt><dd>${milkText(pm.stored[i])} / ${milkText(pm.riceStored[i])} / ${milkText(pm.foodStored[i])}</dd>${ration}
         <dt>Fed</dt><dd>${shareText(i)}</dd>` + (inherit() ? `<dt>Extra milk to children</dt><dd>${milkText(pm.extra[i])}</dd>` : "");
      $("food-run").innerHTML = `<dt class="sub">Whole run</dt>
        <dt>Milk ${made} / drunk / spoiled</dt><dd>${milkText(sum(pm.made))} / ${milkText(sum(pm.drank))} / ${milkText(sum(pm.spoiled))}</dd>` +
        (none ? `<dt>Rice harvested</dt><dd>${milkText(sum(pm.riceMade))}</dd>` : `<dt>Rice harvested / left in the field</dt><dd>${milkText(sum(pm.riceMade))} / ${milkText(sum(pm.riceLost))}</dd>`) +
        `<dt>Rice eaten / spoiled</dt><dd>${milkText(sum(pm.riceEaten))} / ${milkText(sum(pm.riceSpoiled))}</dd>
         <dt>Starting food eaten / left</dt><dd>${milkText(sum(pm.foodEaten))} / ${milkText(c.F.foodStart - sum(pm.foodEaten))}</dd>` +
        (inherit() ? `<dt>Extra milk to children</dt><dd>${milkText(sum(pm.extra))}</dd>` : "");
    }

    function drawSchoolRows() {
      const pm = c.result.people.main, day = currentDay(), i = Math.min(day, pm.last);
      let taught = 0, gained = 0, picked = 0, schoolDays = 0, read = 0;
      for (let k = 1; k <= pm.last; k++) {
        taught += pm.taught[k]; gained += pm.gained[k]; picked += pm.picked[k]; read += pm.read[k];
        if (isFinite(pm.schInt[k]) && pm.counts[k - 1] > 0) schoolDays++;
      }
      const has = isFinite(pm.schInt[i]) && day > 0;
      $("school-day").innerHTML = `<dt class="sub">Day ${fmt(day)}</dt>
        <dt>Scholars</dt><dd>${has ? fmt(pm.scholars[i]) : "none"}</dd>
        <dt>Brightest scholar's Power / Intelligence</dt><dd>${has ? `${fmt(pm.schPow[i])} / ${fmt(pm.schInt[i])}` : "—"}</dd>
        <dt>Children in class</dt><dd>${has ? fmt(pm.kids[i]) : "—"}</dd>
        <dt>Of them, worked first</dt><dd>${has ? fmt(pm.kidsWork[i]) : "—"}</dd>
        <dt>Lesson</dt><dd>${has && pm.kids[i] ? fmt(pm.lesson[i], 1) + " h" : "—"}</dd>
        <dt>Knowledge taken home</dt><dd>${fmt(pm.taught[i])}</dd>
        <dt>Intelligence gained</dt><dd>+${fmt(pm.gained[i])}</dd>
        <dt>Scholars' poetry</dt><dd>${has ? `${fmt(pm.read[i])} knowledge` : "—"}</dd>`;
      $("school-run").innerHTML = `<dt class="sub">Whole run</dt>
        <dt>Scholars picked</dt><dd>${fmt(picked)}</dd><dt>Days with a scholar</dt><dd>${fmt(schoolDays)}</dd>
        <dt>Knowledge taken home</dt><dd>${fmt(taught)}</dd><dt>Intelligence gained, all children</dt><dd>+${fmt(gained)}</dd>
        <dt>Scholars' poetry</dt><dd>${fmt(read)} knowledge</dd>`;
    }

    // ---------- Farm drawing ----------
    function hash01(n) {
      let t = Math.imul((n + 1) | 0, 0x9e3779b1);
      t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
      t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
      return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
    }
    const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    function drawCow(ctx, cx, cy, s, face, spot, col) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(face * s, s);
      ctx.lineWidth = 1.3 / s; ctx.strokeStyle = col.spot;
      ctx.beginPath(); for (const lx of [-7, -3, 4, 8]) { ctx.moveTo(lx, 3); ctx.lineTo(lx, 11); } ctx.stroke();
      ctx.fillStyle = col.body; ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col.spot;
      ctx.beginPath(); ctx.ellipse(-4 + spot * 4, -2, 3.2, 2.4, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5 - spot * 3, 2, 2.2, 1.8, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col.body; ctx.beginPath(); ctx.ellipse(14, -4, 4.6, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col.muzzle; ctx.beginPath(); ctx.ellipse(17, -2.5, 2.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(11, -7); ctx.lineTo(9, -10); ctx.moveTo(-12, -1); ctx.quadraticCurveTo(-15, 3, -14, 7); ctx.stroke();
      ctx.restore();
    }
    function drawSheep(ctx, cx, cy, s, face, col) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(face * s, s);
      ctx.lineWidth = 1.3 / s; ctx.strokeStyle = col.woolEdge;
      ctx.beginPath(); for (const lx of [-5, -2, 3, 6]) { ctx.moveTo(lx, 3); ctx.lineTo(lx, 9); } ctx.strokeStyle = col.sheepFace; ctx.stroke();
      ctx.strokeStyle = col.woolEdge; ctx.fillStyle = col.wool;
      for (const [bx, by, r] of [[-6, 0, 4.5], [-1, -2.5, 5], [4, 0, 4.5], [0, 2, 5]]) { ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = col.sheepFace; ctx.beginPath(); ctx.ellipse(10, -2, 3.2, 2.6, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Men wear a straight tunic, women a flared dress. Elders have white hair and a stick.
    function drawPerson(ctx, cx, cy, s, male, col, elder) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
      ctx.lineWidth = 1.4 / s; ctx.strokeStyle = col.ink;
      ctx.beginPath(); ctx.moveTo(-2, 5); ctx.lineTo(-2.4, 11); ctx.moveTo(2, 5); ctx.lineTo(2.4, 11); ctx.stroke();
      ctx.fillStyle = male ? col.men : col.women;
      ctx.beginPath();
      if (male) ctx.roundRect ? ctx.roundRect(-4, -6, 8, 12, 2) : ctx.rect(-4, -6, 8, 12);
      else { ctx.moveTo(-3, -6); ctx.lineTo(3, -6); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath(); }
      ctx.fill();
      ctx.fillStyle = col.skin; ctx.beginPath(); ctx.arc(0, -10, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1 / s; ctx.stroke();
      if (elder) {
        ctx.fillStyle = col.hair; ctx.beginPath(); ctx.arc(0, -10, 3.6, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1.4 / s; ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(7.5, 11); ctx.stroke();
      }
      ctx.restore();
    }
    function drawFarm() {
      if (!c.result.people) return;
      const canvas = $("pasture"), w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const day = currentDay(), pm = c.result.people.main, cows = c.result.cows.main, pi = Math.min(day, pm.last);
      const col = {
        body: cssVar("--cow-body"), spot: cssVar("--cow-spot"), muzzle: cssVar("--cow-muzzle"),
        ink: cssVar("--ink"), men: cssVar("--men"), women: cssVar("--women"), skin: cssVar("--skin"), hair: cssVar("--wool"),
        wool: cssVar("--wool"), woolEdge: cssVar("--wool-edge"), sheepFace: cssVar("--sheep-face"),
      };
      const base = clamp(w / 700, 0.75, 1.15), all = [];
      const place = (key, age, kind, extra) => all.push({ kind, age, ...extra, x: 0.03 + hash01(key) * 0.94, y: 0.3 + hash01(key + 1) * 0.62, face: hash01(key + 2) < 0.5 ? 1 : -1, spot: hash01(key + 3) });
      const csnap = cows.snaps[day];
      for (let i = 0; i < csnap.length; i += 2) place(csnap[i] * 16, csnap[i + 1], "cows");
      const ssnap = c.result.sheep ? c.result.sheep.main.snaps[day] : null;
      if (ssnap) for (let i = 0; i < ssnap.length; i += 2) place(ssnap[i] * 16 + 4, ssnap[i + 1], "sheep");
      const psnap = pm.snaps[pi] || new Int32Array(0);
      for (let i = 0; i < psnap.length; i += 3) place(psnap[i] * 16 + 8, psnap[i + 1], "people", { male: psnap[i + 2] === HumanModel.MALE, elder: psnap[i + 1] >= c.UP.E });
      all.sort((a, b) => a.y - b.y);
      for (const a of all) {
        const grown = 0.55 + 0.45 * Math.min(1, a.age / (a.kind === "people" ? c.UP.M : c.HP.M));   // cows and sheep share the herd's adult age
        const s = base * (0.7 + a.y * 0.45) * grown;
        if (a.kind === "cows") drawCow(ctx, a.x * w, a.y * h, s, a.face, a.spot, col);
        else if (a.kind === "sheep") drawSheep(ctx, a.x * w, a.y * h, s * 0.85, a.face, col);
        else drawPerson(ctx, a.x * w, a.y * h, s * 1.05, a.male, col, a.elder);
      }
      const milk = none ? `${fmt(VM.milkGiven(c.F, cows, day))} milk` : `${milkText(pm.made[pi])} milk collected`;
      $("readout").textContent = `Day ${fmt(day)} (year ${fmt(day / YEAR, 1)}) · ${fmt(cows.counts[day])} cows${c.result.sheep ? ` · ${fmt(c.result.sheep.main.counts[day])} sheep` : ""} · ${fmt(pm.counts[pi])} people · ${milk} · ${milkText(pm.riceStored[pi])} rice stored${pm.foodStored[pi] > 0 ? ` · ${milkText(pm.foodStored[pi])} starting food` : ""}`;
      const people = () => {
        if (day > pm.last) return "<b>People</b> run stopped";
        const hungry = pm.hungry[pi] ? ` (${fmt(pm.hungry[pi])} from hunger)` : "";
        const harvest = pm.riceMade[pi] ? ` · <span class="harvest-tag">harvest +${milkText(pm.riceMade[pi])} rice</span>` : "";
        const workText = none ? "" : ` · <span class="w">work: ${fmt(pm.milkers[pi])} milking, ${fmt(pm.farm[pi])} on rice</span>`;
        const joined = pm.joined[pi] ? ` (${fmt(pm.joined[pi])} joined)` : "";
        return `<b>People</b> +${fmt(pm.born[pi] + pm.joined[pi])}${joined} −${fmt(pm.died[pi])}${hungry} · fed ${shareText(pi)}${workText}${harvest}`;
      };
      $("events").innerHTML = day === 0 ? "Day 0: everyone starts at a random age"
        : `Day ${fmt(day)}: <b class="c">Cows</b> +${fmt(cows.born[day])} −${fmt(cows.old[day] + cows.size[day])} · ${people()}`;
    }

    // ---------- Stats ----------
    function drawStats() {
      const day = currentDay(), cr = c.result.cows, m = cr.main;
      let born = 0, old = 0, size = 0, peak = 0, peakDay = 0;
      for (let i = 0; i <= T; i++) { born += m.born[i]; old += m.old[i]; size += m.size[i]; if (m.counts[i] > peak) { peak = m.counts[i]; peakDay = i; } }
      const pm = c.result.people.main, pi = Math.min(day, pm.last);
      const milkRow = none ? `<dt>Milk given</dt><dd>${fmt(VM.milkGiven(c.F, m, day))}</dd>` : `<dt>Milk collected</dt><dd>${milkText(pm.made[pi])}</dd>`;
      $("stats-cows").innerHTML = `<div class="stat-head"><h3><span class="dot-key cows"></span>Cows</h3><span class="big">${fmt(m.counts[day])}<small>on day ${fmt(day)}</small></span></div>
        <dl class="rows"><dt class="sub">On this day</dt>
          <dt>Adults</dt><dd>${fmt(m.counts[day] - m.young[day])}</dd><dt>Calves</dt><dd>${fmt(m.young[day])}</dd>
          <dt>Born</dt><dd>${fmt(m.born[day])}</dd><dt>Died, old age</dt><dd>${fmt(m.old[day])}</dd><dt>Died, herd size</dt><dd>${fmt(m.size[day])}</dd>${milkRow}
          <dt class="sub">Whole run</dt>
          <dt>Max herd</dt><dd>${fmt(peak)} (day ${fmt(peakDay)})</dd><dt>Born</dt><dd>${fmt(born)}</dd><dt>Died, old age</dt><dd>${fmt(old)}</dd><dt>Died, herd size</dt><dd>${fmt(size)}</dd>
          <dt>Outcome</dt><dd>${m.extinctDay === null ? "alive" : m.extinctDay === 0 ? "none" : `died, day ${fmt(m.extinctDay)}`}</dd></dl>`;

      let pBorn = 0, pJoined = 0, died = 0, hungry = 0, pPeak = 0, pPeakDay = 0;
      for (let k = 0; k <= pm.last; k++) { pBorn += pm.born[k]; pJoined += pm.joined[k]; died += pm.died[k]; hungry += pm.hungry[k]; if (pm.counts[k] > pPeak) { pPeak = pm.counts[k]; pPeakDay = k; } }
      const outcome = pm.extinctDay === 0 ? "nobody to start with" : pm.extinctDay !== null ? `died, day ${fmt(pm.extinctDay)}` : pm.capped ? `passed ${fmt(MAX_PEOPLE)}` : "alive";
      $("stats-people").innerHTML = `<div class="stat-head"><h3><span class="dot-key people"></span>People</h3><span class="big">${fmt(pm.counts[pi])}<small>on day ${fmt(day)}</small></span></div>
        <dl class="rows"><dt class="sub">On this day</dt>
          <dt>Men / women</dt><dd>${fmt(pm.men[pi])} / ${fmt(pm.women[pi])}</dd><dt>Boys / girls</dt><dd>${fmt(pm.boys[pi])} / ${fmt(pm.girls[pi])}</dd>
          <dt>Elders</dt><dd>${fmt(pm.elders[pi])}</dd><dt>Couples</dt><dd>${fmt(pm.couples[pi])}</dd><dt>Fed</dt><dd>${shareText(pi)}</dd>
          ${inherit() ? `<dt>Adults' Power / Intelligence</dt><dd>${attrAvg(pi)}</dd>` : ""}
          <dt>Born / joined / died</dt><dd>${fmt(pm.born[pi])} / ${fmt(pm.joined[pi])} / ${fmt(pm.died[pi])}</dd>
          <dt class="sub">Whole run</dt>
          <dt>Max population</dt><dd>${fmt(pPeak)} (day ${fmt(pPeakDay)})</dd><dt>Born</dt><dd>${fmt(pBorn)}</dd><dt>Joined from outside</dt><dd>${fmt(pJoined)}</dd>
          <dt>Died, all causes</dt><dd>${fmt(died)}</dd><dt>Died, hunger</dt><dd>${fmt(hungry)}</dd>
          <dt>Outcome</dt><dd>${outcome}</dd></dl>`;
    }

    // ---------- Playback ----------
    const currentDay = () => clamp(Math.floor(cursor === null ? T : cursor), 0, T);
    function drawFrame() {
      if (!c.result.people) return;
      drawCursors();
      if (def.school) drawSchoolRows();
      drawFoodRows();
      if (def.resources) drawResRows();
      if (def.craft) drawCraftRows();
      if (def.happiness) drawHappyRows();
      if (def.skills) drawSkillRows();
      drawFarm();
      drawStats();
      const day = currentDay();
      $("day").max = T; $("day").value = day; $("day-label").textContent = "day " + fmt(day);
    }
    function stop() {
      playing = false;
      cancelAnimationFrame(rafId);
      if ($("play")) $("play").textContent = "Play";
    }
    const syncSpeed = () => { for (const b of document.querySelectorAll("[data-speed]")) b.setAttribute("aria-pressed", Number(b.dataset.speed) === S.speed); };

    // ---------- Micro mode: the day viewer and the comparison ----------
    let view = null;
    function drawModes() {
      document.body.dataset.mode = hasModes ? mode : "macro";
      if (!hasModes || mode !== "micro" || !c.result.compare) return;
      drawCompare();
      showDay(S.microDay || 100);
    }
    // The village again in Micro mode up to `day`, keeping that day's record, and show it
    function showDay(day) {
      day = clamp(Math.round(Number(day) || 1), 1, T);
      S.microDay = day; store(storeKey, S);
      $("mv-day").value = day;
      const cfg = { ...c.cfg, mode: "micro", seed: c.base, ...herdsOf(), detailed: false, traceDay: day, stopAfter: day };
      VM.run(cfg);
      view = view || MicroView.mount($("micro-view"));
      const doy = VM.dayOfYear(day), when = `Day ${doy} of year ${Math.floor((day - 1) / YEAR) + 1}${doy < HARVEST_FIRST ? ", tending" : isHarvest(day) ? ", harvest" : ""}`;
      if (!cfg.trace || !cfg.trace.people) { view.show(null, { day }); $("mv-note").textContent = `${when}: nobody left in the village.`; return; }
      $("mv-note").textContent = when;
      view.show(cfg.trace, { day });
    }
    function drawCompare() {
      const { macro, micro } = c.result.compare;
      const lived = (r) => { let n = 0; for (let d = 1; d <= r.last; d++) if (r.counts[d - 1] > 0) n++; return n; };
      // The run's totals, per day lived (or per person-day, or for the run)
      const per = (runs, key, by) => { let a = 0, b = 0; for (const r of runs) { a += r.tally[key]; b += by === "people" ? r.tally.peopleDays : by === "run" ? 1 : lived(r); } return b ? a / b : NaN; };
      const attrs = (runs) => { let pw = 0, it = 0, n = 0; for (const r of runs) if (r.tally.attrDays) { pw += r.tally.pow / r.tally.attrDays; it += r.tally.int / r.tally.attrDays; n++; } return n ? [pw / n, it / n] : [NaN, NaN]; };
      const rows = [
        ["People on the last day", (runs) => runs.reduce((t, r) => t + r.counts[r.last], 0) / runs.length, 0, ""],
        ...(energy ? [["Adults' Power, last year", (runs) => attrs(runs)[0], 0, ""], ["Adults' Intelligence, last year", (runs) => attrs(runs)[1], 0, ""]] : []),
        ["Milk collected a day", (runs) => per(runs, "milk"), 1, ""],
        ["Rice harvested a year", (runs) => per(runs, "rice") * YEAR, 0, ""],
        ["Hunger toll, days of life a person a day", (runs) => per(runs, "hunger", "people"), 3, ""],
        ["Walking a day, everyone together", (runs) => per(runs, "walk"), 1, " h"],
        ...(def.resources ? [["Wool brought in a day", (runs) => per(runs, "wool"), 2, ""], ["Stone brought in a day", (runs) => per(runs, "stone"), 2, ""]] : []),
        ...(def.craft ? [["Crafts finished in a run", (runs) => per(runs, "crafts", "run"), 1, ""]] : []),
        ...(def.school ? [["Knowledge children take home a day", (runs) => per(runs, "taught"), 2, ""], ["Intelligence children gain in a run", (runs) => per(runs, "gained", "run"), 1, ""]] : []),
        ...(def.happiness ? [["Children born in a run", (runs) => per(runs, "born", "run"), 1, ""],
          ["Adults' happiness, on average", (runs) => { let t = 0, n = 0; for (const r of runs) if (r.tally.happyDays) { t += r.tally.happy / r.tally.happyDays; n++; } return n ? t / n : NaN; }, 2, ""]] : []),
        ...(def.skills ? [["Grown-ups' average skill level, last year", (runs) => { let t = 0, n = 0; for (const r of runs) if (r.tally.levelDays) { t += r.tally.level / r.tally.levelDays; n++; } return n ? t / n : NaN; }, 3, ""]] : []),
      ];
      $("mm-table").innerHTML = `<thead><tr><th></th><th>Macro</th><th>Micro</th><th>Micro vs Macro</th></tr></thead><tbody>` + rows.map(([label, fn, dp, unit]) => {
        const a = fn(macro), b = fn(micro), diff = isFinite(a) && isFinite(b) ? (Math.abs(a) > 1e-9 ? `${b >= a ? "+" : "−"}${fmt((Math.abs(b - a) / Math.abs(a)) * 100)}%` : b === a ? "same" : "—") : "—";
        const show = (v) => (isFinite(v) ? fmt(v, dp) + unit : "—");
        return `<tr><td>${label}</td><td class="n">${show(a)}</td><td class="n">${show(b)}</td><td class="n">${diff}</td></tr>`;
      }).join("") + "</tbody>";
      $("mm-hint").innerHTML = `Micro follows each person: random waking, walking to each job and back for lunch, a job board in priority order, class only while both are there. Macro works the day out for the village as a whole and copies what that does on average. It takes the grown-ups in a new random order each day, gives each of them their own day's clock (walking, lunch, the end of the day), counts each person's hunger from when they get home, and teaches each child for the hours they'd share with the scholar on average over wake-up times. One village either way is luck: roll new runs to see how much the two differ.`;
    }

    // ---------- Build the page and wire it up ----------
    document.querySelector("aside.panel").insertAdjacentHTML("beforeend", panelHTML());
    document.querySelector("main").innerHTML = mainHTML();
    if (hasModes) {
      // Macro | Micro, next to Roll new runs (not on a Micro-only page)
      if (!microOnly) {
        const seg = document.createElement("div");
        seg.className = "seg mode-seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Simulation mode");
        seg.innerHTML = `<button type="button" data-mode="macro" title="The village worked out as a whole each day: quick">Macro</button><button type="button" data-mode="micro" title="Person by person through the day, with a day viewer: slower">Micro</button>`;
        document.querySelector(".top-actions").insertBefore(seg, $("reroll"));
        seg.addEventListener("click", (e) => {
          const b = e.target.closest("[data-mode]");
          if (!b || b.dataset.mode === mode) return;
          microAsked = b.dataset.mode === "micro";
          recompute();
        });
      }
      syncMode();
      $("mv-day").addEventListener("change", (e) => showDay(e.target.value));
      $("mv-prev").addEventListener("click", () => showDay((S.microDay || 100) - 1));
      $("mv-next").addEventListener("click", () => showDay((S.microDay || 100) + 1));
      $("mv-farm").addEventListener("click", () => showDay(currentDay() || 1));
    }
    $("play").addEventListener("click", () => {
      if (playing) { stop(); return; }
      playing = true;
      $("play").textContent = "Pause";
      const from = cursor === null || cursor >= T ? 0 : cursor;
      let t0 = null;
      const tick = (now) => {
        if (!playing) return;
        if (t0 === null) t0 = now;   // time from the first frame: a frame's timestamp can predate the click
        const day = from + ((now - t0) / 1000) * S.speed;
        cursor = day >= T ? null : Math.floor(Math.max(0, day));
        drawFrame();
        if (cursor === null) stop(); else rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    });
    $("day").addEventListener("input", (e) => { stop(); const v = Number(e.target.value); cursor = v >= T ? null : v; drawFrame(); });
    for (const b of document.querySelectorAll("[data-speed]")) b.addEventListener("click", () => { S.speed = Number(b.dataset.speed); store(def.storeKey, S); syncSpeed(); });
    $("reroll").addEventListener("click", () => { S.seed = 1 + Math.floor(Math.random() * 1e6); recompute(); });

    // (Reset is site.js's, for every page at once)
    // Follow the other pages when they're changed in another tab
    window.addEventListener("storage", (e) => { if (upstream.includes(e.key) || (at("attribute") && (e.key === RolesModel.STORE_KEY || e.key === RolesModel.PRIORITY_KEY))) recompute(); });
    if (at("attribute")) window.addEventListener("roles-change", () => recompute());
    let resizeTimer = 0;
    new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { drawStatics(); drawFrame(); }, 60); }).observe(document.querySelector("main"));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", drawFarm);
    new MutationObserver(drawFarm).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    if (def.setup) def.setup(c);
    recompute();
    return c;
  }

  window.VillagePage = { start, SPECS, CRAFTS, needKey, readSaved, schoolOf };
})();
