// Shared food model for the Magic Scroll ecology pages: how much work a rice and a milk take,
// what's in store at the start, and how long milk and rice keep.
// The Food Model page (farm.html) is where these are tuned; the pages after it read them from here.
(function () {
  // Energy one person spends in a standard working day (100 Power, 100 Intelligence)
  const DAY_ENERGY = 10;

  // The rice season every page assumes: a full crew of 4 tending it for 180 days
  const TEND_CREW = 4, TEND_DAYS = 180;
  const CREW_ENERGY = TEND_CREW * TEND_DAYS * DAY_ENERGY;   // 7,200 energy

  // Food comes in whole units. The whole food the first `energy` energy makes at `rate` food
  // per energy, rounded down (the tiny allowance absorbs float error in rates like 2.3)
  const wholeFood = (energy, rate) => Math.floor(energy * rate + 1e-7);
  // Whole food `spent` more energy makes after `before` energy has already been spent: fractions
  // carry over, so at 2.5 food per energy the 1st energy gives 2, the 2nd 3, the 3rd 2, ...
  const yieldOf = (before, spent, rate) => wholeFood(before + spent, rate) - wholeFood(before, rate);

  // Rice a full crew grows in a year: its tending energy × rice effectiveness, in whole rice
  const riceYearOf = (p) => wholeFood(CREW_ENERGY, p.ricePerEnergy);

  // Food parameters. Change these to change the defaults on every page.
  const DEFAULTS = {
    ricePerEnergy: 2,  // rice effectiveness: rice 1 energy of tending grows (14,400 a year)
    riceStart: 20000, // rice in store on day 0
    milkKeep: 1,      // days milk keeps after the day it's made: 1 = good until tomorrow
    riceKeep: 360,    // days rice keeps after the day it's harvested
    milkPerEnergy: 1, // milk effectiveness: milk 1 energy collects
  };
  DEFAULTS.riceYear = riceYearOf(DEFAULTS);   // follows from ricePerEnergy; not a setting of its own

  // Slider ranges, [min, max]
  const LIMITS = { ricePerEnergy: [0.1, 10], riceStart: [0, 50000], milkKeep: [0, 30], riceKeep: [0, 1080], milkPerEnergy: [0.1, 10] };

  // Milk one standard working day collects; where nobody works, what each adult cow gives
  // (on average: each day's milk is whole, with fractions carried over)
  const milkPerDay = (p) => DAY_ENERGY * p.milkPerEnergy;

  // Whole units of food made on the k-th of n days when `amount` is spread evenly over them;
  // the n days add up to exactly `amount`
  const spread = (amount, n, k) => Math.floor((amount * k) / n) - Math.floor((amount * (k - 1)) / n);

  // Where the Food Model page saves its sliders, and where it saved them before energy was rebased
  const STORE_KEY = "food-params-v4", OLD_KEY = "food-params-v2";

  // Food in store by age: stores.milk[a] / stores.rice[a] = food made a days ago that is still good
  function newStores(p) {
    return { milk: new Float64Array(p.milkKeep + 1), rice: new Float64Array(p.riceKeep + 1) };
  }

  // A new day: everything in store gets a day older, and whatever is past its keeping time spoils.
  // Returns how much of each spoiled.
  function ageStores(stores) {
    const age = (arr) => {
      const spoiled = arr[arr.length - 1];
      arr.copyWithin(1, 0, arr.length - 1);
      arr[0] = 0;
      return spoiled;
    };
    return { milkSpoiled: age(stores.milk), riceSpoiled: age(stores.rice) };
  }

  const total = (arr) => { let t = 0; for (const v of arr) t += v; return t; };

  // Eat up to `want` from the stores, rounded to whole food, whatever spoils soonest first
  // (milk first on a tie). Returns how much came from each.
  function eat(stores, want) {
    const { milk, rice } = stores;
    want = Math.round(want);
    let milkEaten = 0, riceEaten = 0;
    let i = milk.length - 1, j = rice.length - 1;   // oldest batches first
    while (want > 1e-9 && (i >= 0 || j >= 0)) {
      const fromMilk = j < 0 || (i >= 0 && milk.length - i <= rice.length - j);
      const store = fromMilk ? milk : rice, a = fromMilk ? i : j;
      const take = Math.min(store[a], want);
      store[a] -= take;
      want -= take;
      if (fromMilk) { milkEaten += take; i--; } else { riceEaten += take; j--; }
    }
    return { milkEaten, riceEaten };
  }

  // Eat up to `want` (rounded to whole food) of what would spoil overnight: the batches on the last
  // day of their keeping time, milk first. Returns how much came from each.
  function eatExpiring(stores, want) {
    want = Math.round(want);
    const take = (arr) => {
      const a = arr.length - 1, t = Math.max(0, Math.min(arr[a], want));
      arr[a] -= t;
      want -= t;
      return t;
    };
    const milkEaten = take(stores.milk), riceEaten = take(stores.rice);
    return { milkEaten, riceEaten };
  }

  // "same day", "until tomorrow" or "N days"
  const keepText = (days) => (days === 0 ? "same day" : days === 1 ? "until tomorrow" : `${days} days`);

  // The parameters the Food Model page last saved, or null if it hasn't saved any
  // (or the browser keeps each page's storage separate).
  function savedParams() {
    try {
      let saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") {
        // Settings saved at the old scale (100 energy a day): convert them once
        const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
        if (!old || typeof old !== "object") return null;
        saved = { ...old };
        if (Number(old.energyPerRice) > 0) saved.ricePerEnergy = 10 / Number(old.energyPerRice);
        else if (Number(old.riceYear) > 0) saved.ricePerEnergy = Number(old.riceYear) / CREW_ENERGY;
        if (Number(old.energyPerMilk) > 0) saved.milkPerEnergy = 10 / Number(old.energyPerMilk);
        localStorage.setItem(STORE_KEY, JSON.stringify(saved));
        localStorage.removeItem(OLD_KEY);
      }
      const p = {};
      for (const k of Object.keys(LIMITS)) {
        const v = k in saved ? Number(saved[k]) : DEFAULTS[k];
        if (!isFinite(v)) return null;
        p[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));
      }
      p.milkKeep = Math.round(p.milkKeep);
      p.riceKeep = Math.round(p.riceKeep);
      p.riceYear = riceYearOf(p);
      return p;
    } catch (e) {
      return null;
    }
  }

  window.FoodModel = { DEFAULTS, LIMITS, STORE_KEY, DAY_ENERGY, TEND_CREW, TEND_DAYS, CREW_ENERGY, riceYearOf, wholeFood, yieldOf, milkPerDay, spread, newStores, ageStores, total, eat, eatExpiring, keepText, savedParams };
})();
