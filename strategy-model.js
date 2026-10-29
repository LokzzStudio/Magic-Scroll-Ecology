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
// view: { day, doy, month (the 1st of a month), people (the villagers: sex, age, power, intel, carry (days
// until she gives birth), exp and level by skill), p, stageOf(h), scholars, school (scholars exist),
// couples ([man, woman] pairs; null without the Happiness page), need (the day's food for everyone),
// foodDays (days the food in store would feed everyone), count(id, minTier) (crafts of id in store, of
// that tier or better), crafts (crafts exist), well, wellCap }. act returns { kill, scholars, orders:
// [[h, order]], births: [[couple, yes]], refill, gifts: [{ id, tier, n }] }, any of them left out for
// nothing. Sustainable lets go after its hands-off years (handsOff), and the village carries on by its
// own rules (the village's scholars, the orders the player gave).
(function () {
  const SR = 3, YEAR = 360;
  const FOOD = ["field", "milk", "craft", "own", "wood", "teach", "read"];   // food first, as the village's own order (crafts before collecting)
  // An order is filled out with every job it lacks, at the end (VillageModel.fullOrder), so an order that
  // leaves a job out ends in 發呆 ("idle"), past which nothing runs
  const SCHOOL = ["teach", "field", "milk", "own", "wood", "read", "idle"];   // class before anything (children), teaching first (scholars); neither crafts
  const CRAFT = ["craft", "own", "wood", "field", "milk", "teach", "read"];   // the smith: the forge first, quarrying while it waits
  const CRAFT_WOOD = ["craft", "wood", "own", "field", "milk", "teach", "read"];   // or cutting timber while it waits
  const GATHER = ["own", "wood", "field", "milk", "teach", "read", "idle"];   // the smith's gatherer (a man): 採石 quarrying first, then 伐木 woodcutting
  // The most people the cows and the 4 fields feed well: past it, short days, and hunger's toll
  const FED = 20;

  const grownUps = (v) => v.people.filter((h) => v.stageOf(h) !== "child");
  const adultsOf = (v) => v.people.filter((h) => v.stageOf(h) === "adult");
  const isChild = (v, h) => v.stageOf(h) === "child";
  const byIntel = (list) => list.slice().sort((a, b) => b.intel - a.intel || a.id - b.id);
  // Everyone's order of the day's jobs, with the player's division of labour: of those (but keep) whose
  // orders collect both, every other one, by age, cuts timber (伐木) before their own (採石 / 羊毛), so
  // each is collected more or less equally, as the villagers going by the village's order split themselves
  function ordersFor(v, of, keep = new Set()) {
    const swap = (o) => o.map((j) => (j === "own" ? "wood" : j === "wood" ? "own" : j));
    let k = 0;
    return v.people.slice().sort((a, b) => b.age - a.age || a.id - b.id).map((h) => { const o = of(h); return [h, !keep.has(h) && o.includes("own") && o.includes("wood") && k++ % 2 ? swap(o) : o]; });
  }
  // Enough SR crafts in store for everyone (the best are taken first, so the starting R ones wait): a 衣
  // and a 笠 each, a 刀 and a 叉 each grown-up, and a fifth to spare
  function topUp(v) {
    if (!v.crafts) return [];
    const n = v.people.length, g = grownUps(v).length;
    return [["clothes", n], ["hat", n], ["blade", g], ["fork", g]].map(([id, want]) => ({ id, tier: SR, n: Math.ceil(want * 1.2) - v.count(id, SR) })).filter((x) => x.n > 0);
  }
  // The school's scholar: the brightest adult, once there are 6 adults (none before), so the food work
  // keeps its hands
  function brightest(v) {
    const ad = adultsOf(v), g = byIntel(ad.length ? ad : grownUps(v));
    return g.slice(0, ad.length >= 6 ? 1 : 0);
  }
  // Or the strongest adult: a child learns while both are in class, until either runs out of energy, so a
  // scholar with more energy (Power) teaches for longer
  function strongest(v) {
    const ad = adultsOf(v);
    return ad.length >= 6 ? [ad.slice().sort((a, b) => b.power - a.power || a.id - b.id)[0]] : [];
  }
  // A man kept at one job for life, his elder years too (P[key]), so his skill builds up: while he lives
  // and ok(him) holds; else, while `when`, the youngest adult man for whom it does
  function keptMan(v, P, key, when, ok) {
    if (!(P[key] && v.people.includes(P[key]) && ok(P[key]))) {
      P[key] = when ? adultsOf(v).filter((h) => h.sex === HumanModel.MALE && ok(h)).sort((a, b) => a.age - b.age || a.id - b.id)[0] || null : null;
    }
    return P[key];
  }
  // The forge's smith: a man who isn't a scholar (keptMan), picked once there are 4 adults
  const smithOf = (v, P, isSch) => keptMan(v, P, "smith", adultsOf(v).length >= 4, (h) => !isSch.has(h));
  // Whether the store holds 90 days' food: only then do children put class first
  const rich = (v) => v.foodDays >= 90;

  // ---------- Births ----------
  // Every couple may have a child, or (yes false) none may
  const birthsAll = (v, yes) => (v.couples ? v.couples.map((cp) => [cp, yes]) : null);
  // Children only while the store holds 30 days' food: a hungry village doesn't take on more mouths
  const birthsFed = (v) => birthsAll(v, v.foodDays >= 30);
  // Whether there's room for one more child: fewer than `most` children (those on the way counted) and,
  // with the children on the way, under FED people
  function roomFor(v, most) {
    const coming = v.people.filter((h) => h.carry > 0).length, kids = v.people.filter((h) => isChild(v, h)).length;
    return v.people.length + coming < FED && kids + coming < most;
  }
  // Children only while there's room for one (roomFor): the extra milk and the lessons go further among
  // fewer children, so each grows stronger and brighter, and the village doesn't outgrow its food in a rush
  const birthsSpaced = (v, most) => birthsAll(v, roomFor(v, most));
  // The couple who could have a child now (both adults, she able to conceive) with the most of score
  // between them, or none
  function bestCouple(v, score) {
    const ok = (v.couples || []).filter(([m, f]) => v.stageOf(m) === "adult" && HumanModel.canConceive(f, v.p));
    return ok.sort((a, b) => score(b[0]) + score(b[1]) - score(a[0]) - score(a[1]) || a[1].id - b[1].id)[0] || null;
  }
  // The best couple (bestCouple), given the month off (發呆) while there's room for a child and two months'
  // food: the energy they leave unspent makes them happier, and the happier, the likelier a child
  const restingPair = (v, most, score) => new Set(v.couples && roomFor(v, most) && v.foodDays >= 60 ? bestCouple(v, score) || [] : []);

  // The smith's gatherer: another man who isn't a scholar (keptMan), picked once there's a smith
  const gathererOf = (v, P, isSch, smith) => keptMan(v, P, "gatherer", !!smith, (h) => h !== smith && !isSch.has(h));
  const noCraft = (o) => (o.includes("craft") ? [...o.filter((j) => j !== "craft"), ...(o.includes("idle") ? [] : ["idle"])] : o);

  // ---------- A player's day ----------
  // What every strategy here does, with its own births and orders: the well full, SR crafts as needed, a
  // scholar from 6 adults (teaching first: the brightest, or the strongest with scholar "strongest"), and
  // with smith, a smith (smithOf, the forge first). order(h) is everyone else's order of the day's jobs,
  // given on the 1st of each month; a child's never holds craft (they can't), and with smith "only",
  // nobody's but the smith's does, and he has a gatherer (gathererOf, quarrying first, then woodcutting).
  function play(v, P, { births, smith = false, scholar = "brightest", order }) {
    const sch = v.school ? (scholar === "strongest" ? strongest(v) : brightest(v)) : null, isSch = new Set(sch || []), sm = smith ? smithOf(v, P, isSch) : null;
    const gat = smith === "only" ? gathererOf(v, P, isSch, sm) : null;
    const own = (h) => { const o = order(h); return smith === "only" || isChild(v, h) ? noCraft(o) : o; };
    // The smith's own collecting while the forge waits: timber, with a gatherer quarrying for him; without
    // one, stone and timber month about
    const smithOrder = gat || Math.floor((v.doy - 1) / 30) % 2 ? CRAFT_WOOD : CRAFT;
    return { refill: true, gifts: topUp(v), scholars: sch, births,
      orders: v.month ? ordersFor(v, (h) => (isSch.has(h) ? SCHOOL : h === sm ? smithOrder : h === gat ? GATHER : own(h)), new Set([sm, gat])) : null };
  }
  const BOTH = (h) => h.power + h.intel;

  const STRATEGIES = [
    {
      id: "population", zh: "人丁興旺", en: "Most people", goal: "the most people at once",
      how: "Every couple may have children whenever the store holds 30 days' food, so the village grows as fast as it can into all the food there is, and past it: the most people at once comes at the top of a boom, before hunger's toll brings it down again. Keeps the well full and gives every villager SR 衣 and 笠 and every grown-up an SR 刀 and 叉 as they're needed. Once there are 4 adults the youngest man who isn't a scholar becomes the smith, the forge first for life, quarrying and cutting timber month about while it waits: his SSR 叉 make the 4 fields' tending go further, and his 刀 the harvest. One scholar, the brightest adult, once there are 6 adults; while the store holds 90 days' food the children go to class first (the brighter work faster when they grow up), and everyone else works the food first. How many it reaches is set by hunger: a day of life for each food missed means a single day without food costs a grown-up some 100 days, so the few short days a booming village has take years off its people's lives. It tops out at about 21. What doesn't raise it: weaker villagers (a milker's milk and a farmer's rice come from the Power they spend, which is the same as what they eat), crashing the village and regrowing it from its weakest, holding it steady to boom at the end, or keeping the same farmers on the fields.",
      act: (v, P) => play(v, P, { births: birthsFed(v), smith: true, order: (h) => (rich(v) && isChild(v, h) ? SCHOOL : FOOD) }),
    },
    {
      id: "sum", zh: "文武雙全", en: "Best all-rounder", goal: "the highest Power + Intelligence anyone reaches",
      how: "Raises a strong, bright line, generation by generation, all run. Holds the village under 20 people (the children on the way counted), keeps the well full and gives SR crafts as needed. At most 2 children at a time, any couple's, and both go to class first thing every day. The scholar, once there are 6 adults, is the strongest adult, not the brightest: a child learns while both are in class, until either runs out of Power, so a stronger scholar teaches for longer. Everyone else works the food first. While there's room for a child and two months' food, the couple with the most Power + Intelligence between them who could have one gets the month off (發呆): the Power they leave unspent makes them happier, so the likelier a child of theirs. Children take 0.7 of their parents' average, +24 coming of age, and grow in childhood, Power with the extra milk and Intelligence with the lessons, so with few at a time each gets more of both, and every generation starts higher. It is also the way to the highest Power and the highest Intelligence: raising for either alone came out within a few points of it. Nobody is killed.",
      act(v, P) {
        const off = restingPair(v, 2, BOTH);
        return play(v, P, { births: birthsSpaced(v, 2), scholar: "strongest", order: (h) => (isChild(v, h) ? SCHOOL : off.has(h) ? ["idle"] : FOOD) });
      },
    },
    {
      id: "sustain", zh: "自給自足", en: "Sustainable", goal: "the most people, on an average day, over its years on its own",
      how: "For the hands-off years it builds the village up: the well full, SR 衣 笠 刀 叉 as needed, one scholar (the brightest) who teaches, everyone on the food first, nobody killed, and no children while the store holds under 30 days' food. On its last day it fills the store with enough SR crafts for everyone to the end of the run, then lets go: every couple may have children again, there are no more refills, gifts or kills, and the village appoints its own scholars from then on.",
      act(v, P) {
        const sch = v.school ? byIntel(grownUps(v)).slice(0, 1) : null;
        const gifts = topUp(v);
        if (v.day === P.until && v.crafts) {   // the last day: crafts to the end of the run (a 衣 or 笠 lasts about 20 days of work)
          const years = Math.max(0, (P.runDays - v.day) / YEAR), n = v.people.length, g = grownUps(v).length;
          for (const [id, who] of [["clothes", n], ["hat", n], ["blade", g], ["fork", g]]) gifts.push({ id, tier: SR, n: Math.ceil(who * 18 * years * 1.5) });
        }
        return { refill: true, gifts, scholars: sch, births: v.day === P.until ? birthsAll(v, true) : birthsFed(v), orders: v.month ? ordersFor(v, () => FOOD) : null };
      },
    },
    {
      id: "ur", zh: "神兵利器", en: "A UR craft", goal: "a UR craft, or else the most SSR ones",
      how: "Division of labour. Holds the village under 20 people (the children on the way counted), keeps the well full, gives SR crafts as needed and has one scholar from 6 adults; children go to class first while the store holds 90 days' food; at most 2 children at a time. Once there are 4 adults the youngest man who isn't a scholar becomes the smith, the forge first every day for the rest of his life; the next youngest becomes his gatherer, quarrying (採石) first every day, then cutting timber (伐木), for life, while the smith cuts timber whenever the forge waits for materials: each does one job before the other, so gets to level 4 at it in half the time. Nobody else may use the forge or the loom, so the best stone and timber go to the smith alone, and only his skill goes into a craft. A craft's tier comes from its crafter's skill, their 刀's and its materials': UR takes all three at SSR (a level-4 smith, an SSR 刀, SSR stone and timber), and then 1 roll in 400, so the smith first works 111,100 Power at the forge to reach level 4, with the gatherer keeping him in materials, 300 for every 100 Power of forging. Once one UR 刀 exists, the smith works with it, and the odds of the next jump to about 1 in 7. In test villages it came in about two in five.",
      act: (v, P) => play(v, P, { births: birthsSpaced(v, 2), smith: "only", order: (h) => (rich(v) && isChild(v, h) ? SCHOOL : FOOD) }),
    },
  ];
  const byId = Object.fromEntries(STRATEGIES.map((s) => [s.id, s]));
  // The player for cfg.player = { id, handsOff (years, Sustainable), runDays }: plays until `until`
  function player(cfg) {
    const s = byId[cfg.id];
    if (!s) return null;
    const P = { until: s.id === "sustain" ? Math.round((cfg.handsOff ?? 10) * YEAR) : Infinity, runDays: cfg.runDays || 100 * YEAR };
    return { until: P.until, act: (v) => s.act(v, P) };
  }

  window.StrategyModel = { STRATEGIES, player, SR };
})();
