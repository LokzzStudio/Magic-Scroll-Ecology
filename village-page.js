// Shared page code for the village pages (Food, Advisor, Production, Attribute, Inheritance, Education,
// Resources, Craft). It reads the settings of the pages before, works out the simulation options from
// the page's place in the chain, draws the read-only panel sections and every card in <main>, runs the
// villages (village-model.js) and handles the charts, the farm, the stats and playback. Each page calls
// VillagePage.start(def) with what's its own:
//   key        "food" | "advisor" | "production" | "attribute" | "inheritance" | "education" | "resources" | "craft"
//   work       "none" | "hands" | "energy"; inherit, school, resources, craft: which cards it shows
//   inputs     its sliders: { id, key, obj: "S" (default) | "F", round: "step" | "int" | "none" }, with
//              lo, hi and step from its settings table (SPECS), or given here
//   storeKey, defaults: where it keeps its settings and their defaults, for pages without a SPECS table
//   setup(c), beforeRun(c), drawPanel(c), compare(c), config(c), ration(c): page hooks
(function () {
  const VM = VillageModel;
  const { T, YEAR, RUNS, MAX_ICONS, MAX_PEOPLE, HUMAN_SALT, FULL_CREW, HARVEST_FIRST, DAY_ENERGY } = VM;
  const { PERFECT_IQ, iqError } = RationModel;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (v, d = 0) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  const fmtNum = (v) => fmt(v, Number.isInteger(v) ? 0 : 2);   // 2 or 2.37
  const milkText = (v) => { const r = Math.round(v * 10) / 10; return fmt(r, r % 1 ? 1 : 0); };
  const paramRows = (rows) => rows.map(([s, label, v, cls = ""]) =>
    `<dt class="${cls}">${s}</dt><dd class="${cls}">${label}</dd><dd class="v ${cls}">${v}</dd>`).join("");
  const compareRows = (title, rows) => `<dt></dt><dd class="h">${title}</dd><dd class="h v"></dd>` +
    rows.map(([label, n, best]) => `<dt></dt><dd>${label}</dd><dd class="v${best ? " best" : ""}">${n}/${RUNS}</dd>`).join("");
  const NOTE = "Showing defaults. If you changed that page and it doesn't show here, your browser keeps each local file's settings separate.";

  // The crafts, for the Craft page's settings and card
  const CRAFTS = [
    { id: "clothes", zh: "衣", en: "Clothes", job: "weave", material: "wool" },
    { id: "hat", zh: "笠", en: "Hat", job: "weave", material: "wool" },
    { id: "blade", zh: "刀", en: "Blade", job: "forge", material: "stone" },
    { id: "fork", zh: "叉", en: "Hayfork", job: "forge", material: "stone" },
  ];
  // The settings pages' own settings, by field: [default, lowest, highest, slider step]. Each page takes
  // its defaults and slider ranges from here; the pages after it read what it saved.
  const SPECS = {
    attribute: { key: "attribute-v4", fields: { power: [100, 0, 300, 5], intel: [100, 0, 300, 5], elderPenalty: [20, 0, 50, 5] } },
    inheritance: { key: "inheritance-v5", fields: { share: [0.7, 0, 1, 0.05], variation: [10, 0, 50, 1], grow: [30, 0, 100, 5], extraCap: [5, 0, 20, 1], powerFoodBase: [15, 1, 100, 1], powerFoodFrom: [100, 0, 300, 5] } },
    education: { key: "education-v1", fields: { knowPerEnergy: [1, 0.1, 5, 0.1], knowPerIntel: [100, 10, 500, 10], readPerIntel: [500, 50, 2000, 50], scholarShift: [10, 0, 50, 5] } },
    resources: { key: "resources-v1", fields: { fleece: [10, 1, 50, 1], regrow: [1, 1, 10, 1], woodTarget: [10, 0, 200, 1], woolPerEnergy: [1, 0.1, 5, 0.1], woodPerEnergy: [1, 0.1, 5, 0.1], stonePerEnergy: [1, 0.1, 5, 0.1] } },
    craft: { key: "craft-v1", fields: Object.fromEntries(CRAFTS.flatMap((it) => [[it.id + "Cost", [100, 1, 1000, 1]], [it.id + "Energy", [20, 1, 200, 1]]])) },
  };
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
  // Simulation options from the Education, Resources and Craft pages' settings
  const schoolOf = (E) => ({ knowPerEnergy: E.knowPerEnergy, knowPerIntel: E.knowPerIntel, readPerIntel: E.readPerIntel, shift: E.scholarShift });
  const resourcesOf = (R) => ({ fleece: R.fleece, regrow: R.regrow, woodTarget: R.woodTarget, perEnergy: { wool: R.woolPerEnergy, stone: R.stonePerEnergy, wood: R.woodPerEnergy } });
  const craftOf = (C) => ({ items: CRAFTS.map((it) => ({ id: it.id, job: it.job, material: it.material, cost: C[it.id + "Cost"], energy: C[it.id + "Energy"] })) });

  // The pages in order; each page reads (and its Reset clears) the settings of the pages before it
  const CHAIN = ["herd", "humans", "food", "advisor", "map", "production", "attribute", "inheritance", "education", "resources", "craft"];
  const KEYS = { herd: HerdModel.STORE_KEY, humans: HumanModel.STORE_KEY, food: FoodModel.STORE_KEY, advisor: RationModel.STORE_KEY, map: MapModel.STORE_KEY,
    ...Object.fromEntries(Object.entries(SPECS).map(([name, spec]) => [name, spec.key])) };
  const SHEEP_SALT = 500000;   // keeps the sheep's dice apart from the cows'

  function start(def) {
    const at = (name) => CHAIN.indexOf(def.key) >= CHAIN.indexOf(name);   // this page or a later one
    const work = def.work, none = work === "none", energy = work === "energy";
    const HARVEST_LAST = VM.harvestLastOf(work);
    const isHarvest = (day) => day >= 1 && VM.dayOfYear(day) >= HARVEST_FIRST && VM.dayOfYear(day) <= HARVEST_LAST;
    const upstream = CHAIN.slice(0, CHAIN.indexOf(def.key)).map((k) => KEYS[k]).filter(Boolean);
    // This page's settings: from its SPECS table if it has one; sliders take their ranges from it too
    const own = SPECS[def.key], storeKey = own ? own.key : def.storeKey;
    const inputs = (def.inputs || []).map((inp) => (own && own.fields[inp.key] ? { lo: own.fields[inp.key][1], hi: own.fields[inp.key][2], step: own.fields[inp.key][3], ...inp } : inp));
    const S_DEFAULTS = { seed: 1, speed: 180, ...(own ? defaultsOf(own) : def.defaults) };
    let S = { ...S_DEFAULTS };
    try { const saved = JSON.parse(localStorage.getItem(storeKey) || "null"); if (saved && typeof saved === "object") S = { ...S, ...saved }; } catch (e) {}
    const store = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} };

    // c: everything the page hooks see
    const c = { def, S, T, YEAR, RUNS, PERFECT_IQ, fmt, fmtNum, milkText, paramRows, compareRows, $, clamp, NOTE, result: {}, VM, recompute };
    if (def.key === "food") c.F = FoodModel.savedParams() || { ...FoodModel.DEFAULTS };
    if (def.key === "advisor") c.R = RationModel.savedParams() || { ...RationModel.DEFAULTS };
    let perIcon = 1, cursor = null, playing = false, rafId = 0;

    function loadSettings() {
      const hp = HerdModel.savedParams(), hs = HerdModel.savedStart(), up = HumanModel.savedParams(), us = HumanModel.savedStart();
      c.saved = { herd: !!hp, humans: !!up };
      c.HP = hp || { ...HerdModel.DEFAULTS }; c.HS = hs || { ...HerdModel.START };
      c.EQ = HerdModel.equilibria(c.HP);
      perIcon = Math.max(1, Math.ceil(Math.max(c.HP.K * 1.5, c.HS.N0) / MAX_ICONS));
      c.UP = up || { ...HumanModel.DEFAULTS }; c.US = us || { ...HumanModel.START };
      if (def.key !== "food") { const fp = FoodModel.savedParams(); c.saved.food = !!fp; c.F = fp || { ...FoodModel.DEFAULTS }; }
      if (at("production")) { const rp = RationModel.savedParams(); c.saved.advisor = !!rp; c.R = rp || { ...RationModel.DEFAULTS }; }
      if (at("production")) c.roles = RolesModel.current();
      if (at("attribute")) c.priority = RolesModel.currentPriority();
      if (at("production")) { const mp = MapModel.savedParams(); c.saved.map = !!mp; c.M = mp || { ...MapModel.DEFAULTS }; c.travel = MapModel.travelOf(c.M); }
      // The settings pages up to this one: this page's own (S, which its sliders keep in range), and
      // the earlier ones as they saved them
      c.set = {};
      for (const name of Object.keys(SPECS)) {
        if (!at(name)) continue;
        if (name === def.key) { c.set[name] = S; continue; }
        const r = readSaved(SPECS[name]);
        c.set[name] = r.values; c.saved[name] = r.saved;
      }
      c.A = c.set.attribute; c.IH = c.set.inheritance; c.ED = c.set.education; c.RS = c.set.resources;
    }
    // The simulation options this page's place in the chain switches on (see village-model.js)
    function optionsOf() {
      const { A, R } = c, o = { travel: c.travel || null, roles: c.roles || null, priority: c.priority || null };
      o.advisor = !at("advisor") ? null : !R.advisor ? null : at("education") ? "scholar" : R.iq;
      if (A) { o.attrs = { power: A.power, intel: A.intel }; o.elderAttr = 1 - A.elderPenalty / 100; }
      if (at("inheritance")) o.inherit = c.IH;
      if (at("education")) o.school = schoolOf(c.ED);
      if (at("resources")) o.resources = resourcesOf(c.RS);
      if (at("craft")) o.craft = craftOf(c.set.craft);
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
        const range = $(inp.id + "-range"), num = $(inp.id + "-num");
        range.min = num.min = lo; range.max = num.max = hi; range.step = num.step = step;
        range.value = v;
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
      $(inp.id + "-range").addEventListener("input", (e) => { $(inp.id + "-num").value = e.target.value; changed(Number(e.target.value)); });
      $(inp.id + "-num").addEventListener("input", (e) => { if (e.target.value !== "") changed(Number(e.target.value)); });
      $(inp.id + "-num").addEventListener("change", syncInputs);
    }

    // ---------- Running the villages ----------
    // Survivors among this page's 20 villages with some options changed; cached per set of options
    let aliveCache = new Map();
    function aliveWith(over) {
      const cfg = { ...c.cfg, ...over };
      const key = JSON.stringify([cfg.advisor, cfg.attrs, cfg.elderAttr, cfg.inherit, cfg.school]);
      if (!aliveCache.has(key)) {
        const base = S.seed * 7919 + HUMAN_SALT, cowRuns = c.result.cows.runs;
        let n = 0;
        for (let i = 0; i < RUNS; i++) if (VM.run({ ...cfg, seed: base + i, detailed: false, cowAdults: cowRuns[i].adults, sheepAdults: sheepOf(i) }).survived) n++;
        aliveCache.set(key, n);
      }
      return aliveCache.get(key);
    }
    c.aliveWith = aliveWith;
    const sheepOf = (i) => (c.result.sheep ? c.result.sheep.runs[i].adults : null);

    function recompute() {
      stop();
      loadSettings();
      syncInputs();
      if (def.beforeRun) def.beforeRun(c);
      const herdBase = S.seed * 7919, base = herdBase + HUMAN_SALT;
      const cowRuns = [];
      for (let i = 0; i < RUNS; i++) cowRuns.push(VM.runHerd(c.HP, c.HS.N0, herdBase + i, i === 0, perIcon));
      c.result.cows = { main: cowRuns[0], runs: cowRuns, alive: cowRuns.filter((r) => r.survived).length };
      if (def.resources) {
        const sheepRuns = [];
        for (let i = 0; i < RUNS; i++) sheepRuns.push(VM.runHerd(c.HP, c.HS.N0, herdBase + SHEEP_SALT + i, i === 0, perIcon));
        c.result.sheep = { main: sheepRuns[0], runs: sheepRuns, alive: sheepRuns.filter((r) => r.survived).length };
      }
      c.cfg = { work, F: c.F, UP: c.UP, US: c.US, ...optionsOf(), ...(def.config ? def.config(c) : {}) };
      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(VM.run({ ...c.cfg, seed: base + i, detailed: i === 0, cowAdults: cowRuns[i].adults, sheepAdults: sheepOf(i) }));
      c.result.people = { main: runs[0], runs, alive: runs.filter((r) => r.survived).length };
      aliveCache = new Map([[JSON.stringify([c.cfg.advisor, c.cfg.attrs, c.cfg.elderAttr, c.cfg.inherit, c.cfg.school]), c.result.people.alive]]);
      if (def.compare) def.compare(c);

      store(storeKey, S);
      if (def.key === "food") store(FoodModel.STORE_KEY, c.F);
      if (def.key === "advisor") store(RationModel.STORE_KEY, c.R);
      syncSpeed();
      drawPanels();
      if (def.drawPanel) def.drawPanel(c);
      drawStatics();
      drawFrame();
    }

    // ---------- The scholar as food advisor (Education page on) ----------
    const firstScholarIQ = () => VM.scholarIQ({ intel: c.A.intel, age: c.UP.M }, c.UP, 1, schoolOf(c.ED));
    const SCHOLAR_RATION = {
      hint: "The scholar is the food advisor, with their Intelligence at work (with the scholar adjustment) as the advisor's IQ. With no scholar, nobody rations: everyone eats what they need until it runs out. Each day the advisor sets a ration: the food in store plus what today's workers will still bring in, spread evenly over the days until the next harvest. Off means everyone eats what they need until it runs out.",
      choice: () => ({ value: "scholar", label: `The scholar (IQ ${fmt(firstScholarIQ())} at the start)` }),
      rows: () => {
        const iq = firstScholarIQ(), err = iqError(iq);
        return {
          rows: [["", "Food advisor", c.R.advisor ? "on: the scholar, if there is one" : "off"], ["", "Advisor IQ", `the scholar's Intelligence at work, ${fmt(iq)} at the start`]],
          hint: !c.R.advisor
            ? "The advisor is off on the Advisor page, so the scholar only teaches and everyone eats what they need until the food runs out."
            : `The first scholar's estimates are typically off by <b>±${fmt(err * 100)}%</b>${err === 0 ? " (spot on)" : ", with a lasting lean one way"}. Each new scholar brings their own lean, and a brighter one estimates better; while there's no scholar, nobody rations. From IQ ${PERFECT_IQ} on, a scholar is spot on.`,
        };
      },
    };
    const rationHint = def.rationHint || (at("education") ? SCHOLAR_RATION.hint : null);
    const rationRows = def.ration || (at("education") ? SCHOLAR_RATION.rows : null);
    const advisorChoice = def.advisorChoice || (at("education") ? SCHOLAR_RATION.choice : null);

    // ---------- Panel sections shared by the pages ----------
    const section = (id, title, scope, body) =>
      `<section class="panel-section"${id ? ` id="${id}"` : ""}><div class="section-head"><h2>${title}</h2><p class="scope">${scope}</p></div>${body}</section>`;
    const from = (href, name) => `From the <b><a href="${href}">${name}</a></b>`;
    const change = (href, name) => `<div class="btn-row"><a class="btn" href="${href}">Change on ${name} →</a></div>`;
    function panelHTML() {
      let s = "";
      if (at("craft")) s += section("resources", "Resources", from("resources.html#resources", "Resources page"),
        `<dl class="params" id="res-params"></dl>
        <p class="hint">Idle grown-ups keep timber at its target, then women shear and men quarry, a load at a time, once every food job is filled.</p>
        <p class="source" id="res-source" hidden></p>${change("resources.html#resources", "Resources")}`);
      if (at("resources")) s += section("education", "Education", from("education.html#education", "Education page"),
        `<dl class="params" id="edu-params"></dl>
        <p class="hint">The village's adult with the highest Intelligence becomes scholar when the others can spare them; they teach the children, spend what's left on poetry, and advise on food.</p>
        <p class="source" id="edu-source" hidden></p>${change("education.html#education", "Education")}`);
      if (at("education")) s += section("inheritance", "Inheritance", from("inheritance.html#inheritance", "Inheritance page"),
        `<p class="start-line" id="attr-start"></p><dl class="params" id="inherit-params"></dl>
        <p class="hint">A newborn's Power and Intelligence are each h × the average of an adult man and woman drawn at random, give or take the variation.</p>
        <p class="source" id="inherit-source" hidden></p>
        <div class="btn-row"><a class="btn" href="inheritance.html#inheritance">Change on Inheritance →</a><a class="btn" href="attribute.html#attributes">Change on Attribute →</a></div>`);
      if (def.key !== "food") s += section("farming", "Food", from("farm.html#farming", "Food page"),
        `<dl class="params" id="food-params"></dl><p class="hint" id="rice-hint"></p><p class="source" id="food-source" hidden></p>
        ${change("farm.html#farming", "Food")}
        <dl class="foods two"><dt>Milk</dt><dd id="milk-cow"></dd><dt>Rice</dt><dd>harvest, days 181–${HARVEST_LAST}</dd></dl>
        <p class="hint">Whatever spoils soonest is eaten first. Leftovers are stored until they spoil.</p>`);
      if (!none) s += section("work", "Work", energy ? "Everyone spends their day's energy; children help when needed" : "Each grown-up does one job a day; children don't work",
        `<dl class="foods"><dt></dt><dd class="h">Needs</dd><dd class="h v">Days</dd>
          <dt>Milk</dt><dd id="milk-work"></dd><dd class="v">all year</dd>
          <dt>Rice</dt><dd><span id="rice-who">adults</span>: tending, then harvest</dd><dd class="v">1–270</dd></dl>
        <p class="hint">${energy
          ? `Work is counted in <b>energy</b>; 10 energy is what a person with 100 Power spends in a day. Milk comes first: an adult cow gives at most <span class="milk-cap">10</span> milk, so milking it fully takes a set amount of energy, and people milk one cow after another while their energy lasts, elders first since elders can't farm. Adults put whatever energy is left into the rice. <b>Tending</b> (days 1–180): the 4 fields go to the 4 with the most energy left; a field gives its tending energy × rice effectiveness, up to its yearly limit. <b>Harvest</b> (days 181–270): each 10 energy brings in 250 rice until the field is bare; rice still standing after day 270 is lost. Days 271–360 have no rice work. <span id="kids-work"></span> Who may do which job is set with the <b>Jobs</b> button at the top.`
          : `Milk comes first: every adult cow gets a milker, first from those who can't farm (elders, by default). Those left who can farm go to the rice, up to 4. Who may do which job is set with the <b>Jobs</b> button at the top. <b>Tending</b> (days 1–180): each hand gives 25% of the full crop, so 4 give 100%, and the crop is the average crew. <b>Harvest</b> (days 181–270): each hand brings in 250 rice a day until the field is bare; rice still standing after day 270 is lost. Days 271–360 have no rice work.`}</p>`);
      if (at("production")) s += section("map", "Map", from("map.html#map", "Map page"),
        `<dl class="params" id="map-params"></dl><p class="hint" id="map-hint"></p><p class="source" id="map-source" hidden></p>${change("map.html#map", "Map")}`);
      if (at("production")) s += section("advice", "Rationing", from("advisor.html#advice", "Advisor page"),
        `<dl class="params" id="ration-params"></dl>
        <p class="hint">${rationHint || "Each day the advisor sets a ration: the food in store plus what today's workers will still bring in, spread evenly over the days until the next harvest. Off means everyone eats what they need until it runs out."}</p>
        <p class="hint" id="iq-hint"></p><p class="source" id="ration-source" hidden></p>
        ${change("advisor.html#advice", "Advisor")}<dl class="foods" id="advisor-compare"></dl>`);
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
        ["c", "Food need", `${fmt(UP.c, 1)} /person`, "sep"], ["k", "Hunger toll", `${fmt(UP.k, 1)} × (missing food)² days`],
      ]);
      $("herd-start").innerHTML = `Start with <b>${fmt(HS.N0)} cows</b>`;
      $("human-start").innerHTML = `Start with <b>${fmt(US.men)} men</b> and <b>${fmt(US.women)} women</b>`;
      source("herd-source", c.saved.herd);
      source("human-source", c.saved.humans);

      const milkPerCow = FoodModel.milkPerDay(F), cowE = FoodModel.cowEnergyOf(F), eats = YEAR * UP.c;
      if ($("food-params")) {
        $("food-params").innerHTML = paramRows([
          ["", "Rice effectiveness", `1 energy = ${fmtNum(F.ricePerEnergy)} rice (${fmt(F.riceYear)} a year)`],
          ["", "Food in store at start", `${fmt(F.foodStart)}, never spoils`],
          ["", "Milk keeps", FoodModel.keepText(F.milkKeep)], ["", "Rice keeps", FoodModel.keepText(F.riceKeep)],
          ["", "Milk effectiveness", `1 energy = ${fmtNum(F.milkPerEnergy)} milk`],
          ["", "Milk per cow", `at most ${fmt(F.milkCap)} a day`],
          ["", "Rice per field", `at most ${fmt(F.fieldCap)} a year (${fmt(FULL_CREW)} fields)`],
        ]);
        source("food-source", c.saved.food);
        $("milk-cow").textContent = none ? `${milkText(milkPerCow)} a day per adult cow` : energy ? `at most ${fmt(F.milkCap)} a day per adult cow` : "as much as its milker collects";
        const days = HARVEST_LAST - HARVEST_FIRST + 1, most = FULL_CREW * F.fieldCap;
        const harvestDays = Math.ceil(F.riceYear / (FULL_CREW * VM.HARVEST_PER_HAND));
        $("rice-hint").innerHTML = !energy && !none
          ? `A full crew of ${FULL_CREW} tending grows <b>${milkText(F.riceYear)}</b>, and brings it in at ${milkText(FULL_CREW * VM.HARVEST_PER_HAND)} a day in about <b>${fmt(harvestDays)}</b> days${harvestDays > HARVEST_LAST - HARVEST_FIRST + 1 ? ", longer than the harvest lasts" : ""}. A grown-up eats <b>${milkText(eats)}</b> food a year (a child half), so a full harvest alone feeds about <b>${fmt(F.riceYear / eats, 1)}</b> grown-ups for a year.`
          : none
          ? `Harvested evenly over the ${days} harvest days: <b>${milkText(F.riceYear / days)}</b> rice a day. A grown-up eats <b>${milkText(eats)}</b> food a year (a child half), so this alone feeds about <b>${fmt(F.riceYear / eats, 1)}</b> grown-ups for a year.`
          : `Each of the ${FULL_CREW} fields gives up to <b>${fmt(F.fieldCap)}</b> rice a year, so at most <b>${fmt(most)}</b>; a field is full at ${fmt(FoodModel.fieldEnergyOf(F), 1)} energy of tending a day. Four standard workers (10 energy each) grow ${milkText(F.riceYear)}. At harvest, every 10 energy brings in 250 rice. A grown-up eats <b>${milkText(eats)}</b> food a year (a child half), so a full ${fmt(most)} feeds about <b>${fmt(most / eats, 1)}</b> grown-ups for a year.`;
      }
      if ($("kids-work") && c.roles) {
        const k = c.roles.child, jobs = [k.milk && "milking", (k.tend || k.harvest) && "the fields"].filter(Boolean);
        $("kids-work").innerHTML = (jobs.length
          ? `<b>Children</b> help only when the grown-ups leave work undone (${jobs.join(" and ")}), strongest first.`
          : "<b>Children</b> don't do food work.") +
          (def.school ? (k.teach ? " Whatever energy they don't need goes to class." : " They don't go to class.") : "");
      }
      if ($("rice-who") && c.roles) {
        const who = [["man", "men"], ["woman", "women"], ["elder", "elders"], ...(energy ? [["child", "children if needed"]] : [])]
          .filter(([r]) => c.roles[r].tend || c.roles[r].harvest).map(([, n]) => n);
        $("rice-who").textContent = who.length ? who.join(", ") : "nobody";
      }
      if ($("milk-work")) $("milk-work").textContent = energy
        ? `each adult cow: ${fmt(cowE, Number.isInteger(cowE) ? 0 : 1)} energy for its ${fmt(F.milkCap)} milk`
        : `1 adult or elder per adult cow (${milkText(milkPerCow)} milk a day)`;
      for (const el of document.querySelectorAll(".milk-cap")) el.textContent = fmt(F.milkCap);

      if ($("map-params")) {
        const M = c.M, d = MapModel.distances(M.tiles), tv = c.travel;
        const place = (k) => (isFinite(d[k]) ? `${fmt(d[k])} tiles · ${fmt(MapModel.tripHours(d[k], M), 1)} h there and back` : "none on the map");
        $("map-params").innerHTML = paramRows([
          ["", "Pasture (milking)", place("P")], ["", "Farm (rice)", place("F")],
          ["", "Mine (stone)", place("M")], ["", "Forest (timber)", place("T")],
          ["", "Walking", `${fmt(M.minPerTile)} min a tile`, "sep"], ["", "Carried home every", `${fmt(M.load)} energy of collecting`],
          ["", "Day", `${fmt(M.dayHours)} h for work (at most 10) and walking`],
        ]);
        // A standard worker's day (10 energy at 1 energy an hour) at each place
        const std = (trip, collect) => {
          if (!isFinite(trip)) return "can't get there";
          const done = VM.workCap(DAY_ENERGY, 1, M.dayHours, trip, M.load, collect), walkH = VM.tripsFor(done, M.load, collect) * trip;
          return `${fmt(walkH, 1)} h walking, ${done >= DAY_ENERGY ? "all 10 energy of work" : `only <b>${fmt(done)}</b> of 10 energy of work`}`;
        };
        $("map-hint").innerHTML = `A standard worker (10 energy a day) milking: ${std(tv.pasture, true)}. Harvesting: ${std(tv.farm, true)}. Tending (one trip a day): ${std(tv.farm, false)}. Collecting means a trip home for every ${fmt(M.load)} energy; once work and walking pass ${fmt(M.dayHours)} hours, walking cuts the work, and idle grown-ups take up what's left undone.`;
        source("map-source", c.saved.map);
      }
      if ($("ration-params")) {
        const r = rationRows ? rationRows(c) : {
          rows: [["", "Food advisor", c.R.advisor ? "on" : "off"], ["", "Advisor IQ", fmt(c.R.iq)]],
          hint: !c.R.advisor ? "The advisor is off on the Advisor page, so everyone eats what they need until the food runs out."
            : iqError(c.R.iq) === 0 ? "Spot on: the advisor counts the food exactly, assuming today's workers keep working."
            : `Food estimates are typically off by <b>±${fmt(iqError(c.R.iq) * 100)}%</b>, with a lasting lean one way. Too high and the food runs out; too low and people go hungry for nothing.`,
        };
        $("ration-params").innerHTML = paramRows(r.rows);
        $("iq-hint").innerHTML = r.hint;
        source("ration-source", c.saved.advisor);
      }
      // The advisor policies side by side, on every page with an advisor
      if ($("advisor-compare")) {
        const choice = advisorChoice ? advisorChoice(c) : { value: c.R.iq, label: `Advisor, IQ ${c.R.iq}` };
        const n = [aliveWith({ advisor: null }), aliveWith({ advisor: choice.value }), aliveWith({ advisor: PERFECT_IQ })], best = Math.max(...n);
        $("advisor-compare").innerHTML = compareRows(`Villages alive at day ${fmt(T)}`,
          [["No advisor", n[0], n[0] === best], [choice.label, n[1], n[1] === best], [`Perfect advisor (IQ ${PERFECT_IQ})`, n[2], n[2] === best]]);
      }
      if ($("res-params")) {
        const R = c.RS;
        $("res-params").innerHTML = paramRows([
          ["", "Wool per sheep", `${fmt(R.fleece)}, regrows ${fmt(R.regrow)} a day`], ["", "Keep timber at", fmt(R.woodTarget)],
          ["", "1 energy collects", `${fmtNum(R.woolPerEnergy)} wool · ${fmtNum(R.woodPerEnergy)} timber · ${fmtNum(R.stonePerEnergy)} stone`],
        ]);
        source("res-source", c.saved.resources);
      }
      if ($("edu-params")) {
        $("edu-params").innerHTML = paramRows([
          ["", "Knowledge effectiveness", `1 energy = ${fmtNum(c.ED.knowPerEnergy)} knowledge`], ["", "Knowledge per +1 Intelligence", fmt(c.ED.knowPerIntel)],
          ["", "Poetry per +1 Intelligence", fmt(c.ED.readPerIntel)], ["", "Scholar adjustment", `±${fmt(c.ED.scholarShift)}%`],
        ]);
        source("edu-source", c.saved.education);
      }
      if (at("education")) {
        $("attr-start").innerHTML = `Starting grown-ups have <b>Power ${fmt(c.A.power)}</b> and <b>Intelligence ${fmt(c.A.intel)}</b>, from the Attribute page.`;
        $("inherit-params").innerHTML = paramRows([
          ["", "Share passed on (h)", `${fmt(c.IH.share, 2)} × average`], ["", "Variation at birth", `±${fmt(c.IH.variation)}%`],
          ["", "Coming-of-age bonus", `+${fmt(c.IH.grow)} each`], ["", "Extra food per child", `${fmt(c.IH.extraCap)} /day`],
          ["", "Extra food per +1 Power", `${fmt(c.IH.powerFoodBase)} + (Power − ${fmt(c.IH.powerFoodFrom)}) above ${fmt(c.IH.powerFoodFrom)}`],
        ]);
        $("inherit-source").hidden = c.saved.inheritance && c.saved.attribute;
        $("inherit-source").textContent = "Showing defaults. If you changed those pages and it doesn't show here, your browser keeps each local file's settings separate.";
      }
    }

    // ---------- Cards in <main> ----------
    const inherit = () => !!c.cfg && !!c.cfg.inherit;
    function mainHTML() {
      const card = (label, title, sub, body) => `<section class="card" aria-label="${label}"><div class="card-head"><h2>${title}</h2><p>${sub}</p></div>${body}</section>`;
      const legend = (items) => `<div class="legend">${items.map(([cls, text]) => `<span><i class="swatch${cls ? " " + cls : ""}"></i>${text}</span>`).join("")}</div>`;
      let s = `<div class="status"><span class="pill" id="pill-cows">—</span><span class="pill" id="pill-people">—</span></div>`;
      s += card("Farm", "Farm", "Press Play or drag the slider. Young animals and children are drawn smaller.",
        `<div class="pasture"><canvas id="pasture"></canvas><div class="tag-box readout" id="readout">Day 0</div></div>
        <div class="playbar"><button type="button" class="btn primary play" id="play">Play</button>
          <input type="range" id="day" aria-label="Day" min="0" step="1"><span class="day" id="day-label">day 0</span>
          <div class="speed"><span>Speed</span><div class="seg" role="group" aria-label="Playback speed">
            <button type="button" data-speed="36" aria-pressed="false">1 yr / 10 s</button><button type="button" data-speed="180" aria-pressed="true">1 yr / 2 s</button><button type="button" data-speed="720" aria-pressed="false">1 yr / ½ s</button>
          </div></div></div>
        <p class="events" id="events"></p>`);
      s += card("Numbers over time", "Numbers over time", "Bold lines are one run; shading is the range across all 20. Gridlines mark each 360-day year.",
        `<svg class="chart" id="time-chart" height="320" role="img" aria-label="Cows and people over 3600 days"></svg>` +
        legend([["cows", "Cows"], ["people", "People"], ["band", "Range across 20 runs"], ["dash-herd", "Where cows settle"], ["dash-people", none ? "Grown-ups the milk feeds" : "Grown-ups the collected milk feeds"]]));
      if (def.inherit) s += card("Attributes over time", "Attributes over time", "Average Power and Intelligence of this run's adults; children and elders not included.",
        `<svg class="chart" id="attr-chart" height="190" role="img" aria-label="Adults' average Power and Intelligence over 3600 days"></svg>` +
        legend([["pow", "Power (力量)"], ["int", "Intelligence (智力)"], ["settle", def.school ? "Where they settle without extra food or school" : "Where they settle without extra food"]]));
      if (def.school) s += card("School", "School", "The scholar and the children's lessons in this run.",
        `<div class="food-rows"><dl class="rows" id="school-day"></dl><dl class="rows" id="school-run"></dl></div>`);
      s += card("Food", "Food in store", none ? "Rice arrives in one burst each autumn and is eaten through the year. Shaded bands are harvests." : "Rice comes in during the autumn harvest and is eaten through the year. Shaded bands are harvests.",
        `<svg class="chart" id="food-chart" height="190" role="img" aria-label="Milk, rice and starting food in store over 3600 days"></svg>` +
        legend([["rice", "Rice in store"], ["milk", "Milk in store"], ["start-food", "Starting food left (never spoils)"], ["harvest", `Harvest (days 181–${HARVEST_LAST})`]]) +
        `<div class="food-rows"><dl class="rows" id="food-day"></dl><dl class="rows" id="food-run"></dl></div>`);
      if (def.resources) s += card("Resources", "Resources in store", "Wool, timber and stone the idle grown-ups bring home. Nothing uses them yet: wool and stone pile up, and timber stays at its target.",
        `<svg class="chart" id="res-chart" height="190" role="img" aria-label="Wool, timber and stone in store over 3600 days"></svg>` +
        legend([["res-wool", "Wool"], ["res-wood", "Timber"], ["res-stone", "Stone"]]) +
        `<div class="food-rows"><dl class="rows" id="res-day"></dl><dl class="rows" id="res-run"></dl></div>`);
      if (def.craft) s += card("Crafts", "Crafts in store", "What the idle grown-ups make at the house. Nothing uses them yet, so they only pile up.",
        `<svg class="chart" id="craft-chart" height="190" role="img" aria-label="Crafted items in store over 3600 days"></svg>` +
        legend(CRAFTS.map((it) => [`craft-${it.id}`, `${it.zh} ${it.en}`])) +
        `<div class="food-rows"><dl class="rows" id="craft-day"></dl><dl class="rows" id="craft-run"></dl></div>`);
      if (!none) s += card("Workers", "Workers", "What the adults and elders of this run do each day. Shaded bands are harvests.",
        `<svg class="chart" id="work-chart" height="190" role="img" aria-label="Adults and elders milking and farming over 3600 days"></svg>` +
        legend([["work-milk", "Milking"], ["work-rice", "On the rice"], ...(energy ? [["work-kids", "Children helping"]] : []),
          ["", def.school ? "Adults and elders, not the scholar" : "Adults and elders"], ["work-cows", "Adult cows to milk"]]));
      s += `<div class="stats"><section class="card" aria-label="Cow stats" id="stats-cows"></section><section class="card" aria-label="People stats" id="stats-people"></section></div>`;
      s += `<section class="card impl" id="rules" data-page="${def.key}" aria-label="Implementation details"><div class="card-head"><h2>Implementation details</h2><p>Every rule this page runs, for building it into the game. Numbers are the defaults.</p></div><div class="rules-body"></div></section>`;
      return s;
    }

    function drawVerdict() {
      for (const g of [{ key: "cows", name: "Cows", many: "cows" }, { key: "people", name: "People", many: "people" }]) {
        const r = c.result[g.key], m = r.main, pill = $("pill-" + g.key), odds = `${r.alive}/${RUNS} runs survive`;
        let text;
        if (m.extinctDay === 0) { pill.className = "pill crash"; text = `No ${g.many}`; }
        else if (m.extinctDay !== null) { pill.className = "pill crash"; text = `${g.name} die out, day ${fmt(m.extinctDay)} · ${odds}`; }
        else if (m.capped) { pill.className = "pill ok"; text = `${g.name} pass ${fmt(MAX_PEOPLE)} by day ${fmt(m.last)} · ${odds}`; }
        else { pill.className = "pill ok"; text = `${g.name}: ${fmt(m.counts[T])} left · ${odds}`; }
        pill.innerHTML = `<span class="dot-key ${g.key}"></span>${text}`;
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
    // Shaded area from the lowest to the highest count across all runs, about one step per 2 pixels
    function bandPath(runs, x, y, width) {
      const buckets = Math.max(20, Math.floor(width / 2)), top = [], bottom = [];
      for (let b = 0; b < buckets; b++) {
        const d0 = Math.floor((b * T) / buckets), d1 = Math.max(d0 + 1, Math.floor(((b + 1) * T) / buckets));
        let lo = Infinity, hi = -Infinity;
        for (const r of runs) for (let d = d0; d < d1 && d <= r.last; d++) { const v = r.counts[d]; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi === -Infinity) continue;
        const xm = x((d0 + d1) / 2).toFixed(1);
        top.push(xm + " " + y(hi).toFixed(1)); bottom.push(xm + " " + y(lo).toFixed(1));
      }
      return top.length ? "M" + top.join("L") + "L" + bottom.reverse().join("L") + "Z" : "";
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
      const every = W < 520 ? 2 : 1;
      for (let yr = 0; yr <= T / YEAR; yr++) {
        if (opts.yearLines && yr > 0 && yr < T / YEAR) s += `<line class="gridline" x1="${x(yr * YEAR)}" x2="${x(yr * YEAR)}" y1="${m.t}" y2="${y(0)}"/>`;
        if (yr % every === 0) s += `<text x="${x(yr * YEAR)}" y="${H - m.b + 16}" text-anchor="middle">${fmt(yr * YEAR)}</text>`;
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
      const last = none ? T : pm.last, feeds = new Float32Array(T + 1), milkPerCow = FoodModel.milkPerDay(c.F);
      for (let i = 0; i <= last; i++) feeds[i] = c.UP.c > 0 ? (none ? cows.adults[i] * milkPerCow : pm.made[i]) / c.UP.c : 0;
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
      for (const key of ["cows", "people"]) s += `<path class="band ${key}" d="${bandPath(c.result[key].runs, x, y, W - m.l - m.r)}"/>`;
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
      const pm = c.result.people.main, IH = c.cfg.inherit, settle = IH.share < 1 ? IH.grow / (1 - IH.share) : Infinity;
      const end = pm.extinctDay !== null ? pm.extinctDay : pm.last;
      let yMax = Math.max(c.A.power, c.A.intel, isFinite(settle) ? settle : 0, 10);
      for (let i = 0; i <= end; i++) { if (pm.pow[i] > yMax) yMax = pm.pow[i]; if (pm.int[i] > yMax) yMax = pm.int[i]; }
      const f = frame("attr-chart", 190, yMax * 1.1), { x, y, W, m, step } = f;
      let s = f.s;
      if (settle <= yMax * 1.1) {
        s += `<line class="settle-line" x1="${m.l}" x2="${W - m.r}" y1="${y(settle)}" y2="${y(settle)}"/>`;
        s += `<text class="reflabel" x="${W - m.r + 6}" y="${y(settle) + 4}">settle ${fmt(settle)}</text>`;
      }
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
    function drawResRows() {
      const pm = c.result.people.main, day = currentDay(), i = Math.min(day, pm.last), sh = c.result.sheep.main;
      let wool = 0, stone = 0, wood = 0, work = 0;
      for (let k = 1; k <= pm.last; k++) { wool += pm.woolMade[k]; stone += pm.stoneMade[k]; wood += pm.woodMade[k]; work += pm.resWork[k]; }
      $("res-day").innerHTML = `<dt class="sub">Day ${fmt(day)}</dt>
        <dt>Adult sheep / wool on them</dt><dd>${fmt(sh.adults[day])} / ${day <= pm.last && pm.counts[i] > 0 ? fmt(pm.woolOnSheep[i]) : "—"}</dd>
        <dt>Energy on resources</dt><dd>${fmt(pm.resWork[i])}</dd>
        <dt>Brought in: wool / timber / stone</dt><dd>${fmt(pm.woolMade[i])} / ${fmt(pm.woodMade[i])} / ${fmt(pm.stoneMade[i])}</dd>
        <dt>In store: wool / timber / stone</dt><dd>${fmt(pm.wool[i])} / ${fmt(pm.wood[i])} / ${fmt(pm.stone[i])}</dd>`;
      $("res-run").innerHTML = `<dt class="sub">Whole run</dt>
        <dt>Energy on resources</dt><dd>${fmt(work)}</dd>
        <dt>Wool / timber / stone</dt><dd>${fmt(wool)} / ${fmt(wood)} / ${fmt(stone)}</dd>
        <dt>Sheep herds surviving</dt><dd>${c.result.sheep.alive}/${RUNS}</dd>`;
    }
    function drawCraftRows() {
      const pm = c.result.people.main, day = currentDay(), i = Math.min(day, pm.last);
      let work = 0, done = 0;
      for (let k = 1; k <= pm.last; k++) { work += pm.craftWork[k]; done += pm.craftDone[k]; }
      const items = (pick) => CRAFTS.map((it, k) => `${it.zh} ${fmt(pick(k))}`).join(" · ");
      $("craft-day").innerHTML = `<dt class="sub">Day ${fmt(day)}</dt>
        <dt>Crafters at work</dt><dd>${fmt(pm.crafting[i])}</dd>
        <dt>Energy on crafts</dt><dd>${fmt(pm.craftWork[i])}</dd>
        <dt>Finished today</dt><dd>${fmt(pm.craftDone[i])}</dd>
        <dt>In store</dt><dd>${items((k) => pm.crafts[k][i])}</dd>`;
      $("craft-run").innerHTML = `<dt class="sub">Whole run</dt>
        <dt>Energy on crafts</dt><dd>${fmt(work)}</dd>
        <dt>Items finished</dt><dd>${fmt(done)}</dd>`;
    }
    function drawStatics() {
      drawVerdict();
      drawTimeChart();
      drawFoodChart();
      const pm = c.result.people.main;
      if (def.resources) drawLines("res", [["res-wool", pm.wool], ["res-wood", pm.wood], ["res-stone", pm.stone]], "res-stone", 50);
      if (def.craft) drawLines("craft", CRAFTS.map((it, k) => [`craft-${it.id}`, pm.crafts[k]]), "craft-clothes", 5);
      if (!none) drawWorkChart();
      if (def.inherit) drawAttrChart();
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
      const made = none ? "made" : "collected", ration = at("advisor") ? `<dt>Advisor's ration</dt><dd>${isFinite(pm.share[i]) ? fmt(pm.share[i] * 100) + "%" : "—"}</dd>` : "";
      const cowE = FoodModel.cowEnergyOf(c.F);
      $("food-day").innerHTML = `<dt class="sub">Day ${fmt(day)} · day ${doy} of the year${harvest}</dt>` + (none ? "" :
        `<dt>Milking / on the rice / idle</dt><dd>${fmt(pm.milkers[i])} / ${fmt(pm.farm[i])} / ${fmt(idle)}</dd>` + (energy
          ? `<dt>Children helping</dt><dd>${fmt(pm.kidsWork[i])}</dd>
             <dt>Work done: milking / rice</dt><dd>${fmt(pm.milkWork[i] * DAY_ENERGY)} / ${fmt(pm.farmWork[i] * DAY_ENERGY)} energy</dd>
             <dt>Walking, all workers</dt><dd>${fmt(pm.walk[i], 1)} h</dd>
             <dt>Cows not fully milked</dt><dd>${fmt(Math.max(0, pm.cows[i] - Math.floor((pm.milkWork[i] * DAY_ENERGY) / cowE + 1e-6)))} of ${fmt(pm.cows[i])}</dd>`
          : `<dt>Walking, all workers</dt><dd>${fmt(pm.walk[i], 1)} h</dd><dt>Cows not milked</dt><dd>${fmt(Math.max(0, pm.cows[i] - pm.milkers[i]))} of ${fmt(pm.cows[i])}</dd>`)) +
        `<dt>Milk ${made} / drunk</dt><dd>${milkText(pm.made[i])} / ${milkText(pm.drank[i])}</dd>` + (none ? "" :
          `<dt>${energy ? "This year's crop, of the most" : "This year's rice crop"}</dt><dd>${crop}</dd><dt>Rice still in the field</dt><dd>${milkText(pm.field[i])}</dd>`) +
        `<dt>Rice harvested / eaten</dt><dd>${milkText(pm.riceMade[i])} / ${milkText(pm.riceEaten[i])}</dd>
         <dt>Starting food eaten</dt><dd>${milkText(pm.foodEaten[i])}</dd>
         <dt>In store: milk / rice / starting</dt><dd>${milkText(pm.stored[i])} / ${milkText(pm.riceStored[i])} / ${milkText(pm.foodStored[i])}</dd>${ration}
         <dt>Fed</dt><dd>${shareText(i)}</dd>` + (inherit() ? `<dt>Extra food to children</dt><dd>${milkText(pm.extra[i])}</dd>` : "");
      $("food-run").innerHTML = `<dt class="sub">Whole run</dt>
        <dt>Milk ${made} / drunk / spoiled</dt><dd>${milkText(sum(pm.made))} / ${milkText(sum(pm.drank))} / ${milkText(sum(pm.spoiled))}</dd>` +
        (none ? `<dt>Rice harvested</dt><dd>${milkText(sum(pm.riceMade))}</dd>` : `<dt>Rice harvested / left in the field</dt><dd>${milkText(sum(pm.riceMade))} / ${milkText(sum(pm.riceLost))}</dd>`) +
        `<dt>Rice eaten / spoiled</dt><dd>${milkText(sum(pm.riceEaten))} / ${milkText(sum(pm.riceSpoiled))}</dd>
         <dt>Starting food eaten / left</dt><dd>${milkText(sum(pm.foodEaten))} / ${milkText(c.F.foodStart - sum(pm.foodEaten))}</dd>` +
        (inherit() ? `<dt>Extra food to children</dt><dd>${milkText(sum(pm.extra))}</dd>` : "");
    }

    function drawSchoolRows() {
      const pm = c.result.people.main, day = currentDay(), i = Math.min(day, pm.last);
      let taught = 0, gained = 0, picked = 0, schoolDays = 0, read = 0, readGained = 0;
      for (let k = 1; k <= pm.last; k++) {
        taught += pm.taught[k]; gained += pm.gained[k]; picked += pm.picked[k]; read += pm.read[k]; readGained += pm.readGained[k];
        if (isFinite(pm.schInt[k]) && pm.counts[k - 1] > 0) schoolDays++;
      }
      const has = isFinite(pm.schInt[i]) && day > 0;
      $("school-day").innerHTML = `<dt class="sub">Day ${fmt(day)}</dt>
        <dt>Scholar's Power / Intelligence</dt><dd>${has ? `${fmt(pm.schPow[i])} / ${fmt(pm.schInt[i])}` : "none"}</dd>
        <dt>Food advisor's IQ</dt><dd>${isFinite(pm.iq[i]) ? fmt(pm.iq[i]) : "—"}</dd>
        <dt>Children in class</dt><dd>${has ? fmt(pm.kids[i]) : "—"}</dd>
        <dt>Of them, worked first</dt><dd>${has ? fmt(pm.kidsWork[i]) : "—"}</dd>
        <dt>Lesson</dt><dd>${has && pm.kids[i] ? fmt(pm.lesson[i], 1) + " h" : "—"}</dd>
        <dt>Knowledge taken home</dt><dd>${fmt(pm.taught[i])}</dd>
        <dt>Intelligence gained</dt><dd>+${fmt(pm.gained[i])}</dd>
        <dt>Scholar's poetry</dt><dd>${has ? `${fmt(pm.read[i])} knowledge${pm.readGained[i] ? `, +${fmt(pm.readGained[i])} Intelligence` : ""}` : "—"}</dd>`;
      $("school-run").innerHTML = `<dt class="sub">Whole run</dt>
        <dt>Scholars picked</dt><dd>${fmt(picked)}</dd><dt>Days with a scholar</dt><dd>${fmt(schoolDays)}</dd>
        <dt>Knowledge taken home</dt><dd>${fmt(taught)}</dd><dt>Intelligence gained, all children</dt><dd>+${fmt(gained)}</dd>
        <dt>Scholars' poetry</dt><dd>${fmt(read)} knowledge, +${fmt(readGained)} Intelligence</dd>`;
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
      const milk = none ? `${fmt(Math.floor(cows.adults[day] * FoodModel.milkPerDay(c.F)))} milk` : `${milkText(pm.made[pi])} milk collected`;
      $("readout").textContent = `Day ${fmt(day)} (year ${fmt(day / YEAR, 1)}) · ${fmt(cows.counts[day])} cows${c.result.sheep ? ` · ${fmt(c.result.sheep.main.counts[day])} sheep` : ""} · ${fmt(pm.counts[pi])} people · ${milk} · ${milkText(pm.riceStored[pi])} rice stored${pm.foodStored[pi] > 0 ? ` · ${milkText(pm.foodStored[pi])} starting food` : ""}`;
      const people = () => {
        if (day > pm.last) return "<b>People</b> run stopped";
        const hungry = pm.hungry[pi] ? ` (${fmt(pm.hungry[pi])} from hunger)` : "";
        const harvest = pm.riceMade[pi] ? ` · <span class="harvest-tag">harvest +${milkText(pm.riceMade[pi])} rice</span>` : "";
        const workText = none ? "" : ` · <span class="w">work: ${fmt(pm.milkers[pi])} milking, ${fmt(pm.farm[pi])} on rice</span>`;
        return `<b>People</b> +${fmt(pm.born[pi])} −${fmt(pm.died[pi])}${hungry} · fed ${shareText(pi)}${workText}${harvest}`;
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
      const milkRow = none ? `<dt>Milk given</dt><dd>${fmt(Math.floor(m.adults[day] * FoodModel.milkPerDay(c.F)))}</dd>` : `<dt>Milk collected</dt><dd>${milkText(pm.made[pi])}</dd>`;
      $("stats-cows").innerHTML = `<div class="stat-head"><h3><span class="dot-key cows"></span>Cows</h3><span class="big">${fmt(m.counts[day])}<small>on day ${fmt(day)}</small></span></div>
        <dl class="rows"><dt class="sub">On this day</dt>
          <dt>Adults</dt><dd>${fmt(m.counts[day] - m.young[day])}</dd><dt>Calves</dt><dd>${fmt(m.young[day])}</dd>
          <dt>Born</dt><dd>${fmt(m.born[day])}</dd><dt>Died, old age</dt><dd>${fmt(m.old[day])}</dd><dt>Died, herd size</dt><dd>${fmt(m.size[day])}</dd>${milkRow}
          <dt class="sub">Whole run</dt>
          <dt>Max herd</dt><dd>${fmt(peak)} (day ${fmt(peakDay)})</dd><dt>Born</dt><dd>${fmt(born)}</dd><dt>Died, old age</dt><dd>${fmt(old)}</dd><dt>Died, herd size</dt><dd>${fmt(size)}</dd>
          <dt>Outcome</dt><dd>${m.extinctDay === null ? "alive" : m.extinctDay === 0 ? "none" : `died, day ${fmt(m.extinctDay)}`}</dd><dt>Runs surviving</dt><dd>${cr.alive}/${RUNS}</dd></dl>`;

      const r = c.result.people;
      let pBorn = 0, died = 0, hungry = 0, pPeak = 0, pPeakDay = 0;
      for (let k = 0; k <= pm.last; k++) { pBorn += pm.born[k]; died += pm.died[k]; hungry += pm.hungry[k]; if (pm.counts[k] > pPeak) { pPeak = pm.counts[k]; pPeakDay = k; } }
      const outcome = pm.extinctDay === 0 ? "nobody to start with" : pm.extinctDay !== null ? `died, day ${fmt(pm.extinctDay)}` : pm.capped ? `passed ${fmt(MAX_PEOPLE)}` : "alive";
      $("stats-people").innerHTML = `<div class="stat-head"><h3><span class="dot-key people"></span>People</h3><span class="big">${fmt(pm.counts[pi])}<small>on day ${fmt(day)}</small></span></div>
        <dl class="rows"><dt class="sub">On this day</dt>
          <dt>Men / women</dt><dd>${fmt(pm.men[pi])} / ${fmt(pm.women[pi])}</dd><dt>Boys / girls</dt><dd>${fmt(pm.boys[pi])} / ${fmt(pm.girls[pi])}</dd>
          <dt>Elders</dt><dd>${fmt(pm.elders[pi])}</dd><dt>Couples</dt><dd>${fmt(pm.couples[pi])}</dd><dt>Fed</dt><dd>${shareText(pi)}</dd>
          ${inherit() ? `<dt>Adults' Power / Intelligence</dt><dd>${attrAvg(pi)}</dd>` : ""}
          <dt>Born / died</dt><dd>${fmt(pm.born[pi])} / ${fmt(pm.died[pi])}</dd>
          <dt class="sub">Whole run</dt>
          <dt>Max population</dt><dd>${fmt(pPeak)} (day ${fmt(pPeakDay)})</dd><dt>Born</dt><dd>${fmt(pBorn)}</dd>
          <dt>Died, all causes</dt><dd>${fmt(died)}</dd><dt>Died, hunger</dt><dd>${fmt(hungry)}</dd>
          <dt>Outcome</dt><dd>${outcome}</dd><dt>Runs surviving</dt><dd>${r.alive}/${RUNS}</dd></dl>`;
    }

    // ---------- Playback ----------
    const currentDay = () => clamp(Math.floor(cursor === null ? T : cursor), 0, T);
    function drawFrame() {
      drawCursors();
      if (def.school) drawSchoolRows();
      drawFoodRows();
      if (def.resources) drawResRows();
      if (def.craft) drawCraftRows();
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

    // ---------- Build the page and wire it up ----------
    document.querySelector("aside.panel").insertAdjacentHTML("beforeend", panelHTML());
    document.querySelector("main").innerHTML = mainHTML();
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

    // Reset covers this page and the pages it follows, so it asks for a second click
    let resetTimer = 0;
    const disarmReset = () => { clearTimeout(resetTimer); $("reset").classList.remove("confirm"); $("reset").textContent = "Reset to defaults"; };
    $("reset").addEventListener("click", () => {
      const b = $("reset");
      if (!b.classList.contains("confirm")) {
        b.classList.add("confirm");
        b.textContent = "Click again to also reset the pages it follows";
        resetTimer = setTimeout(disarmReset, 4000);
        return;
      }
      disarmReset();
      try { for (const k of upstream) localStorage.removeItem(k); } catch (e) {}
      Object.keys(S).forEach((k) => delete S[k]);
      Object.assign(S, S_DEFAULTS);
      if (def.key === "food") c.F = { ...FoodModel.DEFAULTS };
      if (def.key === "advisor") c.R = { ...RationModel.DEFAULTS };
      cursor = null;
      recompute();
    });
    // Follow the other pages when they're changed in another tab
    window.addEventListener("storage", (e) => { if (upstream.includes(e.key) || (at("production") && (e.key === RolesModel.STORE_KEY || e.key === RolesModel.PRIORITY_KEY))) recompute(); });
    if (at("production")) window.addEventListener("roles-change", () => recompute());
    let resizeTimer = 0;
    new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { drawStatics(); drawFrame(); }, 60); }).observe(document.querySelector("main"));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", drawFarm);
    new MutationObserver(drawFarm).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    if (def.setup) def.setup(c);
    recompute();
    return c;
  }

  window.VillagePage = { start, SPECS, CRAFTS, readSaved, schoolOf };
})();
