// Shared food advisor for the Magic Scroll ecology pages: whether the village rations its food,
// and how good the advisor's food estimates are.
// The Advisor Model page (advisor.html) is where these are tuned; the pages after it read them from here.
(function () {
  // Advisor settings. Change these to change the defaults on every page.
  const DEFAULTS = {
    advisor: true,  // false: everyone eats what they need until the food runs out
    iq: 120,        // the advisor's IQ
  };
  const IQ_RANGE = [40, 200];

  // From this IQ up, the advisor's food estimates are spot on
  const PERFECT_IQ = 160;

  // How far off an advisor's food estimates typically are, as a fraction: 0 at IQ 160+, 15% at IQ 100
  const iqError = (iq) => Math.max(0, (PERFECT_IQ - iq) / 400);

  // Where the Advisor Model page saves its settings
  const STORE_KEY = "ration-params-v2";

  // The settings the Advisor Model page last saved, or null if it hasn't saved any
  // (or the browser keeps each page's storage separate).
  function savedParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return null;
      const iq = "iq" in saved ? Number(saved.iq) : DEFAULTS.iq;
      if (!isFinite(iq)) return null;
      return {
        advisor: "advisor" in saved ? !!saved.advisor : DEFAULTS.advisor,
        iq: Math.round(Math.min(IQ_RANGE[1], Math.max(IQ_RANGE[0], iq))),
      };
    } catch (e) {
      return null;
    }
  }

  window.RationModel = { DEFAULTS, IQ_RANGE, PERFECT_IQ, iqError, STORE_KEY, savedParams };
})();
