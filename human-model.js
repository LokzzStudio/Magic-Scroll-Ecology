// Human population model for the Magic Scroll ecology pages.
// Needs herd-model.js loaded first (for the random number generator).
(function () {
  // Human parameters. Change these to change the defaults on every page.
  const DEFAULTS = {
    p: 0.002,  // chance a fertile couple has a child each day
    M: 360,    // adult at age, days. Younger people are children.
    L: 3600,   // average lifespan, days
    S: 10,     // lifespan spread, ± percent of L
    F: 20,     // food produced per day, shared equally by everyone
    c: 1,      // food one person needs per day
    K: 3600,   // hunger toll: days of lifespan lost on a day with no food at all
    n: 3,      // hunger curve power: 1 = straight line, higher = small shortfalls hurt less
  };

  // Where the Humans page saves its sliders
  const STORE_KEY = "human-params-v4";

  const MALE = 0, FEMALE = 1;

  const lifespan = (p, rand) => Math.max(1, p.L * (1 + (p.S / 100) * (2 * rand() - 1)));

  // Starting people are adults of mixed ages. Returns { people, nextId } for stepPeople.
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

  // Adult men and women pair up; each man-woman pair is one fertile couple
  function census(people, p) {
    let men = 0, women = 0, boys = 0, girls = 0;
    for (const h of people) {
      const adult = h.age >= p.M;
      if (h.sex === MALE) adult ? men++ : boys++;
      else adult ? women++ : girls++;
    }
    return { men, women, boys, girls, couples: Math.min(men, women) };
  }

  // Share of their daily need each person gets when food is split equally (1 = fully fed)
  const rationFor = (count, p) => (count > 0 && p.c > 0 ? p.F / (count * p.c) : Infinity);

  // Days of lifespan lost in one day for a shortfall gap from 0 (fully fed) to 1 (no food).
  // A power curve between the ends: 0 when fed, K with no food, K × gap^n in between.
  const hungerLoss = (gap, p) => (gap > 0 ? p.K * Math.pow(Math.min(gap, 1), p.n) : 0);

  // One day:
  // 1. food is shared equally. If each share falls short of the need by a gap g
  //    (0 to 1), everyone's lifespan shrinks by hungerLoss(g) days.
  // 2. everyone ages a day; those reaching their lifespan die
  // 3. each fertile couple has a child with chance p; each child is a boy or girl at random
  // Updates state in place and returns the day's counts.
  function stepPeople(state, p, rand) {
    const ration = rationFor(state.people.length, p);
    const gap = Math.max(0, 1 - ration);
    const lost = hungerLoss(gap, p);

    let died = 0, hungry = 0;
    const people = [];
    for (const h of state.people) {
      h.life -= lost;
      h.age += 1;
      if (h.age >= h.life) {
        died++;
        if (h.life < h.life0 - 0.5) hungry++;   // hunger took at least a day off this life
      } else {
        people.push(h);
      }
    }

    const { couples } = census(people, p);
    let born = 0;
    for (let i = 0; i < couples; i++) {
      if (rand() < p.p) {
        const life = lifespan(p, rand);
        people.push({ id: state.nextId++, sex: rand() < 0.5 ? MALE : FEMALE, age: 0, life, life0: life });
        born++;
      }
    }
    state.people = people;
    return { born, died, hungry, couples, ration, lost };
  }

  // Children a couple can expect if both live out their adult years well fed
  const childrenPerCouple = (p) => p.p * Math.max(0, p.L - p.M);

  // How many people the daily food fully feeds
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
      return p;
    } catch (e) {
      return null;
    }
  }

  // Starting population, set on the Humans page and also used by the Full Simulation
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

  window.HumanModel = { DEFAULTS, STORE_KEY, MALE, FEMALE, lifespan, startPeople, census, rationFor, hungerLoss, stepPeople, childrenPerCouple, fedCapacity, savedParams, START, savedStart };
})();
