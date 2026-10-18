// Human population model for the Magic Scroll ecology pages.
// Needs herd-model.js loaded first (for the random number generator).
(function () {
  // Human parameters. Change these to change the defaults on every page.
  const DEFAULTS = {
    p: 0.003,  // chance a fertile couple has a child each day
    M: 360,    // adult at age, days. Younger people are children.
    E: 2880,   // elder at age, days. Elders don't have children, and eat less (ELDER_FOOD).
    L: 3600,   // average lifespan, days
    S: 10,     // lifespan spread, ± percent of L
    F: 2000,   // food produced per day, shared by everyone in proportion to need
    c: 100,    // food an adult needs per day; a child needs 70%, an elder 80%
    k: 0.1,    // hunger toll: days of lifespan lost per (missing food)², per person per day
  };

  // Where the Humans page saves its sliders. Settings saved at 10 food a day (v10) come over with food
  // ×10 and k ÷ 100, so the same share missing costs the same; those saved before k became 10 (v9),
  // without k.
  // v12: the birth chance became 0.003; saved settings keep everything else.
  const STORE_KEY = "human-params-v12", V11 = "human-params-v11";
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
    if (!localStorage.getItem(STORE_KEY) && v11 && typeof v11 === "object") { delete v11.p; localStorage.setItem(STORE_KEY, JSON.stringify(v11)); }
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
      people.push({ id: id++, sex, age: Math.min(life - 1, p.M + Math.floor(rand() * adultSpan)), life, life0: life });
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

  // Children eat this share of what an adult eats, and elders this (p.elderFood, if given: the village
  // pages tie it to the elder penalty)
  const CHILD_FOOD = 0.7, ELDER_FOOD = 0.8;
  const needOf = (h, p) => p.c * (h.age < p.M ? CHILD_FOOD : h.age < p.E ? 1 : p.elderFood ?? ELDER_FOOD);

  // Food everyone together needs in a day: c for each adult, CHILD_FOOD of it for each child, ELDER_FOOD for each elder
  function foodNeed(people, p) {
    let need = 0;
    for (const h of people) need += needOf(h, p);
    return need;
  }

  // Share of their daily need each person gets when food is shared out in proportion
  // to need (1 = fully fed)
  const rationFor = (need, p) => (need > 0 ? p.F / need : Infinity);

  // Days of lifespan one person loses in a day when they eat `short` food less than they need: k × short²
  const hungerLoss = (short, p) => (short > 0 ? p.k * short * short : 0);

  // One day:
  // 1. food is shared in proportion to need. If each share falls short by a gap g (0 to 1), each
  //    person's lifespan shrinks by hungerLoss of their own missing food (g × their need).
  // 2. everyone ages a day; those reaching their lifespan die
  // 3. each fertile couple has a child with chance p; each child is a boy or girl at random
  // lossOf(h), if given, is each person's hunger toll instead (the village pages with a day schedule);
  // chancesOf(people), if given, returns the day's couples as each one's chance of a child instead
  // (the Happiness page: its lasting couples of two adults, each with their own chance), called with the survivors.
  // Updates state in place and returns the day's counts.
  function stepPeople(state, p, rand, lossOf, chancesOf) {
    const need = foodNeed(state.people, p);
    const ration = rationFor(need, p);
    const gap = Math.max(0, 1 - ration);
    const lost = hungerLoss(gap * p.c, p);   // an adult's

    let died = 0, hungry = 0, lostAll = 0;
    const people = [];
    for (const h of state.people) {
      const loss = lossOf ? lossOf(h) : hungerLoss(gap * needOf(h, p), p);
      h.life -= loss; lostAll += loss;
      h.age += 1;
      if (h.age >= h.life) {
        died++;
        if (h.life < h.life0 - 0.5) hungry++;   // hunger took at least a day off this life
      } else {
        people.push(h);
      }
    }

    const chances = chancesOf ? chancesOf(people) : null, couples = chances ? chances.length : census(people, p).couples;
    let born = 0;
    for (let i = 0; i < couples; i++) {
      if (rand() < (chances ? chances[i] : p.p)) {
        const life = lifespan(p, rand);
        people.push({ id: state.nextId++, sex: rand() < 0.5 ? MALE : FEMALE, age: 0, life, life0: life });
        born++;
      }
    }
    state.people = people;
    return { born, died, hungry, couples, need, ration, lost, lostAll };
  }

  // Children a couple can expect if both live out their adult years well fed
  const childrenPerCouple = (p) => p.p * Math.max(0, Math.min(p.L, p.E) - p.M);

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
  const START = { men: 5, women: 5 };

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

  window.HumanModel = { DEFAULTS, STORE_KEY, MALE, FEMALE, lifespan, startPeople, stage, census, CHILD_FOOD, ELDER_FOOD, needOf, foodNeed, rationFor, hungerLoss, stepPeople, childrenPerCouple, fedCapacity, savedParams, START, savedStart };
})();
