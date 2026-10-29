// Shared food model for the Magic Scroll ecology pages: how much work a rice and a milk take,
// what's in store at the start (food that never spoils), and how long milk and rice keep.
// The Food Model page (farm.html) is where these are tuned; the pages after it read them from here.
(function () {
  // Energy one person spends in a standard working day (100 Power, 100 Intelligence)
  const DAY_ENERGY = 100;

  // The rice season every page assumes: a full crew of 4 tending it for 180 days
  const TEND_CREW = 4, TEND_DAYS = 180;
  const CREW_ENERGY = TEND_CREW * TEND_DAYS * DAY_ENERGY;   // 72,000 energy

  // Food comes in whole units. The whole food the first `energy` energy makes at `rate` food
  // per energy, rounded down (the tiny allowance absorbs float error in rates like 2.3)
  const wholeFood = (energy, rate) => Math.floor(energy * rate + 1e-7);
  // Whole food `spent` more energy makes after `before` energy has already been spent: fractions
  // carry over, so at 2.5 food per energy the 1st energy gives 2, the 2nd 3, the 3rd 2, ...
  const yieldOf = (before, spent, rate) => wholeFood(before + spent, rate) - wholeFood(before, rate);

  // Rice a full crew of standard days grows in a year: its tending energy × rice effectiveness, in
  // whole rice, but no more than the 4 fields can give
  const riceYearOf = (p) => Math.min(TEND_CREW * p.fieldCap, wholeFood(CREW_ENERGY, p.ricePerEnergy));
  // A day's tending that fills a field
  const fieldEnergyOf = (p) => p.fieldCap / (TEND_DAYS * p.ricePerEnergy);

  // Food parameters. Change these to change the defaults on every page.
  const DEFAULTS = {
    ricePerEnergy: 1,  // rice effectiveness: rice 1 energy of tending grows (72,000 a year)
    foodStart: 50000,  // food in store on day 0; it never spoils
    milkKeep: 1,      // days milk keeps after the day it's made: 1 = good until tomorrow
    riceKeep: 360,    // days rice keeps after the day it's harvested
    milkPerEnergy: 1, // milk effectiveness: milk 1 energy collects

    fieldCap: 50000,  // the most rice one field gives in a year (there are 4)
  };
  DEFAULTS.riceYear = riceYearOf(DEFAULTS);   // follows from ricePerEnergy; not a setting of its own

  // Slider ranges, [min, max]
  const LIMITS = { ricePerEnergy: [0.1, 10], foodStart: [0, 1000000], milkKeep: [0, 30], riceKeep: [0, 1080], milkPerEnergy: [0.1, 10], fieldCap: [5000, 200000] };

  // Milk one standard working day collects (a cow has no limit); where nobody
  // works, what each adult cow gives (on average: each day's milk is whole, fractions carried over)
  const milkPerDay = (p) => DAY_ENERGY * p.milkPerEnergy;

  // Whole units of food made on the k-th of n days when `amount` is spread evenly over them;
  // the n days add up to exactly `amount`
  const spread = (amount, n, k) => Math.floor((amount * k) / n) - Math.floor((amount * (k - 1)) / n);

  // Where the Food Model page saves its sliders; before rice became 1 per energy (v5, kept but for
  // that); at 10 energy a day (v4), and before that at an older scale (v2)
  // v7: starting food 500,000 and rice effectiveness 1.2; v8: rice effectiveness 1 (the Watering page's
  // water grows rice too); saved settings keep everything else
  const STORE_KEY = "food-params-v9", V8_KEY = "food-params-v8", V7_KEY = "food-params-v7", V6_KEY = "food-params-v6", V5_KEY = "food-params-v5", TEN_KEY = "food-params-v4", OLD_KEY = "food-params-v2";
  try {
    const v6 = !localStorage.getItem(V7_KEY) && JSON.parse(localStorage.getItem(V6_KEY) || "null");
    if (v6 && typeof v6 === "object") { delete v6.foodStart; delete v6.ricePerEnergy; localStorage.setItem(V7_KEY, JSON.stringify(v6)); }
    const v7 = !localStorage.getItem(V8_KEY) && JSON.parse(localStorage.getItem(V7_KEY) || "null");
    if (v7 && typeof v7 === "object") { delete v7.ricePerEnergy; localStorage.setItem(V8_KEY, JSON.stringify(v7)); }
    const v8 = !localStorage.getItem(STORE_KEY) && JSON.parse(localStorage.getItem(V8_KEY) || "null");
    if (v8 && typeof v8 === "object") { delete v8.foodStart; localStorage.setItem(STORE_KEY, JSON.stringify(v8)); }   // v9: 50,000 to start
  } catch (e) {}
  const TEN_FIELDS = ["foodStart", "fieldCap"];   // ×10 at 100 energy a day

  // Food in store: stores.milk[a] / stores.rice[a] = food made a days ago that is still good, and
  // stores.food = the food in store at the start, which never spoils
  function newStores(p) {
    return { milk: new Float64Array(p.milkKeep + 1), rice: new Float64Array(p.riceKeep + 1), food: p.foodStart };
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
  // (milk first on a tie), so the starting food, which never spoils, last. Returns how much came from each.
  function eat(stores, want) {
    const { milk, rice } = stores;
    want = Math.round(want);
    let milkEaten = 0, riceEaten = 0;
    let i = milk.length - 1, j = rice.length - 1;   // oldest batches first
    while (want > 1e-9) {
      while (i >= 0 && !(milk[i] > 0)) i--;   // empty batches have nothing to give
      while (j >= 0 && !(rice[j] > 0)) j--;
      if (i < 0 && j < 0) break;
      const fromMilk = j < 0 || (i >= 0 && milk.length - i <= rice.length - j);
      const store = fromMilk ? milk : rice, a = fromMilk ? i : j;
      const take = Math.min(store[a], want);
      store[a] -= take;
      want -= take;
      if (fromMilk) { milkEaten += take; i--; } else { riceEaten += take; j--; }
    }
    const foodEaten = Math.min(stores.food, want);
    stores.food -= foodEaten;
    return { milkEaten, riceEaten, foodEaten };
  }

  // "same day", "until tomorrow" or "N days"
  const keepText = (days) => (days === 0 ? "same day" : days === 1 ? "until tomorrow" : `${days} days`);

  // The parameters the Food Model page last saved, or null if it hasn't saved any
  // (or the browser keeps each page's storage separate).
  function savedParams() {
    try {
      let saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      const v5 = !saved || typeof saved !== "object" ? JSON.parse(localStorage.getItem(V5_KEY) || "null") : null;
      if (v5 && typeof v5 === "object") { saved = { ...v5 }; delete saved.ricePerEnergy; localStorage.setItem(STORE_KEY, JSON.stringify(saved)); }
      if (!saved || typeof saved !== "object") {
        // Settings saved at 10 energy a day: convert them once (and the older scale's, to that first)
        let ten = JSON.parse(localStorage.getItem(TEN_KEY) || "null");
        if (!ten || typeof ten !== "object") {
          const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
          if (!old || typeof old !== "object") return null;
          ten = { ...old };
          if (Number(old.energyPerRice) > 0) ten.ricePerEnergy = 10 / Number(old.energyPerRice);
          else if (Number(old.riceYear) > 0) ten.ricePerEnergy = Number(old.riceYear) / (CREW_ENERGY / 10);
          if (Number(old.energyPerMilk) > 0) ten.milkPerEnergy = 10 / Number(old.energyPerMilk);
        }
        saved = { ...ten };
        if (!("foodStart" in saved) && "riceStart" in saved) saved.foodStart = saved.riceStart;   // its old name
        for (const k of TEN_FIELDS) if (k in saved && isFinite(Number(saved[k]))) saved[k] = Number(saved[k]) * 10;
        delete saved.ricePerEnergy;
        localStorage.setItem(STORE_KEY, JSON.stringify(saved));
      }
      if (!("foodStart" in saved) && "riceStart" in saved) saved.foodStart = saved.riceStart;   // its old name
      const p = {};
      for (const k of Object.keys(LIMITS)) {
        const v = k in saved ? Number(saved[k]) : DEFAULTS[k];
        if (!isFinite(v)) return null;
        p[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));
      }
      p.milkKeep = Math.round(p.milkKeep);

      p.fieldCap = Math.round(p.fieldCap);
      p.riceKeep = Math.round(p.riceKeep);
      p.riceYear = riceYearOf(p);
      return p;
    } catch (e) {
      return null;
    }
  }

  window.FoodModel = { DEFAULTS, LIMITS, STORE_KEY, DAY_ENERGY, TEND_CREW, TEND_DAYS, CREW_ENERGY, riceYearOf, fieldEnergyOf, wholeFood, yieldOf, milkPerDay, spread, newStores, ageStores, total, eat, keepText, savedParams };
})();
