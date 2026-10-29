// Implementation details: every rule a page runs, tersely, for building the simulation into the game.
// Each page has <section class="card impl" data-page="..."> with a .rules-body inside; this fills it
// with the groups that page uses, then a footer of simulation notes (how the page runs, not game rules).
// Numbers that are settings come from settings(): each page's as it is now (saved, else the default), so
// the text follows the sliders; numbers written in are fixed rules. Keep this in step with the models: from the Attribute page on, these are
// Micro mode's rules (micro-model.js), complete enough to rebuild it and as short as that allows; worked
// examples belong in page hints. The Rulebook page (rulebook.html) says the same in plain words, sorted
// into the game's rules and the simulation's; a change here may need it there too.
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
    const walking = () => {
      add("Map and walking", "Map", [
        `A 16 × 16 grid of house, farm, pasture, forest and mine tiles (the well and the river are where farmers fetch water, from the Watering page on). Each kind of place is worked at its tile with the fewest steps (no diagonals) to any house (tie: first scanning rows top to bottom, left to right). Walking is ${n(M.minPerTile)} minute${M.minPerTile === 1 ? "" : "s"} a tile: house ↔ place, that place's steps; place ↔ place, the steps between their two tiles.`,
        `Waking: N people, N + 1 exponential gaps g₀ … g<sub>N</sub>, the people in a random order; the k-th (from 0) wakes at ${n(M.wakeFrom)} + ${n(M.wakeTo - M.wakeFrom)} × (g₀ + … + g<sub>k</sub>) ÷ (g₀ + … + g<sub>N</sub>) o'clock. All times below are hours since that person woke.`,
        `Out of the house for ${hrs(M.activeHours)} h. Breakfast by the house (${n(M.mealMin)} min). From ${hrs(M.lunchAfter)} h: home for lunch (idle: at once; working: once the unit under way is done and carried home), eaten by the house (${n(M.mealMin)} min), then back out. From ${hrs(M.activeHours)} h: the same, home for the night; they go in on reaching the house.`,
        `Work goes a unit at a time: 10 Power, or less if the person or job has less left, taking unit ÷ r hours (r: see Power and Intelligence). <b>A unit starts only if they'd finish it and be home by ${hrs(M.activeHours)}</b>; once started it's finished. Collecting (milking, harvest${resources ? ", timber, wool, stone" : ""}) is carried home after every ${n(M.load)} Power and at the end of the job: a walk home and back each time. Anyone with nothing to do waits by the house.`,
      ]);
      add("Meals and hunger", "Map", [
        "Share g = the food eaten ÷ need, at most 1 (the children's, or the grown-ups', see Eating). Breakfast and lunch are each half of it and each keeps them full for <b>f = 6g</b> hours: breakfast until f; lunch, from Lh (when they got home for it), until max(f, Lh) + f.",
        "How hungry they get through the day is only shown (Micro mode): it costs no days of life. Hunger's toll goes by the food they went without (see Humans).",
        `Going in early (it changes nobody's work): let o be when they were first back at the house with no Power left. If o < Lh and max(o, f − 2.4) < Lh, they go in then and skip lunch. Otherwise, if max(o, Lh + ${n(M.mealMin)} min, max(f, Lh) + f − 2.4) is before E, that's their E. Never home for lunch: Lh = ${hrs(M.lunchAfter)}; never went in: E = ${hrs(M.activeHours)}. Shown as hungry at 2.4 h of food left or less.`,
      ]);
    };
    if (is("map")) { walking(); return out; }
    if (is("weather")) {
      add("Seasons", "Weather", [
        "Days 1–90 of each 360 are spring, 91–180 summer, 181–270 autumn, 271–360 winter. Each season has its own settings: spawn rate λ, average wind w̄, wind volatility σ, cloudiness q, rain changeability ρ, and for temperature μ, s, c, k.",
        `<b>Settings</b> (spring / summer / autumn / winter): λ ${perSeason(Wx, "spawnRate")} an hour; w̄ ${perSeason(Wx, "wind")} tiles an hour (so the spells last L = ${SEASON_IDS.map((s) => (Wx[s].wind > 0 ? n(WeatherModel.spellOf(Wx[s]), 0) : "∞")).join(" / ")} h); σ ${perSeason(Wx, "windVol")}; q ${perSeason(Wx, "cloudiness")}%; ρ ${perSeason(Wx, "rainChange")} an hour; average temperature μ ${perSeason(Wx, "temp")} °C; ${["tempSd", "cloudCool", "rainCool"].every((k) => SEASON_IDS.every((x) => Wx[x][k] === Wx.spring[k])) ? `and in every season spread s ${n(Wx.spring.tempSd)} °C, cloud cooling c ${n(Wx.spring.cloudCool)} °C, rain cooling k ${n(Wx.spring.rainCool)} °C` : `spread s ${perSeason(Wx, "tempSd")} °C, cloud cooling c ${perSeason(Wx, "cloudCool")} °C, rain cooling k ${perSeason(Wx, "rainCool")} °C`}.`,
        `<b>Season ramp</b> h = ${n(Wx.rampDays)} days: the base temperature b(d) on day d is its season's μ, except within h days of a season's start: there, with p the days from the boundary (half-days counted: the first day of a season is p = 0.5, the last of the one before p = −0.5), b = μ_before + (μ_after − μ_before) × (p + h) ÷ 2h. h = 0: no ramp.`,
        "On a season's first day its settings take over at once: a new wind is drawn, and the times to the next cloud, the spell's end, the wind's change and the re-roll are drawn afresh, as below. The clouds, the spell and the rain die carry on.",
      ]);
      add("Clouds and rain", "Weather", [
        "Spells: clear (no clouds come) and cloudy, taking turns. Each cloudy spell lasts an exponential time with mean Lq h, each clear one mean L(1 − q) h, L = 16 × 16 ÷ w̄: a clear and a cloudy spell together last 16 crossings of the 16-tile sky at the average wind (no wind: the spell never changes). q = 0: always clear; q = 100%: always cloudy.",
        "The sky is over the 16 × 16 map and holds at most 10 clouds. In a cloudy spell clouds are due at the west edge at random: the gaps between them are exponential, mean 1 ÷ λ (a new gap is drawn when a cloudy spell starts). A cloud due while 10 are in the sky doesn't come.",
        "Wind v, the same for every cloud: it holds for an exponential time, mean 3 h, then a new v is drawn from a gamma distribution with mean w̄ and standard deviation σ: shape (w̄ ÷ σ)², scale σ² ÷ w̄. σ = 0: always w̄; w̄ = 0: no wind.",
        "Each cloud comes in at x = 0 on a row drawn evenly over the map's height, blows east at the wind and leaves at x = 16 (16 ÷ w̄ h at the average wind; with no wind, never). All clouds move together, so they leave in the order they came.",
        "Start (day 1, spring): the spell is cloudy with chance q, its length drawn as above; the wind a draw as above. With q = 100% and σ = 0 (or no wind), n clouds, n drawn from the distribution below, each at an even draw across the width; otherwise from an empty sky, run on for 5 × (16 ÷ w̄ + L + 3) h first.",
        "<b>Rain</b>: with n clouds in the sky it rains with chance <b>log₁₀(n)</b> (0 for n ≤ 1), and rainfall = n while it rains. The sky keeps a rain die d, an even draw in [0, 1) on its own dice, re-rolled after exponential gaps, mean 1 ÷ ρ; it's raining whenever d < log₁₀(n), checked after every cloud coming or leaving and every re-roll. Start: d drawn evenly.",
        "With q = 100% and σ = 0, <b>the share of time with n clouds</b>, with a = λ × 16 ÷ w̄: <b>aⁿ ÷ n! over Σ aᵏ ÷ k!</b>, k = 0 … 10, and the share of clouds turned away is the n = 10 share. No wind: always 10 once any cloud has come. Otherwise the counts are clumpier than this (more 0s and more 10s); the page simulates them.",
      ]);
      add("Temperature", "Weather", [
        "One temperature a day (midnight to midnight). The day's weather part <b>x = −(c × its average clouds ÷ 10 + k × its hours raining ÷ 24)</b>.",
        "<b>T = b(d) + x − x̄ + e × u</b>, where x̄ is the average of x over the season's long run (so T averages the season's average b), e = √(max(0, s² − the variance of x over it)) (so T's standard deviation is s), and u carries over: u ← 0.6u + 0.8z each day (z a standard normal draw, on the temperature's own dice; start u = z).",
        "Precipitation on a day below 0 °C is snow (snowfall = clouds, as rainfall).",
        `<b>Through the day</b> (nothing above depends on it): at clock hour t the temperature is <b>T + (D ÷ 2) × f(t)</b>, f = −cos(π (t − 6) ÷ 9) from 06:00 to 15:00 and cos(π ((t − 15) mod 24) ÷ 15) otherwise: lowest T − D ÷ 2 at 06:00, highest T + D ÷ 2 at 15:00, averaging T over the day. D = the season's daily swing × (1 − 0.6 × its average clouds ÷ 10); daily swing ${seasonal(Wx, "swing", " °C")}.`,
        "A day's type, by what most of its hours were: sunny (no clouds), cloudy (clouds, no rain) or rainy / snowy (raining); a tie goes to the wetter. Sunny days average warmest and rainy ones coolest; one day's random part can still turn that round.",
      ]);
      add("Water level", "Weather", [
        "One water level W for the whole year, held to 0–10; it starts at 5. At W = 0 it's a <b>drought</b>, at W = 10 a <b>flood</b>.",
        `Raining (or snowing) at rainfall n: W rises n ÷ ${n(Wx.water.perLevel)} an hour (rain per water level). Dry: W falls d × (1 + ${n(Wx.water.slope)} (W − 5) ÷ 5) an hour (drain slope ${n(Wx.water.slope)}), d = ${n(Wx.water.sunnyDrain)} with no clouds (sunny drain), ${n(Wx.water.cloudyDrain)} with clouds (cloudy drain): a + bW with a = ${n(1 - Wx.water.slope)}d, b = ${n(Wx.water.slope / 5)}d.`,
        `The sky only changes at its events (a cloud coming or leaving, a spell or the wind changing, a re-roll), so between two of them W follows a set curve: rising, W + nt ÷ ${n(Wx.water.perLevel)}; falling, <b>W(t) = (W₀ + a/b) e^(−bt) − a/b</b>, reaching 0 after ln((W₀ + a/b) ÷ (a/b)) ÷ b hours (b = 0: W₀ − at). Work it out event by event, stopping at 0 or 10 at the exact moment it gets there and counting the rest of the time there as drought or flood. The game can show it as often as it likes; the answer doesn't depend on how the time is split.`,
        "The mountain above the river (川) keeps a second level M the same way (it starts at 5, takes the same rain, drains by the same formula), except that it doesn't drain in the hours whose temperature is below −5 °C (the hour's temperature through the day; the river is frozen). While M > 0 the river runs; M = 0 and it's dry. M is never below W, so the river only runs dry in a drought (by default in about 5% of years, about one drought in three; droughts come in about 15% of years).",
      ]);
      return out;
    }

    if (!is("humans")) add("Cows", "Herd", [
      `Lifespan ${n(Hd.L)} × (1 ± up to ${n(Hd.S)}%) days, drawn evenly. Start: ${n(Hd.N0)} cows, each aged ⌊an even draw below its lifespan⌋.` + (at("food") ? ` Calves (under ${n(Hd.M)} days) give no milk.` : ` Under ${n(Hd.M)} days, a calf.`),
      `Each day: ageing, deaths at lifespan; then with N cows the herd changes by <b>r·N·(N/A − 1)·(1 − N/K)</b> (r ${n(Hd.r)}, A ${n(Hd.A)}, K ${n(Hd.K)}). The fraction is a chance (2.3: 2, plus 1 at 30%). Positive: that many calves, never past 10 × K cows; negative: that many deaths, each the cow at ⌊u × N⌋ in herd order, the last cow taking its place (u: a die roll in [0, 1)).`,
      at("food") && "Each day the village has the adult cows of the day before.",
      "Tiers: 1 N, 2 R, 3 SR, 4 SSR" + (crafts ? ", and for crafts only 5 UR" : "") + `. <b>draw(x)</b> = x + (⌊u × 100⌋ − 49) ÷ 100, rounded half up, held to 1–4; cows and sheep at most 3. Start: all ${tierName(Hd.cowTier)}${resources && Hd.sheepTier !== Hd.cowTier ? ` (the sheep ${tierName(Hd.sheepTier)})` : ""}.` + " A calf (on the day's births, in turn): draw(the average of two different adults: the ⌊u × n⌋-th of the n adults in herd order, then the ⌊u × (n − 1)⌋-th of the rest; one adult: it twice; none: from everyone).",
    ]);

    if (at("humans")) add("People", "Humans", [
      `Lifespan ${n(H.L)} × (1 ± up to ${n(H.S)}%) days, drawn evenly. Child under ${n(H.M)} days, adult to ${n(H.E)}, then elder; adults and elders are grown-ups. Start: ${n(H.men)} men, ${n(H.women)} women, each aged min(lifespan − 1, ${n(H.M)} + ⌊an even draw below (lifespan − ${n(H.M)})⌋).`,
      happiness
        ? `Couples last for life. Each night after the deaths, a couple with a dead partner ends; then single adult men and women, each shuffled, pair up in order (the shorter list's length). First, mothers who conceived G = ${n(H.G)} days ago give birth (in village order); a mother who died first loses the child, but a father who died still counts as its father. Then only couples of two adults whose woman can conceive (not expecting, and her age + G under elder age) may conceive, each at its own chance (see Happiness), taken in the order they paired. A newborn is a boy with chance (W + X) ÷ (M + W + 2X), M and W the living males and females under elder age (newborns of the same night included), X the birth balance (${n(H.X)}, 0–1; nobody to count: even).`
        : `Couples = min(adult men, adult women). First, mothers who conceived G = ${n(H.G)} days ago give birth (in village order); a mother who died first loses the child. Then the first adult women in village order, as many as there are couples, each conceives at ${n(H.p)} a day if she can (not expecting, and her age + G under elder age). A child is born a boy with chance (W + X) ÷ (M + W + 2X) (M, W: living males and females under elder age, the night's newborns included; X the birth balance, ${n(H.X)}).`,
      (working ? `Need: each person's <b>Power</b> in food a day, children too; an elder's the Power they work with, ⌊Power × ${n(D.elderShare)}⌋ (the elder penalty).` : `Need: ${n(H.c)} food a day per adult, ${n(H.c * 0.7)} per child, ${n(H.c * 0.8)} per elder.`) + " Missing = (1 − share) × their need (share = food eaten ÷ need, " + (at("food") ? "the children's or the grown-ups', see Eating)." : "the same for everyone).") + ` <b>Hunger's toll: ⌊${H.k === 1 ? "" : n(H.k) + " × "}S⌋</b> days of life (k = ${n(H.k)}: ${H.k === 1 ? "a day" : n(H.k) + " days"} a food missed), S = all the food they've missed in their life: each short day adds its missing food to S and takes off their lifespan what that adds to the toll (fractions of a day carry over). So three days with nothing, at a need of 100, cost ${n(100 * H.k)} days each (${n(300 * H.k)} in all). They die when their age reaches their lifespan.`,
      "Newcomers: after the births, a village of fewer than 10 people draws one outsider with chance 1 ÷ (n + 1)² ÷ 10 (n: the people tonight, newborns included): aged 360 + ⌊an even draw below 1,081⌋ days (a grown-up), a man or woman by the births' rule, last in village order" + (working ? ", with Power and Intelligence each 80 + ⌊an even draw below 21⌋ (the attribute dice)" : "") + ". An empty village is rescued the same way, at 1 in 10 a day: it's \"died out\" only while nobody is there.",
      is("humans") && `Each day: hunger, ageing and deaths, births, newcomers. Food: a fixed ${n(H.F)} a day, never stored.`,
    ]);

    if (at("food")) add("Food", "Food", [
      `Milk and rice meet need one for one. Made on day d, they keep until day d + keep (milk ${n(F.milkKeep)}, rice ${n(F.riceKeep)}). Start: ${n(F.foodStart)} food in store that never spoils.`,
      `A standard day is 100 Power. 1 Power collects ${n(F.milkPerEnergy)} milk (one milker to an adult cow a day, with no limit on a cow, whatever its tier) or grows ${n(F.ricePerEnergy)} rice tending (at most ${n(F.fieldCap)} per field a year, 4 fields).`,
      !working && `Nobody works: each adult cow gives a standard day's milk (${n(D.cowMilk)}); while any adult lives, the year's ${n(D.riceYear)} rice comes in evenly over days 181–210.`,
    ]);

    if (at("food")) add("Eating", "Food", [
      "The children eat first: their full need while there's food in store (milk, rice and the starting food), out of the milk first (the oldest first), then whatever spoils soonest. Short of even that, each child gets the same share of their need, all there is.",
      "Then the grown-ups (elders too) eat out of what's left, whatever spoils soonest (milk on a tie), the starting food last: their need, or short of it, each the same share of their need, s = the food left ÷ the grown-ups' need: all there is (in whole food). Nobody rations." + (at("inheritance") ? " With the grown-ups' need met too, the children then drink all the milk left in store: <b>extra milk</b>, split evenly." : ""),
    ]);

    if (working) add("Jobs", "Jobs", [
      "The Jobs table: children milk" + (school ? " and go to class" : "") + "; men milk, tend, harvest" + (resources ? ", cut wood, quarry" : "") + (crafts ? ", forge" : "") + "; women the same but " + (resources ? "shear instead of quarry" : "likewise") + (crafts ? " and weave instead of forge" : "") + "; old men and women as men and women" + (school ? "; scholars (row by sex) write poetry and teach" : "") + ". Field work is tending on days 1–180, harvest after. Milk-only: a grown-up who may milk but not do today's field work.",
      "Priority (the order of the day's jobs): fields, milking, crafts (loom, then forge), 採石 / 羊毛 (quarrying for men, shearing for women), 伐木 (woodcutting), Education (class and teaching), Poetry. Jobs a page doesn't have are skipped.",
      `Milking: one milker to each adult cow for the day, who may spend as much as they like on it. Fields: one person to each of the 4 fields for the day. Milk made = whole milk from all the Power spent milking so far, less earlier days' (fractions carry over). Tending: ${n(D.fieldRice)} ÷ 180 Power a day each field (so at most that each person); on day 181 the field holds ⌊the year's tending work⌋ rice.` + " Harvest: ⌈min(400, rice in the field ÷ 25)⌉ Power, each bringing in 25 rice; whatever's left after day 270 is lost.",
    ]);

    if (working) walking();

    if (working) add("The day, person by person", "", [
      "Everyone (grown-ups, children" + (school ? ", the scholars" : "") + ") has today's Power e and rate r, in village order (starting men, starting women, then the born by birth), starting at the house. Events run on one clock in time order, ties in the order given; each person has at most one event pending, and a new one replaces it.",
      `Waking: breakfast, then <b>choose</b>. Choosing at hour t: t ≥ ${hrs(M.activeHours)}: let go of any job` + (school ? " and class" : "") + ` and head home for the night; before lunch and t ≥ ${hrs(M.lunchAfter)}: head home for lunch` + ", keeping the job" + (school ? " (leaving class)" : "") + "." + (school ? " The scholar: see School." : "") + " Otherwise, with Power left, up to 4 tries: drop a job with nothing left for them or no unit that could start there; " + (school ? "children without a food job choose food work or class" : "children without a job choose food work") + ", grown-ups without a job take one from the board; then go to it. Nothing found: <b>wait</b>.",
      `Waiting: let go of the job, walk home if out (no choosing on the way). At the house, the first time with no Power left marks o. Choose again at ${hrs(M.lunchAfter)}, after lunch at ${hrs(M.activeHours)}, or when work opens up.`,
      `Going to a job: walk straight there, choose again on arrival. There, unit = min(10, e, what the job lets them do), 0 if it can't start (the ${hrs(M.activeHours)} h rule); 0: let it go and try again; otherwise work it, then it's credited and taken off e. Then choose again where they are, except collecting away from the house: add it to the load, and with ${n(M.load)} carried, no Power left, or nothing more for them there, walk home first (setting off home empties the load).`,
      `Home for lunch: Lh = then; eat (${n(M.mealMin)} min), choose. Home for the night: E = then; done.`,
      `<b>Could still do</b> at a place: the most Power (whole, ≤ ⌊e⌋) they'd spend going there now and doing only that job all day, in whole units, under these rules: from where they are (walking: where they set out from), with their load, from now or the end of their meal; units start only before ${hrs(M.lunchAfter)} unlunched (else home, lunch, back first), and by the ${hrs(M.activeHours)} h rule.`,
    ], { ordered: true });

    if (working) add("The job board", "", [
      "<b>Shared</b>: milking (no end), fields" + (resources ? `, shearing (needs ⌈wool on the sheep this morning ÷ ${n(R.woolPerEnergy)}⌉), quarrying and woodcutting (no end)` : "") + ". Each has places, one person to each for the day, theirs once they take the job: a cow each, the 4 fields" + (resources ? `, a sheep each with wool (the fullest first), ${n(R.mineCrew)} place${R.mineCrew === 1 ? "" : "s"} at the mine and ${n(R.forestCrew)} in the forest (their crews)` : "") + "; a field takes at most its daily limit from its person" + (resources ? ", a sheep its wool" : "") + " (any cap, below). Open = need − done − reserved. Taking one reserves min(open, could still do there, any cap); the job lets them do their reservation left; grown-ups who run out reserve again the same way (children don't), and there's nothing left for them at 0. Letting go returns the unused.",
      crafts && "<b>One a day</b>: loom and forge, the first to take each keeping it for the day, while a craft is under way or all its next item's materials are in store (min(10, e, what's left of the craft); with none under way, the unit starts one). Taken if nobody else has had it today, nobody holds it, it has work and they could still do ≥ 1 there.",

      "Grown-ups take the first job in priority order that they may do and can get. Milking: one milker to an adult cow for the day; the cow is theirs once they take milking, even between spells of it. Anyone else who may do today's field work takes a cow only if one is left over for each milk-only grown-up without a job or a cow (awake or not) who could still milk." + (resources ? " Collecting (see Sheep and resources): at 採石 / 羊毛 their own (men stone, women wool), at 伐木 timber; going by the village's order, at the first of the two they come to, whichever of their two fewer people are collecting so far today first, then the other." : ""),
      "Children go down the same list: milking only if a cow is left over for each grown-up without a job (awake or not) who may milk and could; fields only if a field is left over for each grown-up without a job or a field (awake or not) who may farm and could, and only for the gap the grown-ups without a job who may do it couldn't cover (open − the sum of what they could still do there), at most that" + (school ? "; Education if class is on. A child in class keeps the seat unless food work above Education needs them" : "") + ".",
      "<b>Work opens up</b> when someone lets go of a shared job with reserved Power unused while some is open" + (crafts ? ", or of a one-at-a-time job with work left" : "") + (school ? ", or a scholar runs out of Power or goes in" : "") + ": everyone at the house with Power left who is waiting" + (school ? " or in class" : "") + " chooses again at once, in village order.",
    ].filter(Boolean));

    if (working) add("Power and Intelligence", "Attribute", [
      "In short: a person's <b>Power</b> is both what they can spend in a day and what they eat. Each morning they have ⌊Power⌋ to spend (their Power left, e, back in full every day) and need Power in food; short of food, they still have their full Power the next day, but lose " + (H.k === 1 ? "a day" : n(H.k) + " days") + " of life for each food missed" + (happiness ? "; the Power they leave unspent becomes happiness" : "") + ". Power left at the start of a day: e = <b>⌊Power⌋</b>; rate r = <b>Intelligence ÷ 10</b> Power an hour. " + (is("attribute") ? `Everyone has ${n(A.power)} / ${n(A.intel)}.` : `Starting grown-ups have ${n(A.power)} / ${n(A.intel)}.`) + ` Elders: both × ${n(D.elderShare)} (the elder penalty), and they eat that Power. Power and Intelligence never go below <b>70</b>` + (at("inheritance") ? `, a child's below 70 less the coming-of-age bonus (${n(I.grow)}): ${n(D.kidFloor)}, at birth or from hunger` : "") + "." + (school ? ` Scholars: Power × ${n(D.scholarPower)}, Intelligence × ${n(D.scholarIntel)} (the scholar adjustment).` : ""),
    ]);

    if (at("inheritance")) add("Inheritance", "Inheritance", [
      `Newborn: Power and Intelligence each = <b>max(${n(D.kidFloor)}, ⌊${n(I.share)} × the average of ` + (happiness ? "their parents'" : "a random adult man's and woman's") + ` × (1 ± up to ${n(I.variation)}%)⌋)</b>, ` + (happiness ? "the parents being the mother and her partner when she conceived (alive or not by the birth)" : "the pair drawn") + `, then the variation evenly for Power and for Intelligence (${n(D.kidFloor)}: 70 less the coming-of-age bonus, so a child at it comes of age at 70). No adult man or woman: the starting Power and Intelligence, ${A.power === A.intel ? `${n(A.power)} each` : `${n(A.power)} and ${n(A.intel)}`}.`,
      "<b>Extra milk</b> (see Eating): with everyone's need met, children's and grown-ups', all the milk left in store, shared evenly among the children (fractions kept). Rice and the starting food build no Power.",
      `Each day after eating, a child's milk bank + their extra milk buys points one at a time, each costing <b>(max(x, P) − x)² + ${n(I.powerBase)}</b> (x = ${n(I.dearerPast)}, Power points dearer past; ${n(I.powerBase)}: the base cost) at their Power P then, kept for good. Their hunger bank + the food they went without (their need × (1 − the share)) takes <b>1 Power for every ${n(I.hungerFood)}</b> (hunger per −1 Power), down to ${n(D.kidFloor)} (below born Power if need be). At ${n(H.M)} days they come of age: ${signed(I.grow)} Power and ${signed(I.grow)} Intelligence (the coming-of-age bonus); both banks are emptied.`,
    ]);

    if (happiness) add("Happiness", "Happiness", [
      `Happiness = min(100, <b>max(0, ${n(Hp.happyBase)} − ⌊Intelligence ÷ ${n(Hp.iqStep)}⌋) + ⌊Power left at the end of their last day ÷ ${n(Hp.joyStep)}⌋</b>), set each night` + " (in time for that night's births) and kept through the next day. Power left: after all jobs" + (school ? " and a child's class; a scholar who writes poetry has none" : "") + ". Day 1 and the born: none yet.",
      `Each person's chance of conceiving: <b>${n(H.p)} × happiness ÷ 50</b>; a couple's` + " is the average of the two (the child is born G days later; see Humans).",
    ]);

    if (resources) add("Sheep and resources", "Resources", [
      `Sheep: the cows' herd model (same settings, own dice); the village has the adult sheep of the day before. Each carries 0–${n(R.fleece)} wool. Each morning all grow ${n(R.regrow)} back (to ${n(R.fleece)}); new adults arrive with ${n(R.fleece)}; when` + " there are fewer, sheep are removed one at a time from the wool level most sheep have (the lower on a tie). All of this per tier.",
      `1 Power = ${n(R.woodPerEnergy)} timber (forest), ${n(R.woolPerEnergy)} wool (pasture) or ${n(R.stonePerEnergy)} stone (mine); forest and mine never run out. One person to a place a day: a shearer to each sheep with wool (the fullest first, at most its wool), and at most ${n(R.mineCrew)} quarrier${R.mineCrew === 1 ? "" : "s"} and ${n(R.forestCrew)} woodcutter${R.forestCrew === 1 ? "" : "s"} a day` + " (the mine's and the forest's crews), each keeping their place for the day. Two jobs: 採石 / 羊毛 (a man quarries, a woman shears) and 伐木 (woodcutting). Going by the village's order, a grown-up at the first of them they come to takes whichever of their two fewer people are collecting so far today (on a tie, the one there was less of in store this morning; on a tie, their own), then the other; with an order of their own (the player's), each job is that one alone. Each tries each once a day. Each day's take is whole (fractions carry over) and kept forever. Shorn wool comes off the fullest sheep first (the higher tier first), one sheep at a time. Children don't collect" + (crafts ? " or craft" : "") + ".",
      `Tiers: a skill's is its level (0 counts as N); ${R.forestTier === R.mineTier ? `forest and mine are ${tierName(R.forestTier)}` : `the forest is ${tierName(R.forestTier)}, the mine ${tierName(R.mineTier)}`}. The day's take` + " of each has one average: wool (skill, sheep" + (crafts ? ", 刀" : "") + "), timber (skill, forest" + (crafts ? ", 刀" : "") + "), stone (skill, mine" + (crafts ? ", 刀" : "") + "), skill" + (crafts ? " and the collector's 刀 tier (no 刀: N)" : "") + " weighted by work, sheep by the wool shorn off each. It fills lots of 100 in turn; a full lot's tier is draw(the average over its units).",
    ]);

    if (cold) add("The cold", "Clothing", [
      "The temperature: each village has its own weather (the Weather page's settings, on its own dice), and each hour its temperature (the Weather page's Through the day): the day's T + (D ÷ 2) × f(the hour).",
      `The house is warm (meals, the loom and forge, class, poetry, waiting, the night). Out of it (walking, or at the farm, pasture, forest or mine), each person's <b>felt temperature</b> = the hour's + ${n(C.clothStep)} × their 衣's tier + ${n(C.fireStep)} × the tier of the warmest fire burning within ${n(C.fireReach)} tiles (straight-line distance between tiles); below 0 °C they're in <b>hypothermia</b>.`,
      "Hypothermia, from when they go below 0 °C (felt) to when they warm up (to 0 °C or warmer, or home), costs no days of life: each unit of work out of the house below 0 °C is cut by (felt ÷ 10)² as it starts (all of it at −10 °C or colder), on top of the rain's cut (the two multiply). Indoors from the cold (staying in, or home to warm up) they eat breakfast and lunch as ever.",
      `Out at work feeling ${n(C.coldLimit)} °C or colder, they finish the unit in hand, then walk home to warm up, keeping their job. Arriving at the work site to find it so (after lighting any timber they bring), they turn back. Between 0 and ${n(C.coldLimit)} °C they work on, slower.`,
      `Leaving the house for a job out of it: if the hour's temperature, with their 衣 and any fire burning at the place when they'd arrive, is 0 °C or more, they go. Otherwise they put on the 衣 of the lowest tier that is warm enough (the oldest of that tier, taken for the day); with none, the warmest 衣 there is, and, with more than ${n(C.fireEnergy)} Power and the rain under 10, a timber of the lowest tier that makes up the rest (from the closed lots in store; lighting it costs the fire's Power, or what they have left by then); short of that, if it would still feel ${n(C.coldLimit)} °C or colder they let go of the job and choose again on the hour (or at lunch, or for the night), and otherwise they go.`,
      `At the work site with a timber, they light it, unless the rain is at 10 (then it stays unlit, and goes back to the store when they're home): ${n(C.fireEnergy)} Power, and it warms everyone within ${n(C.fireReach)} tiles for ${n(C.fireHours)} h, less in the rain: at rain level R it burns × 1 ÷ (1 − (R ÷ 10)²) as fast (${n(C.fireHours)} × (1 − (R ÷ 10)²) h in a steady rain, the work's cut), the rain changing as it burns.` + " 衣 is worn only for warmth; a 衣 put on is kept for the day and worn by all its wearer's Power, and one swapped for a warmer goes back unworn.",
    ]);
    if (wet) add("The rain", "Clothing", [
      `The rain: the village's rainfall R, 0–10, hour by hour (the Weather page's rain under its clouds; snow counts the same). Out of the house, each person feels <b>max(0, R − ${n(C.hatStep)} × their 笠's tier)</b>.`,
      "Each unit of work out of the house (milking, the fields, shearing, quarrying, woodcutting) does × <b>max(0, 1 − (felt ÷ 10)²)</b>, at the rain as the unit starts: of a yield job's limit (a field's, a sheep's wool) it still uses up 1 of it for each Power spent, bringing in less; at the harvest it does less of the work the rice wants. The loom, the forge, class and poetry are in the house.",
      "Nobody goes home or stays in for the rain, whatever its level: it only cuts the work (at 10 felt, to nothing).",
      `Leaving the house for a job out of it with R felt at ${n(C.rainLimit)} or more (heavy rain): they put on the 笠 of the lowest tier that brings it under ${n(C.rainLimit)} (the oldest` + " of that tier, taken for the day); with none, the best 笠 there is, if it's better than theirs; and they go either way. The rain goes before the cold: only then do they dress for the cold.",
      "With the rain, 笠 is worn only against it (no longer taken every day); a 笠 put on is kept for the day and worn by all its wearer's Power.",
      "In Macro mode the same rules run along each person's clock, a unit at a time (as their work does): everyone wakes at an even spread over the wake-up window, in the order they come to work, and sees the fires lit by those worked out before them; the felt temperature is taken as a straight line between the times they look, to find when it crosses 0. Planning what someone could do (the 12 h rule) leaves the weather out.",
    ]);

    if (strategy) add("The player", "Strategy", [
      `Each day, before anything else (before the scholars are seen to), the player may: <b>kill</b> anyone (gone at once, counted among the day's deaths; a partner is single again that night); <b>appoint the scholars</b>: the list they give is the day's scholars (grown-ups only, any number, elders too), instead of the village's own choosing; <b>pour</b> the well full to ${n(Wa.wellCap)}; and <b>give</b> any number of 刀 叉 衣 笠 of a tier up to SR, in store as if just made (unworn).`,
      "On the 1st of each month (days 1, 31, …, 331 of a year) they may give anyone their <b>own order of the day's jobs</b>, which may hold <b>發呆</b> (doing nothing): coming to it, they stop for the day, the Power left unspent (a child skips class too; a scholar teaches or writes only what comes before it); it stands until changed (a newborn has none). With an order, the person goes down their own order: in Micro choosing their next job, a scholar choosing teaching or poetry, and in Macro the day's jobs go by rank: everyone's first job, then everyone's second, …, at each rank the jobs in the village's order, each with those who have it there.",
      "For each couple they may say whether they may have a child: a couple told no has no chance of one at night (a pregnancy already under way goes on) until told yes. Couples only exist from the Happiness page on.",
      "Strategies, as players. Every one keeps the well full, gives SR 衣 and 笠 to everyone and SR 刀 and 叉 to every grown-up as they're needed (enough in store for 1.2 each), appoints one scholar once there are 6 adults (none before), and kills nobody. No child's or scholar's order holds crafting (the scholar teaches first: class, the fields, milking, collecting, reading). A smith, where there is one: once there are 4 adults, the youngest man who isn't a scholar, the forge first every day for the rest of his life (elder years too; a new one when he dies or is made a scholar); while it waits he cuts timber (伐木) first if he has a gatherer, else 伐木 and 採石 first by turns, a month each. Where a strategy gives orders that collect both, every other person by age has 伐木 before 採石 / 羊毛, the rest the other way round. Most people: every couple may have a child while the store holds 30 days' food; a smith; the brightest adult as the scholar; children go to class first while the store holds 90 days' food; everyone else works the food first. Its goal is the most people at once. Best all-rounder: the village held under 20 people (the children on the way counted), a couple may have a child only while it has fewer than 2 children (those on the way counted), every child goes to class first, the strongest adult is the scholar, everyone else works the food first, and while there's room for a child and 60 days' food in store, the couple who could have one now (both adults, she able to conceive) with the most Power + Intelligence between them gets that month's order 發呆. Its goal is the highest Power + Intelligence anyone reaches; the Highest Intelligence and Highest Power columns come out near their best under it too (raising for either alone does no better than a few points). A UR craft: under 20 people, fewer than 2 children; a smith, and his gatherer: once there's a smith, the youngest adult man after him who isn't a scholar, quarrying first every day (採石, 伐木, the fields, milking, teaching, reading) for the rest of his life; nobody else's order holds crafting, so only the smith uses the forge and the loom stands idle; the brightest adult as the scholar; children go to class first while the store holds 90 days' food. All but Sustainable play all 100 years; Sustainable plays its hands-off years (" + n(St.handsOff) + ") with the brightest grown-up as the scholar, every grown-up on the food first and children only while the store holds 30 days' food, gives on its last day enough SR crafts for everyone to the end, lets every couple have children again, and lets go: from the next day the village chooses its own scholars, nothing is poured or given, and the orders it gave stand. Its goal is the most people on an average day over its years on its own.",
    ]);

    if (watering) add("Watering", "Watering", [
      `The well (井, a place on the Map) holds at most ${n(Wa.wellCap)} water and starts full. Each day, once the day's work is done, it refills over the day's 24 hours: from the ground at W ÷ 2 an hour (W: the land's water level, the Weather page's, at the day's end) while it holds under ${n(Math.min(Wa.wellCap, Wa.wellGround))}, and from the rain at its rainfall an hour (snow too) up to ${n(Wa.wellCap)}, worked out between the rain's changes.`,
      `Each of the 4 fields has a water level, 0–10; the fields are numbered in the order they're taken each day (the first farmer's is field 1), and start at the land's level. Tending uses ${n(Wa.waterUse)} level per Power. A farmer who finds their field at level ${n(Wa.waterAt)} or lower (and not full, at 10), on arriving or after each unit, walks for 1 water and back with it: +1 level (at most 10). They go to the well (井) if it has water and is no further from the field than the river (川), otherwise to the river, while it runs: it's dry on a day that starts with the mountain (the Weather page's) at 0 (no river running, or none on the map, and the well empty: no water). In Macro this happens along their clock, as carrying home does.`,
      `At the day's end, a field nobody tended today takes the land's level. A field tended at least once this year is seeded: until the harvest (days 1–180) it grows rice by itself each day by its level, rounded down: ${Array.from({ length: 11 }, (_, k) => `${k ? "" : "level "}${k}: ${signed(Wa["g" + k])}`).join(", ")}. On day 181 the rice standing is the tending's (as before) plus all the water's growth this year, never below 0.`,
    ]);

    if (crafts) add("Crafts", "Craft", [
      `Women weave (紡織) 衣 clothes (${recipe("clothes")}) or 笠 hats (${recipe("hat")}); men forge (鍛造) 刀 blades (${recipe("blade")}) or 叉 hayforks (${recipe("fork")}); ${craftEnergy()} of work at the house.` + " One loom and one forge, one crafter each a day; a craft takes its materials up front and is worked until done, across days, by whoever holds the station. Weaving and forging each use a 刀: the crafter's for the day (the one they carry, or the best left, taken at the station); it adds its bonus to the craft. With none they craft without it, the 刀 counting 0 in the score.",
      `To start with, the store holds ${startKit()} (Craft page: any number of R 刀, 叉, 衣 and 笠 to start with, each worn out like a made one).`,
      "Next item: the station's item started fewest times (衣 before 笠, 刀 before 叉); the station waits until all its materials are in store.",
      `In use: each day everyone with Power left (and the scholars), in village order, takes the best 衣 and 笠 left. Trying field work or collecting, someone without one today first takes the best left of its tool (tending: a 叉; the harvest and collecting: a 刀, the same 刀 all day), putting it back if they don't get the job. Best: the highest tier, the oldest on a tie; each is taken once a day. Wear, by Power spent: 衣 and 笠 all of their wearer's (lasts ${wears("clothes", "hat")}), 叉 tending and 刀 at the harvest, collecting and crafting with it (${wears("fork", "blade")}); worn out,` + " it's gone at the end of the day, before the day's new crafts come in.",
      "It takes each material best tier first (closing the filling lot early if the full ones fall short). Done: its score = the average of three, to the nearest 0.01: its materials' average tier, its crafters' skill tier and their 刀's tier (0 without one), these two averaged by work on it. Tier = <b>round((score + roll) ÷ 2)</b>, half up, held to 1–5; roll: an even draw of 1.01, 1.02, …, score + 1 (worked in hundredths). All three SSR (4.00): SSR 50%, SR 49.75%, UR 1 in 400; below 4.00, never UR.",
    ]);

    if (skills) add("Skills", "Resources", [
      `Nine skills, each with exp and a level (0–4), from 0 exp and level 0 (the born too): milking, farming (tending and harvest), woodcutting, weaving, forging, shearing, quarrying, teaching, poetry. Each Power spent on the job is 1 exp; a child's class earns none. Levels 1 / 2 / 3 / 4 take <b>${[R.exp1, R.exp2, R.exp3, R.exp4].map((v) => n(v)).join(" / ")}</b> more exp each (level 4 at ${n(D.expTotal)}), counted at the end of the day for the next.`,
      `<b>Effectiveness m = 1 + 0 / ${[R.bonus1, R.bonus2, R.bonus3, R.bonus4].map((v) => n(v) + "%").join(" / ")} at skill level 0 / 1 / 2 / 3 / 4` + (crafts ? ` + their tool's bonus: 叉 tending, 刀 at the harvest and collecting, ${[Cr.bonus1, Cr.bonus2, Cr.bonus3, Cr.bonus4, Cr.bonus5].map((v) => n(v) + "%").join(" / ")} for N / R / SR / SSR / UR (as made)` : "") + "</b>, a yield. Milking, tending and shearing: their need, done, reserved and open are Power (milking: no end, one to a cow; the fields' daily limit, the wool on the sheep ÷ wool per Power), each Power using up 1 of it and bringing in m: milk, the field's rice, wool. Timber, stone, knowledge from teaching and poetry: Power spent × m. Harvest: speed, as the standing rice is all there is: its need, done, reserved and open are work, Power spent × m (could still do: the Power × m; a unit, min(10, e, reservation left ÷ m) Power, credited × m)." + (crafts ? " Crafts: speed too, the Power a craft takes being work (a unit: min(10, e, craft left ÷ m) Power, credited × m)." : "") + " Hours go by Power spent.",
    ]);

    if (school) add("Scholar and school", "Education", [
      `Each morning, while there are fewer scholars than children who may go to class and than the most scholars (${n(Ed.maxScholars)}), the adult` + " with the highest Intelligence who isn't one (first in village order on a tie) is appointed if the village could spare them all: without the scholars and the children, at least 4 grown-ups who may tend have Power left, and from a second scholar on, the grown-ups left who may milk, the best one to each adult cow, could milk the whole village's need (each Power × milk effectiveness × their milking effectiveness). They serve until elder age or death, and do no other work.",
      `Each day the scholars who may teach and teach first (Education above Poetry, or may not write) take the children who may go: the children in a random order (their own dice), the i-th to the (i mod n)-th of the n teachers in the order appointed. Class is at the house, on for a child while their scholar has Power left and hasn't gone in. A child going to class walks home, sits, and chooses again at ${hrs(M.lunchAfter)} or ${hrs(M.activeHours)} (or when work opens up). A child sitting down calls their scholar at once, if waiting or writing (a poem cut short counts the Power spent so far).`,
      `A scholar, choosing: no Power left: wait (work opens up). Else a unit of min(10, e) at the house (if it can start: the ${hrs(M.activeHours)} h rule),` + " the first in priority of teaching (if a child of their class is seated with Power left) and a poem (if they may write); neither: wait.",
      "At the end of each teaching unit, each of the class seated (and a child leaving mid-unit) is credited for the time since the latest of sitting down, the unit's start and their last credit, at most e ÷ r: they spend that time × r and take home " + (Ed.knowPerEnergy !== 1 ? `${n(Ed.knowPerEnergy)} × ` : "") + (skills ? "the scholar's teaching effectiveness × " : "") + "min(that time × the scholar's r, their Power spent) ÷ the children in the class knowledge. Out of Power, a child leaves and chooses again; lunch and night end class.",
      `A child's knowledge bank + what they take home buys Intelligence one point at a time, for life, each costing <b>(max(x, I) − x)² + ${n(Ed.knowBase)}</b> (x = ${n(Ed.intelPast)}, Intelligence points dearer past; ${n(Ed.knowBase)}: the base cost) at their Intelligence I then. Poetry: ⌊${Ed.knowPerEnergy !== 1 ? n(Ed.knowPerEnergy) + " × " : ""}the day's Power spent on poetry` + (skills ? " × poetry effectiveness" : "") + "⌋ knowledge, kept apart as the scholar's poetry; it doesn't change their Intelligence.",
    ]);

    if (at("food")) add("Whole numbers", "", [
      `Power to spend, food made${at("inheritance") ? " and attributes" : ""} round down; food made from Power spent keeps its fraction in a running total. The day's food eaten rounds to the nearest unit.${school ? " Knowledge keeps its fractions." : ""}`,
    ]);

    if (at("food")) add("One day, in order", "", working ? [
      "Stored food ages; past its keeping time, it spoils." + (school ? " Scholars step down at elder age or death; appointment (above)." : "") + " Day 1: tending restarts; day 181: the crop is ripe." + (resources ? " The sheep grow wool." : ""),
      "The day, person by person, with yesterday's adult cows" + (resources ? " and sheep" : "") + ". Then " + (skills ? "exp and levels; " : "") + (school ? "knowledge and poetry; " : "") + (resources ? "timber, wool (off the sheep), stone" + (crafts ? " and finished crafts" : "") + " into store; " : "") + "milk and rice into store; on day 270 the field's rice is lost.",
      "Everyone eats.",
      "Hunger, ageing and deaths, " + (happiness ? "happiness, couples, " : "") + "births, newcomers" + (at("inheritance") ? "; newborns' attributes, and those coming of age get their bonus" : "") + ".",
    ] : [
      "Stored food ages and spoils; today's milk and rice go into store.",
      "Everyone eats. Hunger, ageing and deaths, births, newcomers.",
    ], { ordered: true });

    if (working) add("Macro mode", "", [
      "A quick copy of the rules above, worked out for the village as a whole; Micro mode compares the two. The grown-ups, in a new random order each day, each on their own clock (walking, lunch, carrying), spend as much as their day allows on the jobs in priority order: milking, one to a cow (milk-only first), the 4 fields, one person to each, up to its daily limit (most Power left first), the harvest until it has its work" + (crafts ? ", crafts (whoever has no food work first, as in Micro)" : "") + (resources ? ", collecting (each in their order, as in Micro)" : "") + "." + (crafts ? " Tools are taken as in Micro." : "") + " Children fill the food work left, most Power left first, and keep the rest for class." + (school ? " Each child is taught for the hours they'd share with their scholar on average over wake-up times (a triangle over ±4 h), ÷ the children in the class." : "") + (skills ? " Work is Power spent × effectiveness, as in Micro." : ""),
    ]);

    add("Simulation notes", "", [
      is("herd") ? "Runs last 1,000 days by default." : is("humans") ? "Runs last 10,000 days by default." : "Runs last 36,000 days (100 years of 360; day of year = ((day − 1) mod 360) + 1).",
      (is("herd") ? "The page plays 20 seeded runs (mulberry32) and draws the first; a run survives if anyone is alive at the end." : "The page plays one seeded village (mulberry32), the one drawn; it survives if anyone is alive at the end.") +
        (at("food") ? ` Separate dice for ${["the cows", resources && "the sheep", "the people", at("inheritance") && "the birth draws", working && "the day's waking", school && "the classes", happiness && "the pairing", resources && "the tiers", cold && "the weather"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")}, so each policy faces the same luck; the identical runs also depend on the order dice are drawn, which only the code sets. Comparisons allow a billionth for rounding.` : ""),
      at("humans") && "A run stops past 2,000 people (counted as surviving). A death is hunger's if hunger took at least a day off that life.",
      working && "Micro mode (the switch at the top) is the game's rules; Macro is the quick copy and runs by default.",
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
