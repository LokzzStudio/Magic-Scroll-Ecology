// Human population model for the Magic Scroll ecology pages.
// Needs herd-model.js loaded first (for the random number generator).
(function () {
  // Human parameters. Change these to change the defaults on every page.
  const DEFAULTS = {
    p: 0.002,  // chance a fertile couple has a child each day
    M: 360,    // adult at age, days. Younger people are children.
    E: 2880,   // elder at age, days. Elders don't have children, and can milk but not farm.
    L: 3600,   // average lifespan, days
    S: 10,     // lifespan spread, ± percent of L
    F: 200,    // food produced per day, shared by everyone in proportion to need
    c: 10,     // food one grown-up needs per day; a child needs half
    k: 10,     // hunger toll: days of lifespan lost per (missing food)², per person per day
  };

  // Where the Humans page saves its sliders. Settings saved before k became 10 (v9) come over without k.
  const STORE_KEY = "human-params-v10", OLD_KEY = "human-params-v9";
  try {
    if (!localStorage.getItem(STORE_KEY)) {
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
      if (old && typeof old === "object") { delete old.k; localStorage.setItem(STORE_KEY, JSON.stringify(old)); }
    }
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

  // Children eat this share of what a grown-up eats
  const CHILD_FOOD = 0.5;

  // Food everyone together needs in a day: c for each grown-up, half that for each child
  function foodNeed(people, p) {
    let units = 0;
    for (const h of people) units += h.age < p.M ? CHILD_FOOD : 1;
    return units * p.c;
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
  // (the Happiness page: the day's random couples, each with their own chance), called with the survivors.
  // Updates state in place and returns the day's counts.
  function stepPeople(state, p, rand, lossOf, chancesOf) {
    const need = foodNeed(state.people, p);
    const ration = rationFor(need, p);
    const gap = Math.max(0, 1 - ration);
    const lost = hungerLoss(gap * p.c, p), childLost = hungerLoss(gap * p.c * CHILD_FOOD, p);   // a grown-up's, a child's

    let died = 0, hungry = 0, lostAll = 0;
    const people = [];
    for (const h of state.people) {
      const loss = lossOf ? lossOf(h) : h.age < p.M ? childLost : lost;
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

  // How many grown-ups the daily food fully feeds (or twice as many children)
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

  window.HumanModel = { DEFAULTS, STORE_KEY, MALE, FEMALE, lifespan, startPeople, stage, census, CHILD_FOOD, foodNeed, rationFor, hungerLoss, stepPeople, childrenPerCouple, fedCapacity, savedParams, START, savedStart };
})();
