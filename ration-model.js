// Shared food advisor for the Magic Scroll ecology pages: whether the village rations its food,
// and how good the advisor's food estimates are.
// The Food page (farm.html) is where these are tuned; the pages after it read them from here.
(function () {
  // Advisor settings. Change these to change the defaults on every page.
  const DEFAULTS = {
    who: "advisor",  // who rations: "off" (everyone eats what they need until the food runs out),
                     // "advisor" (the food advisor decides) or "you" (the shares below)
    iq: 120,         // the advisor's IQ
    grown: 100,      // "you": grown-ups' share, % of their need
    kids: 100,       // "you": children's share, % of their need (above 100: extra food, from the Inheritance page on)
  };
  const WHO = ["off", "advisor", "you"];
  const IQ_RANGE = [40, 200], GROWN_RANGE = [0, 100], KIDS_RANGE = [0, 200];

  // From this IQ up, the advisor's food estimates are spot on
  const PERFECT_IQ = 160;

  // How far off an advisor's food estimates typically are, as a fraction: 0 at IQ 160+, 15% at IQ 100
  const iqError = (iq) => Math.max(0, (PERFECT_IQ - iq) / 400);

  // Where the Food page saves its rationing settings
  const STORE_KEY = "ration-params-v2";

  // The rationing settings the Food page last saved, or null if it hasn't saved any
  // (or the browser keeps each page's storage separate).
  function savedParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return null;
      const num = (k, [lo, hi]) => { const v = k in saved ? Number(saved[k]) : DEFAULTS[k]; return Math.round(Math.min(hi, Math.max(lo, isFinite(v) ? v : DEFAULTS[k]))); };
      // Saved before there was a choice of who rations: advisor on or off
      const who = WHO.includes(saved.who) ? saved.who : "advisor" in saved ? (saved.advisor ? "advisor" : "off") : DEFAULTS.who;
      return { who, iq: num("iq", IQ_RANGE), grown: num("grown", GROWN_RANGE), kids: num("kids", KIDS_RANGE) };
    } catch (e) {
      return null;
    }
  }

  window.RationModel = { DEFAULTS, WHO, IQ_RANGE, GROWN_RANGE, KIDS_RANGE, PERFECT_IQ, iqError, STORE_KEY, savedParams };
})();
