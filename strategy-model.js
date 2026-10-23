// The Strategy page's player: a strategic player who plays the village (village-model.js calls
// StrategyModel.player(cfg.player) and asks its act(view) each day, before the day's work). What a
// player can do, each day:
//   kill       anyone, gone before the day starts
//   scholars   appoint any grown-ups as scholars, and dismiss them (the list they give is the scholars)
//   orders     each person's own order of the day's jobs, given on the 1st of a month (every 30 days);
//              "idle" (發呆) in it: there they stop for the day, doing nothing more
//   refill     fill the well to the brim
//   gifts      any number of 刀 叉 衣 笠, at most SR, in store as if just made
//   births     for each couple, whether they may have a child (no: no chance of one, until told yes)
//   rice       any amount of rice, on the 1st of a month, in store as if harvested that day
// view: { day, doy, month (the 1st of a month), people (the villagers: sex, age, power, intel, carry (days
// until she gives birth), exp and level by skill), p, stageOf(h), isMan(h), cows (adult cows), scholars,
// school (scholars exist), couples ([man, woman] pairs; null without the Happiness page), need (the day's
// food for everyone), rice (in store), foodDays (days the food in store would feed everyone), count(id,
// minTier) (crafts of id in store, of that tier or better), stock(r, minTier) (wool, stone or timber in
// store, in lots of that tier or better), crafts (crafts exist), well, wellCap }. act returns { kill,
// scholars, orders: [[h, order]], births: [[couple, yes]], refill, gifts: [{ id, tier, n }], rice }, any
// of them left out for nothing. Each strategy keeps its own notes on the village (P.mem). Sustainable
// lets go after its hands-off years (handsOff), and the village carries on by its own rules (the
// village's scholars, the orders the player gave).
(function () {
  const SR = 3, SSR = 4, YEAR = 360;
  const IDLE = ["idle"];
  const FOOD = ["field", "milk", "craft", "collect", "teach", "read"];   // the village's own order
  // Teaching for a scholar and class for a child; a grown-up who isn't a scholar milks (teaching is
  // only a scholar's job), and then everyone rests. One order works whichever they are this month
  const SCHOOL = ["teach", "milk", "idle"];

  const grownUps = (v) => v.people.filter((h) => v.stageOf(h) !== "child");
  const kidsOf = (v) => v.people.filter((h) => v.stageOf(h) === "child");
  const by = (list, score) => list.slice().sort((a, b) => score(b) - score(a) || a.id - b.id);
  const ordersFor = (v, of) => v.people.map((h) => [h, of(h)]);
  const expecting = (v) => v.people.filter((h) => h.carry > 0).length;
  // Rice on the 1st of a month, enough for everyone's need for a year more (as long as rice keeps)
  const riceFor = (v) => (v.month ? Math.max(0, Math.ceil(v.need * YEAR - v.rice)) : 0);
  // Every couple may have a child (yes true), or none may
  const birthsAll = (v, yes) => (v.couples ? v.couples.map((cp) => [cp, yes]) : null);
  // SR crafts in store for those who go out (workers: everyone without it): a 衣 and a 笠 each, and a
  // 刀 and a 叉 each grown-up of them, a fifth to spare (the best are taken first, so the starting R ones wait)
  function topUp(v, workers = v.people) {
    if (!v.crafts) return [];
    const n = workers.length, g = workers.filter((h) => v.stageOf(h) !== "child").length;
    return [["clothes", n], ["hat", n], ["blade", g], ["fork", g]].map(([id, want]) => ({ id, tier: SR, n: Math.ceil(want * 1.2) - v.count(id, SR) })).filter((x) => x.n > 0);
  }
  // Keeps a role's holders: those still fit (fit(h)) stay, and the best of the rest (score) fill it up to n
  function keep(v, held, n, fit, score) {
    const alive = new Set(v.people), stay = held.filter((h) => alive.has(h) && fit(h)).slice(0, n), taken = new Set(stay);
    return [...stay, ...by(v.people.filter((h) => fit(h) && !taken.has(h)), score).slice(0, Math.max(0, n - stay.length))];
  }

  const STRATEGIES = [
    {
      id: "population", zh: "人丁興旺", en: "Most people", goal: "the most people at the end",
      how: "Gives a year's rice every month, so nobody needs to work, and puts everyone on 發呆: nobody goes out into the cold or misses a meal far from home, so nobody's life is cut short, and everyone keeps their day's energy, which makes them happier, and happier couples have more children. No scholars: Intelligence makes people less happy. Every couple may have children.",
      act(v) {
        return { rice: riceFor(v), scholars: [], births: birthsAll(v, true), orders: v.month ? ordersFor(v, () => IDLE) : null };
      },
    },
    {
      id: "intel", zh: "天資聰穎", en: "Brightest person", goal: "the highest Intelligence anyone reaches",
      how: "Gives a year's rice every month, so no one need farm. Every child has a scholar of their own and spends the day in class, doing nothing else: a class of one learns the most. The scholars are the grown-ups who can teach longest, the most Power for their Intelligence (a bright scholar works fast but tires sooner, and a child learns only as fast as the slower of the two), kept on so their teaching skill grows; after class they rest. Everyone else milks: with food to spare, the children drink the milk, and it makes them stronger, so they stay longer in class. Couples may have children while there are fewer than half as many children as grown-ups, and fewer than 40 people. Nobody is killed: a bright village is an unhappy one, with few children, and culling the dull leaves it too few.",
      act(v, P) {
        const m = P.mem, grown = grownUps(v), kids = kidsOf(v), coming = expecting(v);
        m.sch = keep(v, m.sch || [], Math.max(1, kids.length), (h) => v.stageOf(h) !== "child", (h) => h.power / Math.max(1, h.intel));
        const isSch = new Set(m.sch), room = kids.length + coming < grown.length / 2 && v.people.length + coming < 40;
        return { rice: riceFor(v), gifts: topUp(v, grown.filter((h) => !isSch.has(h))), scholars: m.sch, births: birthsAll(v, room),
          orders: v.month ? ordersFor(v, () => SCHOOL) : null };
      },
    },
    {
      id: "sustain", zh: "自給自足", en: "Sustainable", goal: "lasting longest on its own, after the hands-off years",
      how: "For the hands-off years it raises a strong village: a year's rice every month, so the grown-ups can milk first and farm with what's left, and the children drink the milk; one scholar, the brightest, teaches, kept on so their teaching skill grows; the well full, SR 衣 笠 刀 叉 as needed; every couple may have children, nobody killed. On its last day it fills the store with SR crafts for everyone to the end of the run, then lets go: no more rice, refills, gifts or kills, and the village appoints its own scholars from then on. The grown-ups keep the orders they had, milking and farming, and never go out gathering: with crafts in store there's nothing to gather for, and the far places cost meals and the cold.",
      act(v, P) {
        const m = P.mem, grown = grownUps(v), gifts = topUp(v);
        m.sch = v.school ? keep(v, m.sch || [], 1, (h) => v.stageOf(h) !== "child", (h) => h.intel) : [];
        const isSch = new Set(m.sch);
        if (v.day === P.until && v.crafts) {   // the last day: crafts to the end of the run (a 衣 or 笠 lasts about 20 days of work)
          const years = Math.max(0, (P.runDays - v.day) / YEAR), n = v.people.length, g = grown.length;
          for (const [id, who] of [["clothes", n], ["hat", n], ["blade", g], ["fork", g]]) gifts.push({ id, tier: SR, n: Math.ceil(who * 18 * years * 1.5) });
        }
        return { refill: true, gifts, rice: riceFor(v), scholars: v.school ? m.sch : null, births: birthsAll(v, true),
          orders: v.month ? ordersFor(v, (h) => (v.stageOf(h) === "child" ? FOOD : isSch.has(h) ? ["teach", "idle"] : ["milk", "field", "idle"])) : null };
      },
    },
    {
      id: "ur", zh: "神兵利器", en: "A UR craft", goal: "a UR craft, or else the most SSR ones",
      how: "Gives a year's rice every month, so no one need farm, and turns the village into a workshop: a smith (a man) at the forge and a weaver (a woman) at the loom, every day, so they reach SSR at their craft; three men and three women gather, every day, so they reach SSR at it; each keeps their job for life, and the next is whoever has the most experience at it, or else the youngest and strongest. One scholar teaches the children and the rest milk, so the next workers grow up strong. SR 衣 笠 刀 叉 for the workers as needed, and no more than 24 people. A craft's tier comes from its crafter's skill, their 刀's and its materials', and UR needs all three at SSR, then 1 in 400. So once a crafter is SSR, they work their station only in months that start with a month of its materials in SSR lots (the forge too whenever SSR 刀 are short), and rest otherwise: crafts take the best lots first, so every craft gets SSR materials.",
      act(v, P) {
        const m = P.mem, man = (h) => v.isMan(h), grown = (h) => v.stageOf(h) !== "child";
        // Experience at the job first; with none, the young and strong (Power, less a point a month of age)
        const pick = (skills) => (h) => (h.exp ? skills.reduce((e, k) => e + h.exp[k], 0) : 0) * 1e3 + h.power - h.age / 30;
        if (v.month || !m.smith) {
          m.smith = keep(v, m.smith || [], 1, (h) => grown(h) && man(h), pick(["forge"]));
          m.weaver = keep(v, m.weaver || [], 1, (h) => grown(h) && !man(h), pick(["weave"]));
          const crafters = new Set([...m.smith, ...m.weaver]);
          m.men = keep(v, m.men || [], 3, (h) => grown(h) && man(h) && !crafters.has(h), pick(["stone", "wood"]));
          m.women = keep(v, m.women || [], 3, (h) => grown(h) && !man(h) && !crafters.has(h), pick(["wool", "wood"]));
          const busy = new Set([...crafters, ...m.men, ...m.women]);
          m.sch = keep(v, m.sch || [], 1, (h) => grown(h) && !busy.has(h), (h) => h.intel);
        }
        const craft = new Set([...m.smith, ...m.weaver]), gather = new Set([...m.men, ...m.women]);
        // A station works this month if its crafter isn't SSR yet (they're learning), or the store holds a
        // month of its materials in SSR lots (about 45 crafts, 150 of each), timber to the forge first; the
        // forge also whenever there are fewer SSR 刀 than crafters and gatherers
        if (v.month) {
          const MONTH = 45 * 150, ssr = (r) => v.stock(r, SSR), learning = (who, k) => !who[0] || !who[0].level || who[0].level[k] < SSR;
          let wood = ssr("wood");
          m.forge = learning(m.smith, "forge") || v.count("blade", SSR) < craft.size + gather.size || (ssr("stone") >= MONTH && wood >= MONTH);
          if (m.forge) wood -= MONTH;
          m.weave = learning(m.weaver, "weave") || (ssr("wool") >= MONTH && wood >= MONTH);
        }
        const works = (h) => (m.smith.includes(h) ? m.forge : m.weave);
        return { rice: riceFor(v), scholars: m.sch, gifts: topUp(v, [...craft, ...gather]), births: birthsAll(v, v.people.length + expecting(v) < 24),
          orders: v.month ? ordersFor(v, (h) => (craft.has(h) ? (works(h) ? ["craft", "idle"] : IDLE) : gather.has(h) ? ["collect", "idle"] : SCHOOL)) : null };
      },
    },
  ];
  const byId = Object.fromEntries(STRATEGIES.map((s) => [s.id, s]));
  // The player for cfg.player = { id, handsOff (years, Sustainable), runDays }: plays until `until`
  function player(cfg) {
    const s = byId[cfg.id];
    if (!s) return null;
    const P = { until: s.id === "sustain" ? Math.round((cfg.handsOff ?? 10) * YEAR) : Infinity, runDays: cfg.runDays || 50 * YEAR, mem: {} };
    return { until: P.until, act: (v) => s.act(v, P) };
  }

  window.StrategyModel = { STRATEGIES, player, SR };
})();
