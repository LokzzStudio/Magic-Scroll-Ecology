// Shared herd model for the Magic Scroll ecology pages.
// The cow page (index.html) is where the parameters are tuned. Every other page
// reads them from here, and follows whatever the cow page last saved.
(function () {
  // Model parameters. Change these to change the defaults on every page.
  const DEFAULTS = {
    r: 0.03,  // intrinsic growth rate, per day
    K: 11,    // carrying capacity, animals
    A: 4,     // Allee threshold, animals
    L: 360,   // average lifespan, days
    S: 10,    // lifespan spread, ± percent of L
    M: 60,    // adult at age, days. Younger animals are calves or lambs.
              // Only a label: young animals still count toward births and crowding.
  };

  // Where the cow page saves its sliders
  const STORE_KEY = "cow-herd-params-v6";

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Births (positive) or losses from herd size (negative) per day
  const herdChange = (N, p) => p.r * N * (N / p.A - 1) * (1 - N / p.K);

  // On average about N/L animals die of old age each day
  const avgGrowth = (N, p) => herdChange(N, p) - N / p.L;

  // Average-model steady states: N² − (K + A)N + AK(1 + 1/(rL)) = 0.
  // lo is the tipping point, hi is where the herd settles.
  // Lifespans shorter than Lmin leave no steady herd at all.
  function equilibria(p) {
    const { r, K, A, L } = p;
    const Lmin = K > A ? (4 * A * K) / (r * (K - A) ** 2) : Infinity;
    const disc = (K + A) ** 2 - 4 * A * K * (1 + 1 / (r * L));
    if (K <= A || disc < 0) return { exists: false, lo: NaN, hi: NaN, Lmin };
    const s = Math.sqrt(disc);
    return { exists: true, lo: (K + A - s) / 2, hi: (K + A + s) / 2, Lmin };
  }

  const lifespan = (p, rand) => Math.max(1, p.L * (1 + (p.S / 100) * (2 * rand() - 1)));

  // A starting herd of mixed ages. Returns { herd, nextId } for stepHerd.
  function startHerd(count, p, rand) {
    const herd = [];
    for (let i = 0; i < count; i++) {
      const life = lifespan(p, rand);
      herd.push({ id: i, age: Math.floor(rand() * life), life });
    }
    return { herd, nextId: count };
  }

  // One day for one herd:
  // 1. every animal ages a day; those reaching their lifespan die
  // 2. births, or losses when the herd is too small or too crowded.
  //    Fractions of an animal become a chance of one more.
  // Updates state in place and returns the day's counts.
  function stepHerd(state, p, rand) {
    let old = 0;
    const herd = [];
    for (const a of state.herd) {
      a.age += 1;
      if (a.age >= a.life) old++;
      else herd.push(a);
    }

    const change = herdChange(herd.length, p);
    const mag = Math.abs(change);
    let whole = Math.floor(mag) + (rand() < mag - Math.floor(mag) ? 1 : 0);
    let born = 0, size = 0;
    if (change > 0) {
      whole = Math.max(0, Math.min(whole, p.K * 10 - herd.length));
      for (let i = 0; i < whole; i++) herd.push({ id: state.nextId++, age: 0, life: lifespan(p, rand) });
      born = whole;
    } else {
      whole = Math.min(whole, herd.length);
      for (let i = 0; i < whole; i++) {
        const j = Math.floor(rand() * herd.length);
        herd[j] = herd[herd.length - 1];
        herd.pop();
      }
      size = whole;
    }
    state.herd = herd;
    return { born, old, size };
  }

  // The parameters the cow page last saved, or null if it hasn't saved any
  // (or the browser keeps each page's storage separate).
  function savedParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return null;
      const p = {};
      for (const k of Object.keys(DEFAULTS)) {
        // Settings saved before a parameter existed fall back to its default
        const v = k in saved ? Number(saved[k]) : DEFAULTS[k];
        if (!isFinite(v)) return null;
        p[k] = v;
      }
      if (p.r <= 0 || p.K <= 0 || p.A <= 0 || p.L <= 0 || p.S < 0) return null;
      p.M = Math.min(Math.max(p.M, 1), p.L);
      return p;
    } catch (e) {
      return null;
    }
  }

  // Starting herd size, set on the Herd tuner and also used by the Full Simulation
  const START = { N0: 10 };

  // The starting herd the Herd tuner last saved, or null
  function savedStart() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      const n = Number(saved && saved.N0);
      return saved && isFinite(n) && n >= 0 ? { N0: Math.round(n) } : null;
    } catch (e) {
      return null;
    }
  }

  // One-line summary for the top bar
  const describe = (p) => `r ${p.r} · K ${p.K} · A ${p.A} · L ${p.L}d ±${p.S}% · adult ${p.M}d`;

  window.HerdModel = { DEFAULTS, STORE_KEY, rng, herdChange, avgGrowth, equilibria, lifespan, startHerd, stepHerd, savedParams, START, savedStart, describe };
})();
