// Implementation details: every rule a page runs, tersely, for building the simulation into the game.
// Each page has <section class="card impl" data-page="..."> with a .rules-body inside; this fills it
// with the groups that page uses, then a footer of simulation notes (how the page runs, not game rules).
// Numbers that are settings come from settings(): each page's as it is now (saved, else the default), so
// the text follows the sliders; numbers written in are fixed rules. Keep this in step with the models: from the Attribute page on, these are
// Micro mode's rules (micro-model.js), complete enough to rebuild it and as short as that allows; worked
// examples belong in page hints. The Rulebook page (rulebook.html) says the same in plain words, sorted
// into the game's rules and the simulation's; a change here may need it there too. tools/spec.js makes
// SPEC.md from this (the Strategy and Weather pages' groups): run it after a change here.
(function () {
  const ORDER = ["herd", "humans", "food", "map", "attribute", "inheritance", "education", "happiness", "resources", "craft", "weather", "clothing", "watering", "strategy"];

  // ---------- The settings in effect ----------
  // Every page's settings as they are now: what its page saved, else the defaults, from the models this
  // page loads (a page quotes only its own and earlier pages' rules, whose models it loads); the village
  // pages' by their settings tables (VillagePage.SPECS). d: figures worked out from them.
  function settings() {
    const W = window, of = (M) => (M ? (M.savedParams && M.savedParams()) || { ...M.DEFAULTS } : {}), start = (M) => (M ? (M.savedStart && M.savedStart()) || { ...M.START } : {});
    const N = { herd: { ...of(W.HerdModel), ...start(W.HerdModel) }, human: { ...of(W.HumanModel), ...start(W.HumanModel) }, food: of(W.FoodModel), map: of(W.MapModel), weather: W.WeatherModel ? W.WeatherModel.savedParams() : null };
    const V = W.VillagePage;
    if (V) for (const k in V.SPECS) N[k] = V.readSaved(V.SPECS[k]).values;
    const A = N.attribute, I = N.inheritance, E = N.education, R = N.resources, F = N.food, H = N.human, Mp = N.map, C = N.clothing, Wa = N.watering, Cr = N.craft;
    N.d = {
      // for the Rulebook's plain words (fill)
      childNeed: H.c * 0.7, elderNeed: H.c * 0.8,
      walkText: Mp.minPerTile === 1 ? "1 minute" : `${n(Mp.minPerTile)} minutes`, milkKeepText: F.milkKeep === 1 ? "1 day" : `${n(F.milkKeep)} days`,
      clothTop: C ? C.clothStep * 5 : null, hatTop: C ? C.hatStep * 5 : null, fireTop: C ? C.fireStep * 4 : null,
      wellGround: Wa ? Math.min(Wa.wellCap, Wa.wellGround) : null, growthText: Wa ? growthWords(Wa) : null,
      tollText: H.k === 1 ? "a day" : `${n(H.k)} days`, joyText: N.happiness ? (N.happiness.joyStep === 1 ? "each Power" : `every ${n(N.happiness.joyStep)} Power`) : null,
      scholarsText: E ? (E.maxScholars === 1 ? "one scholar" : `up to ${n(E.maxScholars)} scholars`) : null,
      craftEnergyText: Cr ? craftFigures(Cr).craftEnergy().replace(/^each/, "Each").replace(/^they/, "They") : null,
      wearText: Cr ? (["clothes", "hat", "blade", "fork"].every((id) => Cr[id + "Wear"] === Cr.clothesWear) ? `each after ${n(Cr.clothesWear)} Power` : `衣 after ${n(Cr.clothesWear)} Power, 笠 ${n(Cr.hatWear)}, 刀 ${n(Cr.bladeWear)}, 叉 ${n(Cr.forkWear)}`) : null,
      elderShare: A ? 1 - A.elderPenalty / 100 : null, kidFloor: I ? 70 - I.grow : null,
      scholarPower: E ? 1 - E.scholarShift / 100 : null, scholarIntel: E ? 1 + E.scholarShift / 100 : null,
      expTotal: R ? R.exp1 + R.exp2 + R.exp3 + R.exp4 : null,
      riceYear: W.FoodModel && F.fieldCap ? W.FoodModel.riceYearOf(F) : null, fieldRice: F.fieldCap && F.ricePerEnergy ? F.fieldCap / F.ricePerEnergy : null,
      cowMilk: F.milkPerEnergy ? 100 * F.milkPerEnergy : null,
    };
    return N;
  }
  // A number as the text writes it: thousands grouped, at most d decimals, a true minus; hours with a half
  // as ½; a sign on a gain; a tier's code
  const n = (v, d = 4) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d }).replace("-", "−");
  const hrs = (v) => (Math.abs((v % 1) - 0.5) < 1e-9 ? `${Math.floor(v) || ""}½` : n(v, 2));
  const signed = (v) => (v > 0 ? "+" + n(v) : n(v));
  const TIER_CODES = ["", "N", "R", "SR", "SSR", "UR"];
  const tierName = (t) => TIER_CODES[t] || n(t);
  // One value for every season ("8 °C in every season"), or each season's ("15 / 30 / 15 / −5")
  const SEASON_IDS = ["spring", "summer", "autumn", "winter"];
  const seasonal = (Wx, key, unit = "", d = 4) => { const v = SEASON_IDS.map((s) => Wx[s][key]); return v.every((x) => x === v[0]) ? `${n(v[0], d)}${unit} in every season` : `${v.map((x) => n(x, d)).join(" / ")}${unit}`; };
  const perSeason = (Wx, key, unit = "", d = 4) => SEASON_IDS.map((s) => n(Wx[s][key], d)).join(" / ") + unit;
  // The Watering page's growth table in words, by what each level grows: "+100 a day at level 4, +50 at 3
  // and 5, …, nothing at 1 and 7, and it loses rice at the others (−25 at 8, …)"
  function growthWords(Wa) {
    const g = Array.from({ length: 11 }, (_, k) => Wa["g" + k]), vals = [...new Set(g)].sort((a, b) => b - a);
    const at = (v) => { const ks = g.flatMap((x, k) => (x === v ? [k] : [])); return ks.length > 1 ? `${ks.slice(0, -1).join(", ")} and ${ks[ks.length - 1]}` : `${ks[0]}`; };
    const gains = vals.filter((v) => v > 0).map((v, i) => `${signed(v)}${i ? "" : " a day"} at ${i ? "" : "level "}${at(v)}`);
    const none = vals.includes(0) ? [`nothing at ${at(0)}`] : [], losses = vals.filter((v) => v < 0).map((v) => `${n(v)} at ${at(v)}`);
    return [...gains, ...none].join(", ") + (losses.length ? `${gains.length + none.length ? ", and it loses rice at the others" : "It loses rice"} (${losses.join(", ")})` : "");
  }

  function groups(page) {
    const N = settings(), Hd = N.herd, H = N.human, F = N.food, M = N.map, Wx = N.weather, D = N.d;
    const A = N.attribute || {}, I = N.inheritance || {}, Ed = N.education || {}, Hp = N.happiness || {}, R = N.resources || {}, C = N.clothing || {}, St = N.strategy || {}, Wa = N.watering || {}, Cr = N.craft || {};
    const { recipe, craftEnergy, startKit, wears } = craftFigures(Cr);
    const at = (name) => ORDER.indexOf(page) >= ORDER.indexOf(name);   // this page or a later one
    const is = (...names) => names.includes(page);
    const working = at("attribute");   // people work for their food, on the Map page's map and day
    const school = at("education"), happiness = at("happiness"), resources = at("resources"), skills = resources, crafts = at("craft"), cold = at("clothing"), wet = cold, watering = at("watering"), strategy = at("strategy");
    const out = [];
    const add = (title, where, items, opts = {}) => out.push({ title, where, items, ...opts });
    const T12 = `the ${hrs(M.activeHours)} h rule`;
    const walking = () => {
      add("Map and walking", "Map", [
        `The map is a 16 × 16 grid; a tile is empty or a house, farm, pasture, forest, mine, well (井) or river (川). Each kind of place is worked at its tile with the fewest steps (no diagonals) to a house (on a tie, the first in reading order: rows top to bottom, each left to right). Walking takes ${n(M.minPerTile)} minute${M.minPerTile === 1 ? "" : "s"} a tile: between the house and a place, that place's steps; between two places, the steps between their two tiles.`,
        `Waking: the N people, in a random order, wake between ${n(M.wakeFrom)} and ${n(M.wakeTo)} o'clock: draw N + 1 exponential gaps g₀ … g<sub>N</sub>; the k-th (from 0) wakes at ${n(M.wakeFrom)} + ${n(M.wakeTo - M.wakeFrom)} × (g₀ + … + g<sub>k</sub>) ÷ (g₀ + … + g<sub>N</sub>). Every time below is in hours since that person woke.`,
        `The day: out of the house for ${hrs(M.activeHours)} h. Breakfast first, by the house (${n(M.mealMin)} min). From ${hrs(M.lunchAfter)} h they go home for lunch (if idle, at once; if working, once the unit in hand is done and carried home), eat by the house (${n(M.mealMin)} min) and go out again. From ${hrs(M.activeHours)} h the same, home for the night; they go in on reaching the house.`,
        `Work goes a unit at a time: 10 Power, or less if the person or the job has less left, taking unit ÷ r hours (r: see Power and Intelligence). <b>A unit starts only if they'd finish it and be home by ${hrs(M.activeHours)} h</b> (${T12}); once started, it's finished. What's collected (milk, the harvest${resources ? ", timber, wool, stone" : ""}) is carried home after every ${n(M.load)} Power and at the end of the job: a walk home and back each time. Anyone with nothing to do waits by the house.`,
      ]);
      add("Hunger through the day (display only)", "Map", [
        "Only shown, in Micro mode: it changes nobody's work and costs no days of life (hunger's toll goes by the food missed; see People). Let g be the share of their need they ate (at most 1; see Eating). Breakfast and lunch each keep them full for <b>f = 6g</b> hours: breakfast until f; lunch, from Lh (when they got home for it), until max(f, Lh) + f. They show as hungry with 2.4 h or less of that left.",
        `Going in early: let o be when they were first back at the house with no Power left. If o < Lh and max(o, f − 2.4) < Lh, they go in at o and skip lunch. Otherwise, if max(o, Lh + ${n(M.mealMin)} min, max(f, Lh) + f − 2.4) is before E (when they went in for the night), they go in then instead. Never home for lunch: Lh = ${hrs(M.lunchAfter)}; never went in: E = ${hrs(M.activeHours)}.`,
      ]);
    };
    if (is("map")) { walking(); return out; }
    if (is("weather")) {
      add("Seasons", "Weather", [
        "Days 1–90 of each year of 360 are spring, 91–180 summer, 181–270 autumn, 271–360 winter. Each season has its own settings: cloud rate λ, average wind w̄, wind volatility σ, cloudiness q, rain changeability ρ, and for the temperature μ, s, c, k.",
        `<b>Settings</b> (spring / summer / autumn / winter): λ ${perSeason(Wx, "spawnRate")} an hour; w̄ ${perSeason(Wx, "wind")} tiles an hour (so the spells last L = ${SEASON_IDS.map((s) => (Wx[s].wind > 0 ? n(WeatherModel.spellOf(Wx[s]), 0) : "∞")).join(" / ")} h); σ ${perSeason(Wx, "windVol")}; q ${perSeason(Wx, "cloudiness")}%; ρ ${perSeason(Wx, "rainChange")} an hour; average temperature μ ${perSeason(Wx, "temp")} °C; ${["tempSd", "cloudCool", "rainCool"].every((k) => SEASON_IDS.every((x) => Wx[x][k] === Wx.spring[k])) ? `and in every season spread s ${n(Wx.spring.tempSd)} °C, cloud cooling c ${n(Wx.spring.cloudCool)} °C, rain cooling k ${n(Wx.spring.rainCool)} °C` : `spread s ${perSeason(Wx, "tempSd")} °C, cloud cooling c ${perSeason(Wx, "cloudCool")} °C, rain cooling k ${perSeason(Wx, "rainCool")} °C`}.`,
        `<b>Season ramp</b>, h = ${n(Wx.rampDays)} days: the base temperature b(d) on day d is its season's μ, except within h days of a season's start. There, with p the days from the boundary, counted at mid-day (a season's first day is p = 0.5, the day before it p = −0.5), b = μ<sub>before</sub> + (μ<sub>after</sub> − μ<sub>before</sub>) × (p + h) ÷ 2h. h = 0: no ramp.`,
        "On a season's first day its settings take over at once: a new wind is drawn, and the waits for the next cloud, the spell's end, the wind's change and the rain re-roll are drawn afresh (as below). The clouds in the sky, the spell and the rain die carry on.",
      ]);
      add("Clouds and rain", "Weather", [
        "The sky alternates clear spells (no clouds come) and cloudy ones. A cloudy spell lasts an exponential time with mean Lq h, a clear one mean L(1 − q) h, where L = 16 × 16 ÷ w̄: a clear and a cloudy spell together last 16 crossings of the 16-tile sky at the average wind. No wind: the spell never changes. q = 0: always clear; q = 100%: always cloudy.",
        "The sky over the 16 × 16 map holds at most 10 clouds. In a cloudy spell, clouds come at the west edge at random: the gaps between them are exponential with mean 1 ÷ λ (a fresh gap is drawn when a cloudy spell starts). A cloud due while 10 are in the sky doesn't come.",
        "Wind v, the same for every cloud, holds for an exponential time (mean 3 h); then a new v is drawn from a gamma distribution with mean w̄ and standard deviation σ (shape (w̄ ÷ σ)², scale σ² ÷ w̄). σ = 0: always w̄; w̄ = 0: no wind.",
        "Each cloud comes in at x = 0, on a row drawn evenly over the map's height, blows east at v and leaves at x = 16 (after 16 ÷ w̄ h at the average wind; with no wind, never). All clouds move together, so they leave in the order they came.",
        "Start (day 1, spring): the spell is cloudy with chance q, its length drawn as above, and the wind drawn as above. With q = 100% and σ = 0 (or no wind), the sky starts with n clouds, n drawn from the distribution below, each at an even draw across the width; otherwise it starts empty and runs for 5 × (16 ÷ w̄ + L + 3) h first.",
        "<b>Rain</b>: with n clouds in the sky it rains with chance <b>log₁₀(n)</b> (0 for n ≤ 1), at rainfall n. The sky keeps a rain die d, an even draw in [0, 1) (its own dice), re-rolled after exponential gaps with mean 1 ÷ ρ; it's raining whenever d < log₁₀(n), checked after every cloud coming or leaving and every re-roll. Start: d drawn evenly.",
        "With q = 100% and σ = 0, <b>the share of time with n clouds</b>, a = λ × 16 ÷ w̄, is <b>aⁿ ÷ n!</b> over the sum of aᵏ ÷ k! for k = 0 … 10, and the share of clouds turned away is the n = 10 share. No wind: always 10 once any cloud has come. Otherwise the counts are clumpier (more 0s and more 10s), and the page simulates them.",
      ]);
      add("Temperature", "Weather", [
        "One temperature T a day (midnight to midnight). The day's weather part is <b>x = −(c × its average clouds ÷ 10 + k × its hours raining ÷ 24)</b>.",
        "<b>T = b(d) + x − x̄ + e × u</b>: x̄ is the average of x over a long run of the season's settings (86,400 hours of them alone), so T averages b; e = √(max(0, s² − the variance of x over that run)) (so T's standard deviation is s), and u carries over day to day: u ← 0.6u + 0.8z (z a standard normal draw, the temperature's own dice; start: u = z).",
        "Rain on a day below 0 °C is snow (at the same rate).",
        `<b>Through the day</b> (nothing above depends on it): at clock hour t the temperature is <b>T + (D ÷ 2) × f(t)</b>, with f = −cos(π (t − 6) ÷ 9) from 06:00 to 15:00 and cos(π ((t − 15) mod 24) ÷ 15) otherwise: lowest, T − D ÷ 2, at 06:00, highest, T + D ÷ 2, at 15:00, and T on average. D = the daily swing × (1 − 0.6 × the day's average clouds ÷ 10); daily swing ${seasonal(Wx, "swing", " °C")}.`,
        "A day's type is what most of its hours were: sunny (no clouds), cloudy (clouds, no rain) or rainy / snowy; a tie goes to the wetter.",
      ]);
      add("Water level", "Weather", [
        "The land has one water level W, held to 0–10, starting at 5 when the run starts (the weather runs on year after year). W = 0 is a <b>drought</b>, W = 10 a <b>flood</b>.",
        `While it rains (or snows) at rainfall n, W rises n ÷ ${n(Wx.water.perLevel)} an hour. Dry, it falls d × (1 + ${n(Wx.water.slope)} × (W − 5) ÷ 5) an hour, d = ${n(Wx.water.sunnyDrain)} with no clouds and ${n(Wx.water.cloudyDrain)} with clouds; that is, a + bW with a = ${n(1 - Wx.water.slope)}d and b = ${n(Wx.water.slope / 5)}d.`,
        `The sky only changes at its events (a cloud coming or leaving, the spell or the wind changing, a re-roll), so between two events W follows a set curve: rising, W + nt ÷ ${n(Wx.water.perLevel)}; falling, <b>W(t) = (W₀ + a/b) e<sup>−bt</sup> − a/b</b> (b = 0: W₀ − at). Work it out event by event, stopping at 0 or 10 at the moment it gets there.`,
        "The mountain above the river keeps a second level, the same way (starting at 5, the same rain, the same drain), except that it doesn't drain in hours below −5 °C (the hour's temperature through the day: the river is frozen). The river runs while the mountain's level is above 0. It's never below W, so the river only runs dry in a drought (by default in about 5% of years, about one drought in three).",
      ]);
      return out;
    }

    add("Terms", "", [
      "Time goes in days; a year is 360 days, and the day of the year is ((day − 1) mod 360) + 1." + (at("humans") ? " Village order: the starting men, then the starting women, then everyone else in the order they came (born or joined)." : ""),
      "u is an even (uniform) draw in [0, 1); “an even draw” of a range is uniform over it. ⌊x⌋ rounds down, ⌈x⌉ rounds up. Each kind of randomness has its own dice (see Simulation notes).",
    ]);

    if (!is("humans")) add("Cows", "Herd", [
      `Each cow lives ${n(Hd.L)} × (1 ± up to ${n(Hd.S)}%) days, an even draw. Start: ${n(Hd.N0)} cows, each aged ⌊u × its lifespan⌋.` + (at("food") ? ` Calves (under ${n(Hd.M)} days) give no milk.` : ` Under ${n(Hd.M)} days, a calf.`),
      `Each day every cow ages a day, and those reaching their lifespan die. Then, with N cows left, the herd changes by <b>Δ = r·N·(N/A − 1)·(1 − N/K)</b> (r ${n(Hd.r)}, A ${n(Hd.A)}, K ${n(Hd.K)}): by the whole part of |Δ|, and one more with chance its fraction (2.3: 2, and a third at 30%). Δ > 0: that many calves are born, never past ${n(Hd.K * 10)} cows (10 × K). Δ < 0: that many cows, drawn at random, die.`,
      at("food") && "The herd lives on its own: nothing the village does changes it. The village milks the cows that were adults the day before.",
      "Tiers: 1 N, 2 R, 3 SR, 4 SSR" + (crafts ? ", and 5 UR (crafts only)" : "") + `. <b>draw(x)</b> = x + an even draw of −0.49, −0.48, …, +0.50, rounded half up and held to 1–4 (cows and sheep: 1–3). Every starting cow is ${tierName(Hd.cowTier)}${resources && Hd.sheepTier !== Hd.cowTier ? ` (sheep: ${tierName(Hd.sheepTier)})` : ""}. A calf's tier is draw(the average tier of two different adults, drawn at random; with one adult, it twice; with none, any two of the herd).`,
    ]);

    if (at("humans")) add("People", "Humans", [
      `Each person lives ${n(H.L)} × (1 ± up to ${n(H.S)}%) days, an even draw. A child under ${n(H.M)} days, an adult until ${n(H.E)}, an elder from then; adults and elders are grown-ups. Start: ${n(H.men)} men and ${n(H.women)} women, each aged min(lifespan − 1, ${n(H.M)} + ⌊u × (lifespan − ${n(H.M)})⌋).`,
      happiness
        ? `Couples. Each night, after the deaths, a couple with a dead partner ends, and the single adult men and women pair up at random (as many couples as the smaller group); a couple then lasts until one of them dies. Next, mothers who conceived G = ${n(H.G)} days ago give birth (a mother who died first loses the child; a father who died still counts as the father). Then each couple of two adults whose woman can conceive (she isn't expecting, and her age + G is under ${n(H.E)}) conceives with its chance (see Happiness).`
        : `Couples: as many as min(adult men, adult women). Each night, after the deaths, mothers who conceived G = ${n(H.G)} days ago give birth (a mother who died first loses the child). Then of the first adult women in village order, as many as there are couples, each who can conceive (she isn't expecting, and her age + G is under ${n(H.E)}) does with chance ${n(H.p)}.`,
      `A newborn is a boy with chance (W + X) ÷ (M + W + 2X): M and W are the living males and females under elder age, tonight's newborns counted as they come, and X is the birth balance (${n(H.X)}; 0–1). Nobody to count: even odds.`,
      (working ? `Need: everyone eats their <b>Power</b> in food a day, children too; an elder ⌊Power × ${n(D.elderShare)}⌋, the Power they work with (the elder penalty).` : `Need: ${n(H.c)} food a day for an adult, ${n(H.c * 0.7)} for a child, ${n(H.c * 0.8)} for an elder.`) + " Eating a share s of their need, someone misses (1 − s) × their need" + (at("food") ? " (s: the children's or the grown-ups' share, see Eating)" : " (s: the same for everyone, the day's food ÷ everyone's need, at most 1)") + `. <b>Hunger's toll</b>: their lifespan is their drawn lifespan less <b>⌊${H.k === 1 ? "" : n(H.k) + " × "}S⌋</b> days, S being all the food they've missed in their life${H.k === 1 ? " (a day of life for each food missed)" : ""}; they die when their age reaches it. So a day with nothing to eat, at a need of 100, costs ${n(100 * H.k)} days.`,
      "Newcomers: after the births, a village of n people (tonight's newborns included) under 10 gains an outsider with chance 1 ÷ (10 × (n + 1)²): a grown-up aged 360 + ⌊u × 1,081⌋ days (at most their lifespan − 1), a man or woman by the newborns' rule" + (working ? ", with Power and Intelligence each 80 + ⌊u × 21⌋" : "") + ". So an empty village gets someone at 1 in 10 a day; it has \"died out\" only while nobody is there.",
      is("humans") && `Each day: hunger, ageing and deaths, births, newcomers. Food: a fixed ${n(H.F)} a day, shared out in proportion to need, never stored.`,
    ]);

    if (at("food")) add("Food", "Food", [
      `Milk and rice meet need one for one. Food made on day d keeps until day d + its keeping time (milk ${n(F.milkKeep)}, rice ${n(F.riceKeep)}), then spoils. Start: ${n(F.foodStart)} food in store that never spoils.`,
      `A standard day is 100 Power. 1 Power spent milking collects ${n(F.milkPerEnergy)} milk; 1 Power spent tending grows ${n(F.ricePerEnergy)} rice, each of the 4 fields giving at most ${n(F.fieldCap)} a year. A cow has no milk limit, whatever its tier.`,
      !working && `Nobody works: each adult cow gives a standard day's milk (${n(D.cowMilk)}); while any adult lives, the year's ${n(D.riceYear)} rice comes in evenly over days 181–210.`,
    ]);

    if (at("food")) add("Eating", "Food", [
      "Children eat first: their full need while there's any food in store (milk, rice or the starting food), the milk first (the oldest first), then whatever spoils soonest. If there isn't enough, each child gets the same share of their need.",
      "Then the grown-ups eat what's left, whatever spoils soonest first (milk before rice on a tie), the starting food last: their full need, or if short, each the same share of it, s = the food left ÷ the grown-ups' need. Nobody holds food back." + (at("inheritance") ? " If the grown-ups' need was met too, the children then drink all the milk left in store: <b>extra milk</b>, split evenly." : ""),
    ]);

    if (working) add("Jobs", "Jobs", [
      "Who may do each job is the Jobs table. By default: children milk" + (school ? " and go to class" : "") + "; men milk, tend, harvest" + (resources ? ", cut wood, quarry" : "") + (crafts ? ", forge" : "") + "; women the same, but " + (resources ? "shear instead of quarrying" : "likewise") + (crafts ? " and weave instead of forging" : "") + "; old men and women as men and women" + (school ? "; scholars (a row for each sex) write poetry and teach" : "") + ". The table's 生火 (fire-making) column isn't used. Field work is tending on days 1–180 and the harvest from day 181. A <b>milk-only</b> grown-up is one who may milk but not do today's field work.",
      "The village's order of jobs (its priority): the fields, milking, crafts (the loom, then the forge), 採石 / 羊毛 (quarrying for men, shearing for women), 伐木 (woodcutting), 教育 (class and teaching), 吟詩 (poetry). A page leaves out the jobs it doesn't have.",
      `Milking: one milker to each adult cow for the day, spending as much as they like on it. Fields: one person to each of the 4 fields for the day. The day's milk is the whole milk in all the Power spent milking so far in the run, less what earlier days made (fractions carry over). Tending: each field takes at most ${n(D.fieldRice)} ÷ 180 Power a day (so no one person gives it more), and on day 181 it holds ⌊its year's tending work⌋ rice. Harvest: each day wants ⌈min(400, the rice in the fields ÷ 25)⌉ Power of work, each bringing in 25 rice; whatever's left after day 270 is lost.`,
    ]);

    if (working) walking();

    if (working) add("The day, person by person", "", [
      "Everyone (grown-ups, children" + (school ? ", the scholars" : "") + ") starts the day at the house with their Power left e and rate r. Everything runs on one clock, events in time order, ties in village order. Each person has at most one event pending; a new one replaces it.",
      `Waking: breakfast, then they <b>choose</b>. Choosing at hour t: from ${hrs(M.activeHours)}, let go of any job` + (school ? " and class" : "") + ` and go home for the night; before lunch and from ${hrs(M.lunchAfter)}, go home for lunch, keeping the job` + (school ? " (but leaving class)" : "") + "." + (school ? " A scholar chooses as in Scholar and school." : "") + " Otherwise, with Power left, up to 4 tries: drop their job if there's nothing left for them there or no unit could start; then " + (school ? "a child without a food job chooses food work or class" : "a child without a job chooses food work") + ", and a grown-up without a job takes one from the board; then they go to it. If none is found, they <b>wait</b>.",
      `Waiting: they let go of the job and walk home if out (not choosing on the way). Back at the house, the first time with no Power left is o (for the display). They choose again at ${hrs(M.lunchAfter)} (after lunch, at ${hrs(M.activeHours)}), or sooner when work opens up.`,
      `Going to a job: they walk straight there and choose again on arrival. At the job, the unit is min(10, e, what the job lets them do), or 0 if it couldn't finish in time (${T12}); at 0 they let the job go and try again. Otherwise they work the unit; it's credited, and taken off e. Then they choose again where they are, except when collecting away from the house: the unit goes in their load, and with ${n(M.load)} carried, no Power left, or nothing more for them there, they walk home first (setting off home empties the load).`,
      `Home for lunch: Lh is then; they eat (${n(M.mealMin)} min) and choose. Home for the night: E is then, and their day is done.`,
      `<b>Could still do</b> at a place: the most whole Power (at most ⌊e⌋) they'd spend if they went there now and did only that job for the rest of the day, in whole units, by these rules: from where they are (while walking, from where they set out), with their load, from now or from the end of their meal; units start only before ${hrs(M.lunchAfter)} until they've lunched (after that: home, lunch and back first), and by ${T12}.`,
    ], { ordered: true });

    if (working) add("The job board", "", [
      "<b>Shared jobs</b>: milking (no end), the fields" + (resources ? `, shearing (it needs ⌈the wool on the sheep this morning ÷ ${n(R.woolPerEnergy)}⌉ Power), quarrying and woodcutting (no end)` : "") + ". Each has places, one person to a place for the day, theirs once they take the job: a cow each, the 4 fields" + (resources ? `, a sheep each with wool (the fullest first), ${n(R.mineCrew)} place${R.mineCrew === 1 ? "" : "s"} at the mine and ${n(R.forestCrew)} in the forest` : "") + ". A field takes at most its daily limit from its person" + (resources ? ", a sheep its wool" : "") + ". A job's open work = its need − what's done − what's reserved. Taking a job reserves min(open, what they could still do there, the place's limit), and they may then do what's left of their reservation. A grown-up who uses it up reserves again the same way (a child doesn't); at 0 there's nothing left for them. Letting go returns what's unused.",
      crafts && "<b>The loom and the forge</b>: one person at each a day, the first to take it keeping it all day. A station has work while a craft is under way, or when all its next item's materials are in store (a unit: min(10, e, what's left of the craft); with none under way, the first unit starts one). Someone takes it if nobody else has had it today, nobody holds it now, it has work, and they could still do at least 1 there.",
      "Grown-ups take the first job in priority order that they may do and can get. A milker's cow is theirs once they take milking, even between spells of it. A grown-up who may do today's field work takes a cow only if one is left over for each milk-only grown-up without a job or a cow (awake or not) who could still milk." + (resources ? " Collecting: at 採石 / 羊毛 they collect their own (men stone, women wool), at 伐木 timber; going by the village's order, at whichever of the two they come to first, they take whichever of their two materials fewer people are collecting so far today, then the other (see Sheep and resources)." : ""),
      "Children go down the same list: milking only if a cow is left over for each grown-up without a job (awake or not) who may milk and could; the fields only if a field is left over for each grown-up without a job or a field (awake or not) who may farm and could, and only for the gap those grown-ups couldn't cover (open − the sum of what they could still do there), at most that" + (school ? "; class, if their class is on. A child in class keeps the seat unless food work above class needs them" : "") + ".",
      "<b>Work opens up</b> when someone lets go of a shared job with reserved Power unused while some is open" + (crafts ? ", or of the loom or forge with work left" : "") + (school ? ", or a scholar runs out of Power or goes in" : "") + ": then everyone at the house with Power left who is waiting" + (school ? " or in class" : "") + " chooses again at once, in village order.",
    ].filter(Boolean));

    if (working) add("Power and Intelligence", "Attribute", [
      "A person's <b>Power</b> is both what they can spend in a day and what they eat. Each morning they have <b>e = ⌊Power⌋</b> to spend (their Power left), and they spend it at <b>r = Intelligence ÷ 10</b> Power an hour. Short of food, they still have their full Power the next day, but lose life (see People)" + (happiness ? "; Power left unspent at the end of a day becomes happiness" : "") + ". " + (is("attribute") ? `Everyone has Power ${n(A.power)} and Intelligence ${n(A.intel)}.` : `Starting grown-ups have Power ${n(A.power)} and Intelligence ${n(A.intel)}.`) + ` Elders work with both × ${n(D.elderShare)} (the elder penalty), and eat that much Power. Power and Intelligence never go below <b>70</b>` + (at("inheritance") ? `; a child's never below 70 less the coming-of-age bonus (${n(I.grow)}), ${n(D.kidFloor)}, at birth or from hunger` : "") + "." + (school ? ` A scholar works with Power × ${n(D.scholarPower)} and Intelligence × ${n(D.scholarIntel)} (the scholar adjustment).` : ""),
    ]);

    if (at("inheritance")) add("Inheritance", "Inheritance", [
      `A newborn's Power and Intelligence: each <b>max(${n(D.kidFloor)}, ⌊${n(I.share)} × the parents' average × (1 + v)⌋)</b>, v an even draw within ±${n(I.variation)}%, drawn for each. The parents: ` + (happiness ? "the mother and her partner when she conceived (alive or not by the birth); with no partner on record, a random adult man and woman" : "a random adult man and woman") + `; with no adult man or woman, the starting ${A.power === A.intel ? `${n(A.power)} each` : `${n(A.power)} and ${n(A.intel)}`}. (${n(D.kidFloor)} is 70 less the coming-of-age bonus, so a child born at it comes of age at 70.)`,
      "<b>Extra milk</b> (see Eating): when everyone, children and grown-ups, has eaten their full need, all the milk left in store is shared evenly among the children (fractions kept). Rice and the starting food never build Power.",
      `Each day after eating, a child's milk bank plus their extra milk buys Power one point at a time, each costing <b>(max(${n(I.dearerPast)}, P) − ${n(I.dearerPast)})² + ${n(I.powerBase)}</b> at their Power P then; the rest stays in the bank. Their hunger bank plus the food they missed (need × (1 − share)) takes <b>1 Power for every ${n(I.hungerFood)}</b>, down to ${n(D.kidFloor)} (even below their born Power). At ${n(H.M)} days they come of age: ${signed(I.grow)} Power and ${signed(I.grow)} Intelligence (the coming-of-age bonus), and both banks are emptied.`,
    ]);

    if (happiness) add("Happiness", "Happiness", [
      `Happiness = min(100, <b>max(0, ${n(Hp.happyBase)} − ⌊Intelligence ÷ ${n(Hp.iqStep)}⌋) + ⌊Power left at the end of their last day ÷ ${n(Hp.joyStep)}⌋</b>), set each night in time for that night's births and kept through the next day. Power left is what's unspent after all their jobs` + (school ? " and a child's class; a scholar who writes poetry has none" : "") + ". On day 1, and for a newborn, there's none yet.",
      `Each person's chance of conceiving is <b>${n(H.p)} × happiness ÷ 50</b>; a couple's is the average of the two.`,
    ]);

    if (resources) add("Sheep and resources", "Resources", [
      `Sheep follow the cows' herd model (the same settings, their own dice); the village has the sheep that were adults the day before. Each carries 0–${n(R.fleece)} wool: each morning all grow ${n(R.regrow)} back (up to ${n(R.fleece)}), and a sheep coming of age arrives with ${n(R.fleece)}.` + " When there are fewer adult sheep than the day before, they're removed one at a time from the wool level most sheep have (the lower on a tie). All of this is per tier.",
      `1 Power collects ${n(R.woodPerEnergy)} timber (forest), ${n(R.woolPerEnergy)} wool (pasture) or ${n(R.stonePerEnergy)} stone (mine); the forest and the mine never run out. One person to a place for the day: a shearer to each sheep with wool (the fullest first, taking at most its wool), and at most ${n(R.mineCrew)} quarrier${R.mineCrew === 1 ? "" : "s"} and ${n(R.forestCrew)} woodcutter${R.forestCrew === 1 ? "" : "s"} a day.` + " There are two jobs: 採石 / 羊毛 (a man quarries, a woman shears) and 伐木 (woodcutting). Going by the village's order, a grown-up at the first of the two they come to collects whichever of their two materials fewer people are collecting so far today (on a tie, the one the store had less of this morning; on a tie, their own), then the other. With an order of their own (the player's), each job is only its own material. Each person tries each material once a day. Each day's take is whole (fractions carry over) and kept for good. Wool comes off the fullest sheep first (the higher tier first), one sheep at a time. Children don't collect" + (crafts ? " or craft" : "") + ".",
      `Tiers: a person's tier at a skill is their level there (level 0 counts as N); ${R.forestTier === R.mineTier ? `the forest and the mine are ${tierName(R.forestTier)}` : `the forest is ${tierName(R.forestTier)}, the mine ${tierName(R.mineTier)}`}. Each day's take of wool, timber and stone has one average tier, the average of ` + (crafts ? "three" : "two") + ": the collectors' skill tiers, weighted by work; the source's (the forest's, the mine's, or the sheep's, weighted by the wool shorn off each)" + (crafts ? "; and the collectors' 刀 tiers (no 刀: N), weighted by work" : "") + ". The take fills lots of 100 in turn; each full lot's tier is draw(the average over its units).",
    ]);

    if (cold) add("The cold", "Clothing", [
      "The temperature: each village has its own weather (the Weather page's rules and settings, its own dice); someone's temperature at a moment is the day's T + (D ÷ 2) × f(their clock hour), as in the Weather page's Through the day, their clock hour being when they woke + the hours since.",
      `The house is warm: meals, the loom and forge, class, poetry, waiting and the night. Out of it (walking, or at the farm, pasture, forest or mine), a person's <b>felt temperature</b> = the hour's + ${n(C.clothStep)} × their 衣's tier + ${n(C.fireStep)} × the tier of the warmest fire burning within ${n(C.fireReach)} tiles (straight-line distance between tiles). Below 0 °C they're in <b>hypothermia</b>.`,
      "Hypothermia lasts from when their felt temperature drops below 0 °C until it's back to 0 °C or more, or they're home. It costs no days of life, but each unit of work out of the house below 0 °C is cut by (felt ÷ 10)², taken as the unit starts (all of it at −10 °C or colder), on top of the rain's cut (the two multiply). Kept in by the cold, they still eat breakfast and lunch as usual.",
      `At work and feeling ${n(C.coldLimit)} °C or colder, they finish the unit in hand, then walk home to warm up, keeping their job. If they arrive at the work site to find it that cold (after lighting any timber they brought), they turn back. Between 0 and ${n(C.coldLimit)} °C they work on, slower.`,
      `Leaving the house for a job out of it: if the hour's temperature, with their 衣 and any fire burning at the place when they'd arrive, is 0 °C or more, they go. If not, they put on the lowest-tier 衣 that's warm enough (the oldest of that tier, taken for the day); with none, the warmest 衣 there is, and, with more than ${n(C.fireEnergy)} Power left and the rain under 10, the lowest-tier timber that makes up the rest (from the full lots in store). Still short: if it would feel ${n(C.coldLimit)} °C or colder, they let the job go and choose again on the hour (or at lunch, or for the night); otherwise they go.`,
      `At the work site they light their timber, unless the rain is at 10 (then it stays unlit and goes back to the store when they're home). Lighting it costs ${n(C.fireEnergy)} Power (or what they have left by then). The fire warms everyone within ${n(C.fireReach)} tiles for ${n(C.fireHours)} h, less in the rain: at rainfall R it burns 1 ÷ (1 − (R ÷ 10)²) times as fast (so it lasts ${n(C.fireHours)} × (1 − (R ÷ 10)²) h in a steady rain), the rain changing as it burns.`,
      "衣 is worn only for warmth: once put on, it's kept for the day and wears by all its wearer's Power; one swapped for a warmer one goes back unworn.",
    ]);
    if (wet) add("The rain", "Clothing", [
      `The rain: the village's rainfall R, 0–10, hour by hour (the Weather page's rain under its clouds; snow counts the same). Out of the house, each person feels <b>max(0, R − ${n(C.hatStep)} × their 笠's tier)</b>.`,
      "Each unit of work out of the house (milking, the fields, shearing, quarrying, woodcutting) does × <b>max(0, 1 − (felt ÷ 10)²)</b>, at the rain as the unit starts. At a job with a limit (a field's daily limit, a sheep's wool) each Power still uses up 1 of it, but brings in less; at the harvest it does less of the work the rice wants. The loom, the forge, class and poetry are indoors.",
      "Nobody goes home or stays in for the rain, however hard: it only cuts the work (to nothing at 10 felt).",
      `Leaving the house for a job out of it with the felt rain at ${n(C.rainLimit)} or more: they put on the lowest-tier 笠 that brings it under ${n(C.rainLimit)} (the oldest of that tier, taken for the day); with none, the best 笠 there is, if it's better than theirs; either way they go. They dress for the rain first, then for the cold.`,
      "With the rain on, a 笠 is worn only against it (not taken every day); once put on, it's kept for the day and wears by all its wearer's Power.",
    ]);

    if (strategy) add("The player", "Strategy", [
      `Each day, before anything else (before the scholars are seen to), the player may: <b>kill</b> anyone (gone at once, counted among the day's deaths; a partner is single again that night); <b>appoint the scholars</b> (grown-ups only, any number, elders too: the day's scholars are then that list, not the village's choice); <b>pour</b> the well full, to ${n(Wa.wellCap)}; and <b>give</b> any number of 刀 叉 衣 笠 of any tier up to SR, in store as if just made.`,
      "On the 1st of each month (days 1, 31, …, 331 of the year) they may give anyone their <b>own order of jobs</b>, which may hold <b>發呆</b> (doing nothing): on reaching it, they stop for the day with their Power left unspent (a child skips class too; a scholar only teaches or writes if it comes before). An order stands until changed; a newborn has none. With an order, the person goes down it instead of the village's: in Micro choosing their next job (a scholar, teaching or poetry); in Macro, see Macro mode.",
      "For each couple they may say whether it may have a child: a couple told no can't conceive (a pregnancy under way goes on) until told yes.",
      "<b>Strategies</b> are players. Every one keeps the well full; gives SR 衣 and 笠 to everyone and SR 刀 and 叉 to every grown-up as they're needed (enough in store for 1.2 each); appoints one scholar once there are 6 adults (none before); and kills nobody. No child's or scholar's order has crafting in it, and the scholar's puts teaching first (class, the fields, milking, collecting, poetry). Where a strategy gives orders that collect both materials, every other person by age has 伐木 before 採石 / 羊毛, the rest the other way round.",
      "A <b>smith</b>, where there is one: once there are 4 adults, the youngest man who isn't a scholar, the forge first every day for the rest of his life (his elder years too; a new one when he dies or is made a scholar). While the forge waits he cuts timber (伐木) first if he has a gatherer, otherwise 伐木 and 採石 first by turns, a month each.",
      "<b>Most people</b> (goal: the most people at once): every couple may have a child while the store holds 30 days' food; a smith; the brightest adult as the scholar; children go to class first while the store holds 90 days' food; everyone else works the food first.",
      "<b>Best all-rounder</b> (goal: the highest Power + Intelligence anyone reaches): the village held under 20 people (children on the way counted); a couple may have a child only while there are fewer than 2 children (those on the way counted); every child goes to class first; the strongest adult is the scholar; everyone else works the food first; and while there's room for a child and 60 days' food in store, the couple who could have one now (both adults, she able to conceive) with the most Power + Intelligence between them gets that month's order 發呆.",
      "<b>A UR craft</b> (goal: a UR craft, or else the most SSR ones): under 20 people and fewer than 2 children, as above; a smith, and his gatherer: once there's a smith, the youngest adult man after him who isn't a scholar, quarrying first every day (採石, 伐木, the fields, milking, teaching, poetry) for the rest of his life; nobody else's order has crafting in it, so only the smith uses the forge and the loom stands idle; the brightest adult as the scholar; children go to class first while the store holds 90 days' food.",
      `<b>Sustainable</b> (goal: the most people on an average day over its years on its own): for its hands-off years (${n(St.handsOff)}) it plays with the brightest grown-up as the scholar, every grown-up on the food first, and children only while the store holds 30 days' food. On its last day it gives enough SR crafts for everyone to the end and lets every couple have children again; from the next day it lets go: the village chooses its own scholars, nothing is poured or given, and the orders it gave stand. The others play all 100 years.`,
    ]);

    if (watering) add("Watering", "Watering", [
      `The well (井) holds at most ${n(Wa.wellCap)} water and starts full. Each day, after the day's work, it refills over the 24 hours: from the ground at W ÷ 2 an hour (W: the land's water level at the day's end, from the Weather page) while it holds under ${n(Math.min(Wa.wellCap, Wa.wellGround))}, and from the rain at its rainfall an hour (snow too), up to ${n(Wa.wellCap)}, worked out between the rain's changes.`,
      `Each of the 4 fields has a water level, 0–10. The fields are numbered in the order they're taken each day (the first farmer's is field 1), and start at the land's level. Tending uses ${n(Wa.waterUse)} level per Power. A farmer who finds their field at level ${n(Wa.waterAt)} or lower (and under 10), on arriving or after each unit, walks for 1 water and brings it back: +1 level (at most 10). They go to the well if it has water and is no further from the field than the river, otherwise to the river, while it runs. The river is dry on a day that starts with the mountain's level at 0 (see the Weather page's Water level), or if the map has none; with the well empty too, there's no water.`,
      `At the day's end, a field nobody tended today takes the land's level. A field tended at least once this year is seeded: until the harvest (days 1–180) it grows rice by itself each day by its level, rounded down: ${Array.from({ length: 11 }, (_, k) => `${k ? "" : "level "}${k}: ${signed(Wa["g" + k])}`).join(", ")}. On day 181 the rice standing is the tending's plus all the water's growth this year, never below 0.`,
    ]);

    if (crafts) add("Crafts", "Craft", [
      `Women weave (紡織) 衣 clothes (${recipe("clothes")}) or 笠 hats (${recipe("hat")}); men forge (鍛造) 刀 blades (${recipe("blade")}) or 叉 hayforks (${recipe("fork")}); ${craftEnergy()} of work at the house.` + " There is one loom and one forge, one crafter at each a day. A craft takes its materials up front and is worked until done, over days if need be, by whoever holds the station. Weaving and forging use a 刀: the crafter's for the day (the one they carry, or else the best left, taken at the station), adding its bonus; with none they craft without, the 刀 counting 0 in the score.",
      `To start with, the store holds ${startKit()} (the Craft page can set any number of R 刀, 叉, 衣 and 笠 to start, each wearing out like a made one).`,
      "A station's next item is its item started fewest times (衣 before 笠, 刀 before 叉 on a tie); it waits until all that item's materials are in store.",
      `In use: each day everyone with Power left (and the scholars), in village order, takes the best 衣 and 笠 left. Trying field work or collecting, someone without the job's tool today first takes the best one left (tending: a 叉; the harvest and collecting: a 刀, the same 刀 all day), putting it back if they don't get the job. Best: the highest tier, the oldest on a tie; each is taken once a day. Wear, by Power spent: 衣 and 笠 with all of their wearer's Power (lasting ${wears("clothes", "hat")}), a 叉 tending and a 刀 at the harvest, collecting and crafting (${wears("fork", "blade")}); worn out,` + " it's gone at the end of the day, before the day's new crafts come in.",
      "A craft takes each material best tier first (closing the lot still filling early if the full ones fall short). Done, its score is the average of three, to the nearest 0.01: its materials' average tier, its crafters' skill tier and their 刀's tier (0 without one), these two averaged by work on it. Its tier = <b>round((score + roll) ÷ 2)</b>, half up, held to 1–5, the roll an even draw of 1.01, 1.02, …, score + 1 (worked in hundredths). So with all three SSR (4.00): SSR 50%, SR 49.75%, UR 1 in 400; below 4.00, never UR.",
    ]);

    if (skills) add("Skills", "Resources", [
      `Nine skills, each with exp and a level (0–4), starting at 0 (the born too): milking, farming (tending and the harvest), woodcutting, weaving, forging, shearing, quarrying, teaching, poetry. Each Power spent on a job is 1 exp in its skill; a child's class earns none. Levels 1 / 2 / 3 / 4 take <b>${[R.exp1, R.exp2, R.exp3, R.exp4].map((v) => n(v)).join(" / ")}</b> more exp each (level 4 at ${n(D.expTotal)}), counted at the end of the day for the next.`,
      `<b>Effectiveness m = 1 + 0 / ${[R.bonus1, R.bonus2, R.bonus3, R.bonus4].map((v) => n(v) + "%").join(" / ")} at skill level 0 / 1 / 2 / 3 / 4` + (crafts ? ` + their tool's bonus (a 叉 tending, a 刀 at the harvest and collecting): ${[Cr.bonus1, Cr.bonus2, Cr.bonus3, Cr.bonus4, Cr.bonus5].map((v) => n(v) + "%").join(" / ")} for N / R / SR / SSR / UR (as made)` : "") + "</b>. At milking, tending and shearing it's a yield: each Power uses up 1 of the job (a field's daily limit, the sheep's wool; a cow has no limit) and brings in m (milk, the field's rice, wool), so their need, done, reserved and open work are in Power. Timber, stone and the knowledge from teaching and poetry: Power spent × m. At the harvest it's speed, as the standing rice is all there is: its need, done, reserved and open are work, Power × m (could still do: the Power × m; a unit: min(10, e, reservation left ÷ m) Power, credited × m)." + (crafts ? " Crafts are speed too, the Power a craft takes being work (a unit: min(10, e, craft left ÷ m) Power, credited × m)." : "") + " The hours a unit takes go by the Power spent.",
    ]);

    if (school) add("Scholar and school", "Education", [
      `Each morning, while there are fewer scholars than both the children who may go to class and the most allowed (${n(Ed.maxScholars)}), the brightest adult who isn't one (first in village order on a tie) is appointed, if the village could spare them all: leaving out the scholars and the children, at least 4 grown-ups who may tend have Power left; and, from a second scholar on, the grown-ups left who may milk, the best one to each adult cow, could milk the whole village's need (each Power × milk effectiveness × their milking effectiveness). Scholars serve until elder age or death, and do no other work.`,
      `Each day the scholars who may teach and put teaching first (Education above Poetry in their order, or they may not write) take the children who may go: the children in a random order (their own dice), the i-th to the (i mod n)-th of the n teachers, in the order appointed. Class is at the house, on for a child while their scholar has Power left and hasn't gone in. A child going to class walks home, sits, and chooses again at ${hrs(M.lunchAfter)} or ${hrs(M.activeHours)} (or when work opens up). A child sitting down calls their scholar at once, if the scholar is waiting or writing (a poem cut short counts the Power spent so far).`,
      `A scholar, choosing: no Power left, they wait (until work opens up). Otherwise a unit of min(10, e) at the house (if it can start, by ${T12}), the first in their order of teaching (if a child of their class is seated with Power left) and poetry (if they may write); neither, they wait.`,
      "At the end of each teaching unit, each child of the class seated (and a child leaving mid-unit) is credited for the time since the latest of: sitting down, the unit's start and their last credit, at most e ÷ r. They spend that time × r and take home " + (Ed.knowPerEnergy !== 1 ? `${n(Ed.knowPerEnergy)} × ` : "") + (skills ? "the scholar's teaching effectiveness × " : "") + "min(that time × the scholar's r, the Power they spent) ÷ the children in the class, in knowledge. Out of Power, a child leaves and chooses again; lunch and the night end class.",
      `A child's knowledge bank plus what they take home buys Intelligence one point at a time, for life, each costing <b>(max(${n(Ed.intelPast)}, I) − ${n(Ed.intelPast)})² + ${n(Ed.knowBase)}</b> at their Intelligence I then. Poetry: ⌊${Ed.knowPerEnergy !== 1 ? n(Ed.knowPerEnergy) + " × " : ""}the day's Power spent on poetry` + (skills ? " × poetry effectiveness" : "") + "⌋ knowledge, kept apart as the scholar's poetry; it doesn't change their Intelligence.",
    ]);

    if (at("food")) add("Whole numbers", "", [
      `Power to spend, food made${at("inheritance") ? " and attributes" : ""} round down; food made from Power spent keeps its fraction in a running total. The day's food eaten rounds to the nearest unit.${school ? " Knowledge keeps its fractions." : ""}`,
    ]);

    if (at("food")) add("One day, in order", "", working ? [
      "Stored food ages, and past its keeping time it spoils." + (school ? " Scholars step down at elder age or death; appointment (see Scholar and school)." : "") + " Day 1 of the year: tending starts again; day 181: the crop is ripe." + (resources ? " The sheep grow wool." : ""),
      "The day, person by person, with yesterday's adult cows" + (resources ? " and sheep" : "") + ". Then " + (skills ? "exp and levels; " : "") + (school ? "knowledge and poetry; " : "") + (resources ? "timber, wool (off the sheep), stone" + (crafts ? " and finished crafts" : "") + " into store; " : "") + "milk and rice into store; on day 270 the fields' rice left is lost.",
      "Everyone eats.",
      "Hunger, ageing and deaths, " + (happiness ? "happiness, couples, " : "") + "births, newcomers" + (at("inheritance") ? "; newborns' attributes, and those coming of age get their bonus" : "") + ".",
    ] : [
      "Stored food ages and spoils; today's milk and rice go into store.",
      "Everyone eats. Hunger, ageing and deaths, births, newcomers.",
    ], { ordered: true });

    if (working) add("Macro mode", "", [
      "Macro mode is a faster approximation of the rules above (Micro mode), and doesn't match them exactly; Micro mode compares the two. Each day the grown-ups, in a new random order, each on their own clock (walking, lunch, carrying, " + T12 + "), spend all their day allows on the jobs in the village's order: milking, one to a cow (milk-only grown-ups first); the 4 fields, one person to each, most Power left first, up to the daily limit while tending and until the rice has its work at harvest" + (crafts ? "; crafts, whoever has no food work first" : "") + (resources ? "; collecting, each in their order as in Micro" : "") + "." + (crafts ? " Tools are taken as in Micro." : "") + " Then the children fill the food work left, most Power left first, and keep the rest for class." + (school ? " Each child is taught for the hours they'd share with their scholar on average over wake-up times (a triangle over ±4 h), ÷ the children in the class." : "") + (skills ? " Work is Power spent × effectiveness, as in Micro." : ""),
      strategy && "Own orders (the player's): the day's jobs go by rank: everyone's first job, then everyone's second, and so on; at each rank the jobs in the village's order, each with those who have it there.",
      cold && "The cold and the rain follow Micro's rules along each person's clock, a unit at a time: everyone wakes at an even spread over the wake-up window, in the order they come to work, and sees the fires lit by those worked out before them; the felt temperature goes in a straight line between the times they look, to find when it crosses 0. Working out what someone could do (" + T12 + ") leaves the weather out.",
    ].filter(Boolean));

    add("Simulation notes", "", [
      is("herd") ? "Runs last 1,000 days by default." : is("humans") ? "Runs last 10,000 days by default." : "Runs last 36,000 days (100 years).",
      (is("herd") ? "The page plays 20 seeded runs (mulberry32) and draws the first; a run survives if anyone is alive at the end." : "The page plays one seeded village (mulberry32), the one drawn; it survives if anyone is alive at the end.") +
        (at("food") ? ` Separate dice for ${["the cows", resources && "the sheep", "the people", at("inheritance") && "the birth draws", working && "the day's waking", school && "the classes", happiness && "the pairing", resources && "the tiers", cold && "the weather"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")}, so each policy faces the same luck. Exact runs also depend on the order the dice are drawn in, which only the code sets; a rebuild following these rules matches them in distribution, not draw for draw. Comparisons allow a billionth for rounding.` : ""),
      at("humans") && "A run stops past 2,000 people (counted as surviving). A death is hunger's if hunger took at least a day off that life.",
      working && "Micro mode (the switch at the top) is the game's rules; Macro mode is the quick approximation and runs by default.",
      "Lifespans are at least 1 day." + (at("food") ? " The cows carry on after the people are gone." : ""),
    ], { note: true });

    return out;
  }

  // The Crafts group's figures: an item's materials, the crafts' energy, the starting kit, the wear
  function craftFigures(Cr) {
    const items = (window.VillagePage && VillagePage.CRAFTS) || [];
    const recipe = (id) => { const it = items.find((x) => x.id === id); return it ? Object.keys(it.needs).map((m) => `${n(Cr[VillagePage.needKey(it, m)])} ${m === "wood" ? "timber" : m}`).join(" + ") : ""; };
    const energies = ["clothes", "hat", "blade", "fork"].map((id) => Cr[id + "Energy"]);
    const craftEnergy = () => (energies.every((e) => e === energies[0]) ? `each takes ${n(energies[0])} Power` : `they take ${energies.map((e) => n(e)).join(" / ")} Power`);
    const kit = [["startBlades", "刀"], ["startForks", "叉"], ["startClothes", "衣"], ["startHats", "笠"]].filter(([k]) => Cr[k] > 0);
    const startKit = () => (kit.length ? kit.map(([k, z]) => `${n(Cr[k])} R ${z}`).join(", ") : "no crafts");
    const wears = (a, b) => (Cr[a + "Wear"] === Cr[b + "Wear"] ? n(Cr[a + "Wear"]) : `${n(Cr[a + "Wear"])} / ${n(Cr[b + "Wear"])}`);
    return { recipe, craftEnergy, startKit, wears };
  }

  // Static text elsewhere (the Rulebook, the pages' introductions): <span data-n="human.L">3,600</span> shows
  // that setting as it is now (a path into settings()); data-f its form: "half" (hours, ½), "signed" (+25),
  // "tier" (N–UR), "pct" (a share as a percent); a phrase (settings().d's …Text) is put in as it is; the
  // default written inside shows until this runs, and stays where the page doesn't load the setting's model
  function fill() {
    const N = settings();
    for (const el of document.querySelectorAll("[data-n]")) {
      const v = el.dataset.n.split(".").reduce((o, k) => (o == null ? undefined : o[k]), N), f = el.dataset.f;
      if (typeof v === "string") { el.textContent = v; continue; }
      if (typeof v !== "number" || !isFinite(v)) continue;
      el.textContent = f === "half" ? hrs(v) : f === "signed" ? signed(v) : f === "tier" ? tierName(v) : f === "pct" ? n(v * 100) : n(v);
    }
  }

  function render(section) {
    const body = section.querySelector(".rules-body");
    if (!body) return;
    body.innerHTML = groups(section.dataset.page).map((g) => {
      const items = g.items.filter(Boolean);
      if (g.note) return `<div class="rule-notes"><h3>${g.title}</h3><p>${items.join(" ")}</p></div>`;
      const li = items.map((t) => `<li>${t}</li>`).join("");
      const where = g.where ? `<span class="rule-where">set on ${g.where}</span>` : "";
      return `<div class="rule-group"><h3>${g.title}${where}</h3>${g.ordered ? `<ol>${li}</ol>` : `<ul>${li}</ul>`}</div>`;
    }).join("");
  }

  const renderAll = () => { document.querySelectorAll("section.impl[data-page]").forEach(render); fill(); };
  renderAll();
  // Again whenever a setting may have changed: the page's own controls (each saves as it changes, before
  // this hears of it), another tab, or the Jobs table
  let soon = 0;
  const later = () => { clearTimeout(soon); soon = setTimeout(renderAll, 250); };
  for (const type of ["input", "change", "click"]) document.addEventListener(type, later);
  window.addEventListener("storage", later);
  window.addEventListener("roles-change", later);
  window.MagicRules = { groups, render, settings, fill };
})();
