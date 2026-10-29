// Human population model for the Magic Scroll ecology pages.
// Needs herd-model.js loaded first (for the random number generator).
(function () {
  // Human parameters. Change these to change the defaults on every page.
  const DEFAULTS = {
    p: 0.005,  // chance a fertile couple conceives each day
    G: 300,    // pregnancy, days: the child is born this long after it's conceived
    M: 360,    // adult at age, days. Younger people are children.
    E: 3240,   // elder at age, days. Elders don't have children, and eat less (ELDER_FOOD).
    L: 3600,   // average lifespan, days
    S: 10,     // lifespan spread, ± percent of L
    F: 2000,   // food produced per day, shared by everyone in proportion to need
    c: 100,    // food an adult needs per day; a child needs 70%, an elder 80% (until there's Power: from the
               // Attribute page on, everyone's need is their Power)
    k: 1,      // hunger toll: days of lifespan lost per food missed
    X: 1,      // birth balance: a newborn is a boy with chance (females + X) ÷ (males + females + 2X), 0 to 1
  };

  // Where the Humans page saves its sliders. Settings saved at 10 food a day (v10) come over with food
  // ×10 and k ÷ 100, so the same share missing costs the same; those saved before k became 10 (v9),
  // without k.
  // v12: the birth chance became 0.003; v13: elder at 3,240 days. Saved settings keep everything else.
  // v14: 6 men and 6 women to start; v15: births through pregnancy, the chance 0.005; v16: hunger's toll over
  // a run of short days, k 0.01; v17: the chance 0.004, k 0.001; v18: k days a food missed, k 1;
  // v19: the chance 0.01; v20: the chance 0.005; v21: k 0.36; v22: k 1 (a day of life a food missed)
  const STORE_KEY = "human-params-v22", V21 = "human-params-v21", V20 = "human-params-v20", V19 = "human-params-v19", V18 = "human-params-v18", V17 = "human-params-v17", V16 = "human-params-v16", V15 = "human-params-v15", V14 = "human-params-v14", V13 = "human-params-v13", V12 = "human-params-v12", V11 = "human-params-v11";
  try {
    if (!localStorage.getItem(V11)) {
      for (const key of ["human-params-v10", "human-params-v9"]) {
        const old = JSON.parse(localStorage.getItem(key) || "null");
        if (!old || typeof old !== "object") continue;
        if (key === "human-params-v9") delete old.k;
        for (const f of ["F", "c"]) if (f in old) old[f] = Number(old[f]) * 10;
        if ("k" in old) old.k = Number(old.k) / 100;
        localStorage.setItem(V11, JSON.stringify(old));
        break;
      }
    }
    const v11 = JSON.parse(localStorage.getItem(V11) || "null");
    if (!localStorage.getItem(V12) && v11 && typeof v11 === "object") { delete v11.p; localStorage.setItem(V12, JSON.stringify(v11)); }
    const v12 = JSON.parse(localStorage.getItem(V12) || "null");
    if (!localStorage.getItem(V13) && v12 && typeof v12 === "object") { delete v12.E; localStorage.setItem(V13, JSON.stringify(v12)); }
    const v13 = JSON.parse(localStorage.getItem(V13) || "null");
    if (!localStorage.getItem(V14) && v13 && typeof v13 === "object") { delete v13.men; delete v13.women; localStorage.setItem(V14, JSON.stringify(v13)); }
    const v14 = JSON.parse(localStorage.getItem(V14) || "null");
    if (!localStorage.getItem(V15) && v14 && typeof v14 === "object") { delete v14.p; localStorage.setItem(V15, JSON.stringify(v14)); }
    const v15 = JSON.parse(localStorage.getItem(V15) || "null");
    if (!localStorage.getItem(V16) && v15 && typeof v15 === "object") { delete v15.k; localStorage.setItem(V16, JSON.stringify(v15)); }
    const v16 = JSON.parse(localStorage.getItem(V16) || "null");
    if (!localStorage.getItem(V17) && v16 && typeof v16 === "object") { delete v16.p; delete v16.k; localStorage.setItem(V17, JSON.stringify(v16)); }
    const v17 = JSON.parse(localStorage.getItem(V17) || "null");
    if (!localStorage.getItem(V18) && v17 && typeof v17 === "object") { delete v17.k; localStorage.setItem(V18, JSON.stringify(v17)); }
    const v18 = JSON.parse(localStorage.getItem(V18) || "null");
    if (!localStorage.getItem(V19) && v18 && typeof v18 === "object") { delete v18.p; localStorage.setItem(V19, JSON.stringify(v18)); }
    const v19 = JSON.parse(localStorage.getItem(V19) || "null");
    if (!localStorage.getItem(V20) && v19 && typeof v19 === "object") { delete v19.p; localStorage.setItem(V20, JSON.stringify(v19)); }
    const v20 = JSON.parse(localStorage.getItem(V20) || "null");
    if (!localStorage.getItem(V21) && v20 && typeof v20 === "object") { delete v20.k; localStorage.setItem(V21, JSON.stringify(v20)); }
    const v21 = JSON.parse(localStorage.getItem(V21) || "null");
    if (!localStorage.getItem(STORE_KEY) && v21 && typeof v21 === "object") { delete v21.k; localStorage.setItem(STORE_KEY, JSON.stringify(v21)); }
  } catch (e) {}

  const MALE = 0, FEMALE = 1;

  const lifespan = (p, rand) => Math.max(1, p.L * (1 + (p.S / 100) * (2 * rand() - 1)));

  // Starting people are grown-ups of mixed ages; a few may already be elders.
  // Returns { people, nextId } for stepPeople.
  function startPeople(men, women, p, rand) {
    const people = [];
    let id = 0;
    const add = (sex) => {
      const life = lifespan(p, rand);
      const adultSpan = Math.max(1, life - p.M);
      people.push({ id: id++, sex, age: Math.min(life - 1, p.M + Math.floor(rand() * adultSpan)), life, life0: life, short: 0, carryBy: null });
    };
    for (let i = 0; i < men; i++) add(MALE);
    for (let i = 0; i < women; i++) add(FEMALE);
    return { people, nextId: id };
  }

  // Life stages: child (under M), adult (M up to E), elder (E and over)
  const stage = (h, p) => (h.age < p.M ? "child" : h.age < p.E ? "adult" : "elder");

  // men / women count adults only; elders are counted apart. Only adults pair up:
  // each adult man-woman pair is one fertile couple.
  function census(people, p) {
    let men = 0, women = 0, boys = 0, girls = 0, elderMen = 0, elderWomen = 0;
    for (const h of people) {
      const s = stage(h, p);
      if (h.sex === MALE) s === "child" ? boys++ : s === "adult" ? men++ : elderMen++;
      else s === "child" ? girls++ : s === "adult" ? women++ : elderWomen++;
    }
    return {
      men, women, boys, girls, elderMen, elderWomen, elders: elderMen + elderWomen,
      couples: Math.min(men, women),
    };
  }

  // A person's food need a day: the Power they work with (from the Attribute page on), children too, an
  // elder's ⌊Power × elder⌋ (the elder share: their energy); before there's Power, c for an adult,
  // CHILD_FOOD of it for a child, ELDER_FOOD for an elder
  const CHILD_FOOD = 0.7, ELDER_FOOD = 0.8;
  const needOf = (h, p, elder = 1) => (h.power != null ? (h.age >= p.E ? Math.floor(h.power * elder + 1e-9) : h.power) : p.c * (h.age < p.M ? CHILD_FOOD : h.age < p.E ? 1 : ELDER_FOOD));

  // Food everyone together needs in a day
  function foodNeed(people, p, elder = 1) {
    let need = 0;
    for (const h of people) need += needOf(h, p, elder);
    return need;
  }

  // Share of their daily need each person gets when food is shared out in proportion
  // to need (1 = fully fed)
  const rationFor = (need, p) => (need > 0 ? p.F / need : Infinity);

  // Hunger's toll, in whole days of lifespan, for `missing` food gone without in a life: ⌊k × missing⌋,
  // taken day by day as it grows (fractions of a day carry over)
  const hungerToll = (missing, p) => (missing > 0 ? Math.floor(p.k * missing + 1e-9) : 0);

  // One day:
  // 1. food is shared in proportion to need. If each share falls short by a gap g (0 to 1), each person
  //    goes without g × their need; their lifespan shrinks by what that adds to their hungerToll
  //    (h.short: the food they've missed in their life so far).
  // 2. everyone ages a day; those reaching their lifespan die
  // 3. each fertile couple has a child with chance p; each child is a boy with chance
  //    (W + X) ÷ (M + W + 2X), M and W the living males and females under elder age, so births lean
  //    toward the scarcer sex (the harder the smaller X; nobody to count: even)
  // 4. a small village draws outsiders: with fewer than JOIN_BELOW people (none at all too), one may join
  //    with chance 1 ÷ (people + 1)² ÷ 10, aged JOIN_AGE days, a boy or girl by the births' rule
  // missingOf(h), if given, is the food each person went without today instead (the village pages);
  // chancesOf(people), if given, returns the day's couples as each one's chance of a child instead
  // (the Happiness page: its lasting couples of two adults, each with their own chance), called with the survivors.
  // Updates state in place and returns the day's counts.
  function stepPeople(state, p, rand, missingOf, chancesOf, elder = 1) {
    const need = foodNeed(state.people, p, elder);
    const ration = rationFor(need, p);
    const gap = Math.max(0, 1 - ration);

    let died = 0, hungry = 0, lostAll = 0;
    const people = [];
    for (const h of state.people) {
      const missing = missingOf ? missingOf(h) : gap * needOf(h, p, elder);
      let loss = 0;
      if (missing > 1e-9) { const before = hungerToll(h.short, p); h.short += missing; loss = hungerToll(h.short, p) - before; }
      h.life -= loss; lostAll += loss;
      h.age += 1;
      if (h.age >= h.life) {
        died++;
        if (h.life < h.life0 - 0.5) hungry++;   // hunger took at least a day off this life
      } else {
        people.push(h);
      }
    }

    // Tonight's chances of conceiving: [chance, the woman], one a couple (chancesOf: the Happiness page's
    // couples; without it, the first adult women in village order, as many as there are couples, at p),
    // only for a woman who can conceive (canConceive)
    const chances = chancesOf ? chancesOf(people) : (() => { const n = census(people, p).couples; return people.filter((h) => h.sex === FEMALE && stage(h, p) === "adult").slice(0, n).filter((f) => canConceive(f, p)).map((f) => [p.p, f]); })();
    let born = 0, joined = 0, males = 0, females = 0;   // the living boys + men and girls + women, tonight's newborns and newcomers too
    const x = p.X ?? 1;
    for (const h of people) if (h.age < p.E) h.sex === MALE ? males++ : females++;
    const arrive = (age) => {
      const all = males + females + 2 * x, life = lifespan(p, rand), sex = rand() < (all > 0 ? (females + x) / all : 0.5) ? MALE : FEMALE;
      if (age < p.E) sex === MALE ? males++ : females++;
      people.push({ id: state.nextId++, sex, age: Math.min(age, life - 1), life, life0: life, short: 0, carryBy: null });
    };
    // Each newborn's parents, in birth order: [the father (the mother's partner when she conceived; null
    // without couples), the mother]
    const parents = [];
    const birth = (f) => { arrive(0); born++; parents.push([f.carryBy, f]); f.carryBy = null; };
    // Mothers whose time has come give birth, in village order; then the couples conceive (with no
    // pregnancy, G = 0, the child is born at once)
    const n0 = people.length;
    for (let i = 0; i < n0; i++) { const f = people[i]; if (f.carry > 0 && --f.carry === 0) birth(f); }
    for (const [chance, f] of chances) if (rand() < chance) { f.carryBy = f.partner || null; if ((p.G || 0) > 0) f.carry = p.G; else birth(f); }
    // An outsider may join a small village (last in village order)
    const n = people.length;
    if (n < JOIN_BELOW && rand() < 1 / ((n + 1) * (n + 1)) / 10) { arrive(JOIN_AGE[0] + Math.floor(rand() * (JOIN_AGE[1] - JOIN_AGE[0] + 1))); joined++; }
    state.people = people;
    return { born, joined, parents, died, hungry, couples: chances.length, need, ration, lostAll };
  }

  // Outsiders join a village of fewer than JOIN_BELOW people, aged JOIN_AGE[0] to JOIN_AGE[1] days
  const JOIN_BELOW = 10, JOIN_AGE = [360, 1440];

  // A woman can conceive while she's an adult, not already expecting, and young enough to give birth
  // before she's an elder (her age + G under E)
  const canConceive = (f, p) => !(f.carry > 0) && f.age >= p.M && f.age + (p.G || 0) < p.E;
  // Children a couple can expect if both live out their adult years well fed: each takes 1 ÷ p days to
  // conceive on average, then G days to be born, over the years she can conceive
  const childrenPerCouple = (p) => (p.p > 0 ? Math.max(0, Math.min(p.L, p.E) - (p.G || 0) - p.M) / (1 / p.p + (p.G || 0)) : 0);

  // How many adults the daily food fully feeds (or 1 ÷ CHILD_FOOD times as many children)
  const fedCapacity = (p) => (p.c > 0 ? p.F / p.c : Infinity);

  // The parameters the Humans page last saved, or null if it hasn't saved any
  function savedParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return null;
      const p = {};
      for (const k of Object.keys(DEFAULTS)) {
        const v = k in saved ? Number(saved[k]) : DEFAULTS[k];
        if (!isFinite(v) || v < 0) return null;
        p[k] = v;
      }
      if (p.L <= 0) return null;
      p.E = Math.max(p.E, p.M);
      return p;
    } catch (e) {
      return null;
    }
  }

  // Starting population, set on the Humans page and also used by the Food Model and every page after it
  const START = { men: 6, women: 6 };

  // The starting men and women the Humans page last saved, or null
  function savedStart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return null;
      const men = Number(saved.men), women = Number(saved.women);
      if (!isFinite(men) || !isFinite(women) || men < 0 || women < 0) return null;
      return { men: Math.round(men), women: Math.round(women) };
    } catch (e) {
      return null;
    }
  }

  window.HumanModel = { DEFAULTS, STORE_KEY, MALE, FEMALE, lifespan, startPeople, stage, census, CHILD_FOOD, ELDER_FOOD, needOf, foodNeed, rationFor, hungerToll, stepPeople, canConceive, childrenPerCouple, fedCapacity, savedParams, START, savedStart };
})();
