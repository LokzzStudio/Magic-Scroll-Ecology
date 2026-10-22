// The Strategy page's player: a strategic player who plays the village (village-model.js calls
// StrategyModel.player(cfg.player) and asks its act(view) each day, before the day's work). What a
// player can do, each day:
//   kill       anyone, gone before the day starts
//   scholars   appoint any grown-ups as scholars, and dismiss them (the list they give is the scholars)
//   orders     each person's own order of the day's jobs, given on the 1st of a month (every 30 days)
//   refill     fill the well to the brim
//   gifts      any number of 刀 叉 衣 笠, at most SR, in store as if just made
//   births     for each couple, whether they may have a child (no: no chance of one, until told yes)
// view: { day, doy, month (the 1st of a month), people, p, stageOf(h), scholars, school (scholars
// exist), couples ([man, woman] pairs; null without the Happiness page), foodDays (days the food in store would feed everyone), need, count(id, minTier) (crafts of
// id in store, of that tier or better), crafts (crafts exist), well, wellCap }. act returns { kill, scholars, orders: [[h, order]],
// births: [[couple, yes]], refill, gifts: [{ id, tier, n }] }, any of them left out for nothing.
// Each strategy plays for a goal; Sustainable lets go after its hands-off years (handsOff), and the
// village carries on by its own rules (the village's scholars, the orders the player gave).
(function () {
  const SR = 3, YEAR = 360;
  const FOOD = ["field", "milk", "craft", "collect", "teach", "read"];   // food first, as the village's own order (crafts before collecting)
  const SCHOOL = ["teach", "field", "milk", "craft", "collect", "read"];   // class before anything (children), teaching first (scholars)
  const CRAFT = ["craft", "collect", "field", "milk", "teach", "read"];   // crafters: the loom and the forge first

  const grownUps = (v) => v.people.filter((h) => v.stageOf(h) !== "child");
  const adultsOf = (v) => v.people.filter((h) => v.stageOf(h) === "adult");
  const byIntel = (list) => list.slice().sort((a, b) => b.intel - a.intel || a.id - b.id);
  // Enough SR crafts in store for everyone (the best are taken first, so the starting R ones wait): a 衣
  // and a 笠 each, a 刀 and a 叉 each grown-up, and a fifth to spare
  // (skip: crafts not to give)
  function topUp(v, skip = []) {
    if (!v.crafts) return [];
    const n = v.people.length, g = grownUps(v).length;
    return [["clothes", n], ["hat", n], ["blade", g], ["fork", g]].filter(([id]) => !skip.includes(id)).map(([id, want]) => ({ id, tier: SR, n: Math.ceil(want * 1.2) - v.count(id, SR) })).filter((x) => x.n > 0);
  }
  // The scholars for a school: the brightest grown-ups, one for every 6 adults (at least 1, at most 3),
  // so the food work keeps its hands
  function brightest(v) {
    const ad = adultsOf(v), g = byIntel(ad.length ? ad : grownUps(v));
    return g.slice(0, Math.max(1, Math.min(3, Math.floor(ad.length / 6))));
  }
  // Every third month (on its 1st): the adult (not a scholar) with the lowest Intelligence goes, if it's 10
  // or more below the adults' average and there are 12 adults or more and two months' food in store;
  // newborns then take after a brighter village
  function cull(v, scholars) {
    if (!v.month || (v.doy - 1) % 90 !== 0 || v.foodDays < 60) return [];
    const ad = adultsOf(v);
    if (ad.length < 12) return [];
    const avg = ad.reduce((s, h) => s + h.intel, 0) / ad.length, keep = new Set(scholars);
    const low = ad.filter((h) => !keep.has(h)).sort((a, b) => a.intel - b.intel || a.id - b.id)[0];
    return low && low.intel <= avg - 10 ? [low] : [];
  }
  // Every couple may have a child, or (yes false) none may
  const birthsAll = (v, yes) => (v.couples ? v.couples.map((cp) => [cp, yes]) : null);
  // Children only while the store holds 30 days' food: a hungry village doesn't take on more mouths
  const birthsFed = (v) => birthsAll(v, v.foodDays >= 30);
  // When the food in store would last under 20 days: the oldest elder goes, one a day
  function spareFood(v) {
    if (v.foodDays >= 20) return [];
    const old = v.people.filter((h) => v.stageOf(h) === "elder").sort((a, b) => b.age - a.age || a.id - b.id)[0];
    return old ? [old] : [];
  }
  const ordersFor = (v, of) => v.people.map((h) => [h, of(h)]);
  // Whether the store holds 90 days' food: only then do children put class first and crafters their craft
  const rich = (v) => v.foodDays >= 90;

  const STRATEGIES = [
    {
      id: "population", zh: "人丁興旺", en: "Most people", goal: "the most people at the end",
      how: "Keeps the well full and gives every villager SR 衣 and 笠 and every grown-up an SR 刀 and 叉 as they're needed. The brightest grown-ups are scholars, one for every 6 adults (at most 3), and teach first, and children go to class before any work while the store holds 90 days' food: Intelligence makes the work go faster, and with it the food. Grown-ups work the food first. Couples have no children while the store holds under 30 days' food, so a hungry year doesn't turn into a famine; when it would last under 20 days, the oldest elder is killed, one a day.",
      act(v) {
        const sch = v.school ? brightest(v) : null, isSch = new Set(sch || []);
        return { refill: true, gifts: topUp(v), scholars: sch, kill: spareFood(v), births: birthsFed(v), orders: v.month ? ordersFor(v, (h) => (isSch.has(h) || (rich(v) && v.stageOf(h) === "child") ? SCHOOL : FOOD)) : null };
      },
    },
    {
      id: "intel", zh: "天資聰穎", en: "Brightest person", goal: "the highest Intelligence anyone reaches",
      how: "Keeps the well full and gives SR 衣 笠 刀 叉 as needed, so the village can spare hands for school. The brightest grown-ups are scholars, one for every 3 children (at most 5), and teach first; children go to class before any work while the store holds 90 days' food (otherwise they help with it first). On the 1st of each month, with 10 adults or more and a month's food, the adult with the lowest Intelligence is killed if 5 or more below the average: newborns take after a random adult man and woman, so a brighter village has brighter children. Couples have no children while the store holds under 30 days' food.",
      act(v) {
        const sch = v.school ? brightest(v) : null, isSch = new Set(sch || []);
        return { refill: true, gifts: topUp(v), scholars: sch, kill: cull(v, sch || []), births: birthsFed(v), orders: v.month ? ordersFor(v, (h) => (isSch.has(h) || (rich(v) && v.stageOf(h) === "child") ? SCHOOL : FOOD)) : null };
      },
    },
    {
      id: "sustain", zh: "自給自足", en: "Sustainable", goal: "lasting longest on its own, after the hands-off years",
      how: "For the hands-off years it builds the village up: the well full, SR 衣 笠 刀 叉 as needed, one scholar (the brightest) who teaches, everyone on the food first, nobody killed, and no children while the store holds under 30 days' food. On its last day it fills the store with enough SR crafts for everyone to the end of the run, then lets go: every couple may have children again, there are no more refills, gifts or kills, and the village appoints its own scholars from then on.",
      act(v, P) {
        const sch = v.school ? byIntel(grownUps(v)).slice(0, 1) : null;
        const gifts = topUp(v);
        if (v.day === P.until && v.crafts) {   // the last day: crafts to the end of the run (a 衣 or 笠 lasts about 15 days of work)
          const years = Math.max(0, (P.runDays - v.day) / YEAR), n = v.people.length, g = grownUps(v).length;
          for (const [id, who] of [["clothes", n], ["hat", n], ["blade", g], ["fork", g]]) gifts.push({ id, tier: SR, n: Math.ceil(who * 24 * years * 1.5) });
        }
        return { refill: true, gifts, scholars: sch, births: v.day === P.until ? birthsAll(v, true) : birthsFed(v), orders: v.month ? ordersFor(v, () => FOOD) : null };
      },
    },
    {
      id: "ur", zh: "神兵利器", en: "A UR craft", goal: "a UR craft, or else the most SSR ones",
      how: "As Brightest person, but nobody killed (the well full, SR crafts as needed, the brightest grown-ups teaching, children in class first, no children while food is short), and the two brightest adults who aren't scholars work the loom and the forge before anything else while the store holds 180 days' food, so they build up the skill (otherwise they help with the food first); everyone else works the food first. Once the village has made an SSR 刀, the player gives no more 刀: collectors with the village's own SSR ones gather better materials. A craft's tier comes from its crafter's skill, their Intelligence and its materials': all three at SSR, UR is 1 in 400.",
      act(v) {
        const sch = v.school ? brightest(v) : null, isSch = new Set(sch || []);
        const crafters = new Set(byIntel(adultsOf(v).filter((h) => !isSch.has(h))).slice(0, 2)), craftNow = v.foodDays >= 180;
        // SSR 刀 the village has made gather better materials than the SR ones the player gives, so once
        // there are any, no more 刀 are given
        return { refill: true, gifts: topUp(v, v.count("blade", 4) > 0 ? ["blade"] : []), scholars: sch, births: birthsFed(v),
          orders: v.month ? ordersFor(v, (h) => (isSch.has(h) || (rich(v) && v.stageOf(h) === "child") ? SCHOOL : craftNow && crafters.has(h) ? CRAFT : FOOD)) : null };
      },
    },
  ];
  const byId = Object.fromEntries(STRATEGIES.map((s) => [s.id, s]));
  // The player for cfg.player = { id, handsOff (years, Sustainable), runDays }: plays until `until`
  function player(cfg) {
    const s = byId[cfg.id];
    if (!s) return null;
    const P = { until: s.id === "sustain" ? Math.round((cfg.handsOff ?? 10) * YEAR) : Infinity, runDays: cfg.runDays || 50 * YEAR };
    return { until: P.until, act: (v) => s.act(v, P) };
  }

  window.StrategyModel = { STRATEGIES, player, SR };
})();
