// Shared food model for the Magic Scroll ecology pages: how much rice the farm grows,
// what's in store at the start, and how long milk and rice keep.
// The Food Model page (farm.html) is where these are tuned; the pages after it read them from here.
(function () {
  // Food parameters. Change these to change the defaults on every page.
  const DEFAULTS = {
    riceYear: 20000,  // rice grown each year (on the Production Model, with a full crew)
    riceStart: 20000, // rice in store on day 0
    milkKeep: 1,      // days milk keeps after the day it's made: 1 = good until tomorrow
    riceKeep: 360,    // days rice keeps after the day it's harvested
  };
  // Slider ranges, [min, max]
  const LIMITS = { riceYear: [0, 50000], riceStart: [0, 50000], milkKeep: [0, 30], riceKeep: [0, 1080] };

  // Where the Food Model page saves its sliders
  const STORE_KEY = "food-params-v2";

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

  // Eat up to `want` from the stores, whatever spoils soonest first (milk first on a tie).
  // Returns how much came from each.
  function eat(stores, want) {
    const { milk, rice } = stores;
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

  // "same day", "until tomorrow" or "N days"
  const keepText = (days) => (days === 0 ? "same day" : days === 1 ? "until tomorrow" : `${days} days`);

  // The parameters the Food Model page last saved, or null if it hasn't saved any
  // (or the browser keeps each page's storage separate).
  function savedParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return null;
      const p = {};
      for (const k of Object.keys(DEFAULTS)) {
        const v = k in saved ? Number(saved[k]) : DEFAULTS[k];
        if (!isFinite(v)) return null;
        p[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v));
      }
      p.milkKeep = Math.round(p.milkKeep);
      p.riceKeep = Math.round(p.riceKeep);
      return p;
    } catch (e) {
      return null;
    }
  }

  window.FoodModel = { DEFAULTS, LIMITS, STORE_KEY, newStores, ageStores, total, eat, keepText, savedParams };
})();
