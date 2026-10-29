// Implementation details: every rule a page runs, tersely, for building the simulation into the game.
// Each page has <section class="card impl" data-page="..."> with a .rules-body inside; this fills it
// with the groups that page uses, then a footer of simulation notes (how the page runs, not game rules).
// Numbers are the defaults. Keep this in step with the models: from the Attribute page on, these are
// Micro mode's rules (micro-model.js), complete enough to rebuild it and as short as that allows; worked
// examples belong in page hints. The Rulebook page (rulebook.html) says the same in plain words, sorted
// into the game's rules and the simulation's; a change here may need it there too.
(function () {
  const ORDER = ["herd", "humans", "food", "map", "attribute", "inheritance", "education", "happiness", "resources", "craft", "weather", "clothing", "watering", "strategy"];

  function groups(page) {
    const at = (name) => ORDER.indexOf(page) >= ORDER.indexOf(name);   // this page or a later one
    const is = (...names) => names.includes(page);
    const working = at("attribute");   // people work for their food, on the Map page's map and day
    const school = at("education"), happiness = at("happiness"), resources = at("resources"), skills = resources, crafts = at("craft"), cold = at("clothing"), wet = cold, watering = at("watering"), strategy = at("strategy");
    const out = [];
    const add = (title, where, items, opts = {}) => out.push({ title, where, items, ...opts });
    const walking = () => {
      add("Map and walking", "Map", [
        "A 16 × 16 grid of house, farm, pasture, forest and mine tiles (the well and the river are where farmers fetch water, from the Watering page on). Each kind of place is worked at its tile with the fewest steps (no diagonals) to any house (tie: first scanning rows top to bottom, left to right). Walking is 1 minute a tile: house ↔ place, that place's steps; place ↔ place, the steps between their two tiles." + "",
        "Waking: N people, N + 1 exponential gaps g₀ … g<sub>N</sub>, the people in a random order; the k-th (from 0) wakes at 4 + 4 × (g₀ + … + g<sub>k</sub>) ÷ (g₀ + … + g<sub>N</sub>) o'clock. All times below are hours since that person woke.",
        "Out of the house for 12 h. Breakfast by the house (24 min). From 5½ h: home for lunch (idle: at once; working: once the unit under way is done and carried home), eaten by the house (24 min), then back out. From 12 h: the same, home for the night; they go in on reaching the house.",
        "Work goes a unit at a time: 10 energy, or less if the person or job has less left, taking unit ÷ r hours (r: see Power and Intelligence). <b>A unit starts only if they'd finish it and be home by 12</b>; once started it's finished. Collecting (milking, harvest" + (resources ? ", timber, wool, stone" : "") + ") is carried home after every 10 energy and at the end of the job: a walk home and back each time. Anyone with nothing to do waits by the house.",
      ]);
      add("Meals and hunger", "Map", [
        "Share g = the food eaten ÷ need, at most 1 (the children's, or the grown-ups', see Eating). Breakfast and lunch are each half of it and each keeps them full for <b>f = 6g</b> hours: breakfast until f; lunch, from Lh (when they got home for it), until max(f, Lh) + f.",
        "How hungry they get through the day is only shown (Micro mode): it costs no days of life. Hunger's toll goes by the food they went without (see Humans).",
        "Going in early (it changes nobody's work): let o be when they were first back at the house with no energy left. If o < Lh and max(o, f − 2.4) < Lh, they go in then and skip lunch. Otherwise, if max(o, Lh + 24 min, max(f, Lh) + f − 2.4) is before E, that's their E. Never home for lunch: Lh = 5½; never went in: E = 12. Shown as hungry at 2.4 h of food left or less.",
      ]);
    };
    if (is("map")) { walking(); return out; }
    if (is("weather")) {
      add("Seasons", "Weather", [
        "Days 1–90 of each 360 are spring, 91–180 summer, 181–270 autumn, 271–360 winter. Each season has its own settings: spawn rate λ, average wind w̄, wind volatility σ, cloudiness q, rain changeability ρ, and for temperature μ, s, c, k.",
        "<b>Defaults</b> (spring / summer / autumn / winter): λ 0.65 / 0.45 / 1.5 / 1.45 an hour; w̄ 5.5 / 2.5 / 6 / 1.5 tiles an hour (so the spells last L = 47 / 102 / 43 / 171 h); σ 1.5 / 1.5 / 2 / 1.5; q 75 / 15 / 50 / 10%; ρ 2.65 / 0.55 / 0.3 / 0.85 an hour; average temperature μ 15 / 30 / 15 / −5 °C; and in every season spread s 5 °C, cloud cooling c 10 °C, rain cooling k 10 °C.",
        "<b>Season ramp</b> h = 15 days: the base temperature b(d) on day d is its season's μ, except within h days of a season's start: there, with p the days from the boundary (half-days counted: the first day of a season is p = 0.5, the last of the one before p = −0.5), b = μ_before + (μ_after − μ_before) × (p + h) ÷ 2h. h = 0: no ramp.",
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
        "<b>Through the day</b> (nothing above depends on it): at clock hour t the temperature is <b>T + (D ÷ 2) × f(t)</b>, f = −cos(π (t − 6) ÷ 9) from 06:00 to 15:00 and cos(π ((t − 15) mod 24) ÷ 15) otherwise: lowest T − D ÷ 2 at 06:00, highest T + D ÷ 2 at 15:00, averaging T over the day. D = the season's daily swing × (1 − 0.6 × its average clouds ÷ 10); daily swing 8 °C in every season.",
        "A day's type, by what most of its hours were: sunny (no clouds), cloudy (clouds, no rain) or rainy / snowy (raining); a tie goes to the wetter. Sunny days average warmest and rainy ones coolest; one day's random part can still turn that round.",
      ]);
      add("Water level", "Weather", [
        "One water level W for the whole year, held to 0–10; it starts at 5. At W = 0 it's a <b>drought</b>, at W = 10 a <b>flood</b>.",
        "Raining (or snowing) at rainfall n: W rises n ÷ 320 an hour (rain per water level). Dry: W falls d × (1 + 0.45 (W − 5) ÷ 5) an hour (drain slope 0.45), d = 0.0036 with no clouds (sunny drain), 0.0019 with clouds (cloudy drain): a + bW with a = 0.55d, b = 0.09d.",
        "The sky only changes at its events (a cloud coming or leaving, a spell or the wind changing, a re-roll), so between two of them W follows a set curve: rising, W + nt ÷ 320; falling, <b>W(t) = (W₀ + a/b) e^(−bt) − a/b</b>, reaching 0 after ln((W₀ + a/b) ÷ (a/b)) ÷ b hours (b = 0: W₀ − at). Work it out event by event, stopping at 0 or 10 at the exact moment it gets there and counting the rest of the time there as drought or flood. The game can show it as often as it likes; the answer doesn't depend on how the time is split.",
        "The mountain above the river (川) keeps a second level M the same way (it starts at 5, takes the same rain, drains by the same formula), except that it doesn't drain in the hours whose temperature is below −5 °C (the hour's temperature through the day; the river is frozen). While M > 0 the river runs; M = 0 and it's dry. M is never below W, so the river only runs dry in a drought (by default in about 3% of years, about one drought in three).",
      ]);
      return out;
    }

    if (!is("humans")) add("Cows", "Herd", [
      "Lifespan 360 × (1 ± up to 15%) days, drawn evenly. Start: 10 cows, each aged ⌊an even draw below its lifespan⌋." + (at("food") ? " Calves (under 60 days) give no milk." : " Under 60 days, a calf."),
      "Each day: ageing, deaths at lifespan; then with N cows the herd changes by <b>r·N·(N/A − 1)·(1 − N/K)</b> (r 0.02, A 2, K 10). The fraction is a chance (2.3: 2, plus 1 at 30%). Positive: that many calves, never past 10 × K cows; negative: that many deaths, each the cow at ⌊u × N⌋ in herd order, the last cow taking its place (u: a die roll in [0, 1)).",
      at("food") && "Each day the village has the adult cows of the day before.",
      "Tiers: 1 N, 2 R, 3 SR, 4 SSR" + (crafts ? ", and for crafts only 5 UR" : "") + ". <b>draw(x)</b> = x + (⌊u × 100⌋ − 49) ÷ 100, rounded half up, held to 1–4" + (crafts ? "" : "") + "; cows and sheep at most 3. Start: all SR. A calf (on the day's births, in turn): draw(the average of two different adults: the ⌊u × n⌋-th of the n adults in herd order, then the ⌊u × (n − 1)⌋-th of the rest; one adult: it twice; none: from everyone).",
    ]);

    if (at("humans")) add("People", "Humans", [
      "Lifespan 3,600 × (1 ± up to 10%) days, drawn evenly. Child under 360 days, adult to 3,240, then elder; adults and elders are grown-ups. Start: 6 men, 6 women, each aged min(lifespan − 1, 360 + ⌊an even draw below (lifespan − 360)⌋).",
      happiness
        ? "Couples last for life. Each night after the deaths, a couple with a dead partner ends; then single adult men and women, each shuffled, pair up in order (the shorter list's length). First, mothers who conceived G = 300 days ago give birth (in village order); a mother who died first loses the child, but a father who died still counts as its father. Then only couples of two adults whose woman can conceive (not expecting, and her age + G under elder age) may conceive, each at its own chance (see Happiness), taken in the order they paired. A newborn is a boy with chance (W + X) ÷ (M + W + 2X), M and W the living males and females under elder age (newborns of the same night included), X the birth balance (1, 0–1; nobody to count: even)."
        : "Couples = min(adult men, adult women). First, mothers who conceived G = 300 days ago give birth (in village order); a mother who died first loses the child. Then the first adult women in village order, as many as there are couples, each conceives at 0.01 a day if she can (not expecting, and her age + G under elder age). A child is born a boy with chance (W + X) ÷ (M + W + 2X) (M, W: living males and females under elder age, the night's newborns included; X the birth balance, 1).",
      (working ? "Need: each person's <b>Power</b> in food a day, children and elders too." : "Need: 100 food a day per adult, 70 per child, 80 per elder.") + " Missing = (1 − share) × their need (share = food eaten ÷ need, " + (at("food") ? "the children's or the grown-ups', see Eating)." : "the same for everyone).") + " <b>Hunger's toll: ⌊S⌋</b> days of life (1 a food missed), S = all the food they've missed in their life: each short day adds its missing food to S and takes off their lifespan what that adds to the toll (fractions of a day carry over). So three days with nothing, at a need of 100, cost 100 days each (300 in all). They die when their age reaches their lifespan.",
      "Newcomers: after the births, a village of fewer than 10 people draws one outsider with chance 1 ÷ (n + 1)² ÷ 10 (n: the people tonight, newborns included): aged 360 + ⌊an even draw below 1,081⌋ days (a grown-up), a man or woman by the births' rule, last in village order" + (working ? ", with Power and Intelligence each 80 + ⌊an even draw below 21⌋ (the attribute dice)" : "") + ". An empty village is rescued the same way, at 1 in 10 a day: it's \"died out\" only while nobody is there.",
      is("humans") && "Each day: hunger, ageing and deaths, births, newcomers. Food: a fixed 2,000 a day, never stored.",
    ]);

    if (at("food")) add("Food", "Food", [
      "Milk and rice meet need one for one. Made on day d, they keep until day d + keep (milk 1, rice 360). Start: 50,000 food in store that never spoils.",
      "A standard day is 100 energy. 1 energy collects 1 milk (one milker to an adult cow a day, with no limit on a cow, whatever its tier) or grows 1 rice tending (at most 50,000 per field a year, 4 fields).",
      !working && "Nobody works: each adult cow gives a standard day's milk (100); while any adult lives, the year's 72,000 rice comes in evenly over days 181–210.",
    ]);

    if (at("food")) add("Eating", "Food", [
      "The children eat first: their full need while there's food in store (milk, rice and the starting food), out of the milk first (the oldest first), then whatever spoils soonest. Short of even that, each child gets the same share of their need, all there is.",
      "Then the grown-ups (elders too) eat out of what's left, whatever spoils soonest (milk on a tie), the starting food last: their need, or short of it, each the same share of their need, s = the food left ÷ the grown-ups' need: all there is (in whole food). Nobody rations." + (at("inheritance") ? " With the grown-ups' need met too, the children then drink all the milk left in store: <b>extra milk</b>, split evenly." : ""),
    ]);

    if (working) add("Jobs", "Jobs", [
      "The Jobs table: children milk" + (school ? " and go to class" : "") + "; men milk, tend, harvest" + (resources ? ", cut wood, quarry" : "") + (crafts ? ", forge" : "") + "; women the same but " + (resources ? "shear instead of quarry" : "likewise") + (crafts ? " and weave instead of forge" : "") + "; old men and women as men and women" + (school ? "; scholars (row by sex) write poetry and teach" : "") + ". Field work is tending on days 1–180, harvest after. Milk-only: a grown-up who may milk but not do today's field work.",
      "Priority (the order of the day's jobs): fields, milking, crafts (loom, then forge), collecting (shearing, quarrying, woodcutting), Education (class and teaching), Poetry. Jobs a page doesn't have are skipped.",
      "Milking: one milker to each adult cow for the day, who may spend as much as they like on it. Fields: one person to each of the 4 fields for the day. Milk made = whole milk from all milking energy so far, less earlier days' (fractions carry over). Tending: 50,000 ÷ 180 energy a day each field (so at most that each person); on day 181 the field holds ⌊the year's tending work⌋ rice. Harvest: ⌈min(400, rice in the field ÷ 25)⌉ energy, each bringing in 25 rice; whatever's left after day 270 is lost.",
    ]);

    if (working) walking();

    if (working) add("The day, person by person", "", [
      "Everyone (grown-ups, children" + (school ? ", the scholars" : "") + ") has today's energy e and rate r, in village order (starting men, starting women, then the born by birth), starting at the house. Events run on one clock in time order, ties in the order given; each person has at most one event pending, and a new one replaces it.",
      "Waking: breakfast, then <b>choose</b>. Choosing at hour t: t ≥ 12: let go of any job" + (school ? " and class" : "") + " and head home for the night; before lunch and t ≥ 5½: head home for lunch, keeping the job" + (school ? " (leaving class)" : "") + "." + (school ? " The scholar: see School." : "") + " Otherwise, with energy, up to 4 tries: drop a job with nothing left for them or no unit that could start there; " + (school ? "children without a food job choose food work or class" : "children without a job choose food work") + ", grown-ups without a job take one from the board; then go to it. Nothing found: <b>wait</b>.",
      "Waiting: let go of the job, walk home if out (no choosing on the way). At the house, the first time with no energy left marks o. Choose again at 5½, after lunch at 12, or when work opens up.",
      "Going to a job: walk straight there, choose again on arrival. There, unit = min(10, e, what the job lets them do), 0 if it can't start (the 12 h rule); 0: let it go and try again; otherwise work it, then it's credited and taken off e. Then choose again where they are, except collecting away from the house: add it to the load, and with 10 carried, no energy, or nothing more for them there, walk home first (setting off home empties the load).",
      "Home for lunch: Lh = then; eat (24 min), choose. Home for the night: E = then; done.",
      "<b>Could still do</b> at a place: the whole energy (≤ ⌊e⌋) they'd get done going there now and doing only that job all day, in whole units, under these rules: from where they are (walking: where they set out from), with their load, from now or the end of their meal; units start only before 5½ unlunched (else home, lunch, back first), and by the 12 h rule.",
    ], { ordered: true });

    if (working) add("The job board", "", [
      "<b>Shared</b>: milking (no end), fields" + (resources ? ", shearing (needs ⌈wool on the sheep this morning ÷ 1⌉), quarrying and woodcutting (no end)" : "") + ". Each has places, one person to each for the day, theirs once they take the job: a cow each, the 4 fields" + (resources ? ", a sheep each with wool (the fullest first), 2 places at the mine and 3 in the forest (their crews)" : "") + "; a field takes at most its daily limit from its person" + (resources ? ", a sheep its wool" : "") + " (any cap, below). Open = need − done − reserved. Taking one reserves min(open, could still do there, any cap); the job lets them do their reservation left; grown-ups who run out reserve again the same way (children don't), and there's nothing left for them at 0. Letting go returns the unused.",
      crafts && "<b>One a day</b>: loom and forge, the first to take each keeping it for the day, while a craft is under way or all its next item's materials are in store (min(10, e, what's left of the craft); with none under way, the unit starts one). Taken if nobody else has had it today, nobody holds it, it has work and they could still do ≥ 1 there.",

      "Grown-ups take the first job in priority order that they may do and can get. Milking: one milker to an adult cow for the day; the cow is theirs once they take milking, even between spells of it. Anyone else who may do today's field work takes a cow only if one is left over for each milk-only grown-up without a job or a cow (awake or not) who could still milk." + (resources ? " Collecting: of their own (women wool, men stone) and timber, the one with less in store this morning (tie: their own) first, then the other, then the other sex's." : ""),
      "Children go down the same list: milking only if a cow is left over for each grown-up without a job (awake or not) who may milk and could; fields only if a field is left over for each grown-up without a job or a field (awake or not) who may farm and could, and only for the gap the grown-ups without a job who may do it couldn't cover (open − the sum of what they could still do there), at most that" + (school ? "; Education if class is on. A child in class keeps the seat unless food work above Education needs them" : "") + ".",
      "<b>Work opens up</b> when someone lets go of a shared job with reserved energy unused while some is open" + (crafts ? ", or of a one-at-a-time job with work left" : "") + (school ? ", or a scholar runs out of energy or goes in" : "") + ": everyone at the house with energy who is waiting" + (school ? " or in class" : "") + " chooses again at once, in village order.",
    ].filter(Boolean));

    if (working) add("Power and Intelligence", "Attribute", [
      "Energy e = <b>⌊Power⌋</b> a day; rate r = <b>Intelligence ÷ 10</b> energy an hour. " + (is("attribute") ? "Everyone has 100 / 100." : "Starting grown-ups have 100 / 100.") + " Elders: both × 0.8 (the elder penalty). Power and Intelligence never go below <b>70</b>" + (at("inheritance") ? ", a child's below 70 − 30 = 40 (less what they gain coming of age), at birth or from hunger" : "") + "." + (school ? " Scholars: Power × 0.9, Intelligence × 1.1 (the scholar adjustment)." : ""),
    ]);

    if (at("inheritance")) add("Inheritance", "Inheritance", [
      "Newborn: Power and Intelligence each = <b>max(40, ⌊0.7 × the average of " + (happiness ? "their parents'" : "a random adult man's and woman's") + " × (1 ± up to 15%)⌋)</b>, " + (happiness ? "the parents being the mother and her partner when she conceived (alive or not by the birth)" : "the pair drawn") + ", then the variation evenly for Power and for Intelligence. No adult man or woman: the starting Power and Intelligence, 100 each.",
      "<b>Extra milk</b> (see Eating): with everyone's need met, children's and grown-ups', all the milk left in store, shared evenly among the children (fractions kept). Rice and the starting food build no Power.",
      "Each day after eating, a child's milk bank + their extra milk buys points one at a time, each costing <b>(max(x, P) − x)² + 100</b> (x = 70, points dearer past; 100: the base cost) at their Power P then, kept for good. Their hunger bank + the food they went without (their need × (1 − the share)) takes <b>1 Power for every 10</b> (hunger per −1 Power), down to 40 (below born Power if need be). At 360 days: +30 to both; both banks are emptied.",
    ]);

    if (happiness) add("Happiness", "Happiness", [
      "Happiness = min(100, <b>max(0, 150 − ⌊Intelligence ÷ 1⌋) + ⌊energy left at the end of their last day ÷ 10⌋</b>), set each night (in time for that night's births) and kept through the next day. Energy left: after all jobs" + (school ? " and a child's class; a scholar who writes poetry has none" : "") + ". Day 1 and the born: none yet.",
      "Each person's chance of conceiving: <b>0.01 × happiness ÷ 50</b>; a couple's is the average of the two (the child is born G days later; see Humans).",
    ]);

    if (resources) add("Sheep and resources", "Resources", [
      "Sheep: the cows' herd model (same settings, own dice); the village has the adult sheep of the day before. Each carries 0–300 wool. Each morning all grow 30 back (to 300); new adults arrive with 300; when there are fewer, sheep are removed one at a time from the wool level most sheep have (the lower on a tie). All of this per tier.",
      "1 energy = 1 timber (forest), 1 wool (pasture) or 1 stone (mine); forest and mine never run out. One person to a place a day: a shearer to each sheep with wool (the fullest first, at most its wool), and at most 2 quarriers and 3 woodcutters a day (the mine's and the forest's crews), each keeping their place for the day. Each day's take is whole (fractions carry over) and kept forever. Shorn wool comes off the fullest sheep first (the higher tier first), one sheep at a time. Children don't collect" + (crafts ? " or craft" : "") + ".",
      "Tiers: a skill's is its level (0 counts as N); forest and mine are SR. The day's take of each has one average: wool (skill, sheep" + (crafts ? ", 刀" : "") + "), timber (skill, forest" + (crafts ? ", 刀" : "") + "), stone (skill, mine" + (crafts ? ", 刀" : "") + "), skill" + (crafts ? " and the collector's 刀 tier (no 刀: N)" : "") + " weighted by work, sheep by the wool shorn off each. It fills lots of 100 in turn; a full lot's tier is draw(the average over its units).",
    ]);

    if (cold) add("The cold", "Clothing", [
      "The temperature: each village has its own weather (the Weather page's settings, on its own dice), and each hour its temperature (the Weather page's Through the day): the day's T + (D ÷ 2) × f(the hour).",
      "The house is warm (meals, the loom and forge, class, poetry, waiting, the night). Out of it (walking, or at the farm, pasture, forest or mine), each person's <b>felt temperature</b> = the hour's + 5 × their 衣's tier + 5 × the tier of the warmest fire burning within 4 tiles (straight-line distance between tiles); below 0 °C they're in <b>hypothermia</b>.",
      "Hypothermia, from when they go below 0 °C (felt) to when they warm up (to 0 °C or warmer, or home), costs no days of life: each unit of work out of the house below 0 °C is cut by (felt ÷ 10)² as it starts, on top of the rain's cut (the two multiply). Indoors from the cold (staying in, or home to warm up) they eat breakfast and lunch as ever.",
      "Out at work feeling −5 °C or colder, they finish the unit in hand, then walk home to warm up, keeping their job. Arriving at the work site to find it so (after lighting any timber they bring), they turn back. Between 0 and −5 °C they work on, slower.",
      "Leaving the house for a job out of it: if the hour's temperature, with their 衣 and any fire burning at the place when they'd arrive, is 0 °C or more, they go. Otherwise they put on the 衣 of the lowest tier that is warm enough (the oldest of that tier, taken for the day); with none, the warmest 衣 there is, and, with more than 1 energy and the rain under 10, a timber of the lowest tier that makes up the rest (from the closed lots in store); short of that, if it would still feel −5 °C or colder they let go of the job and choose again on the hour (or at lunch, or for the night), and otherwise they go.",
      "At the work site with a timber, they light it, unless the rain is at 10 (then it stays unlit, and goes back to the store when they're home): 1 energy, and it warms everyone within 4 tiles for 2 h, less in the rain: at rain level R it burns × 1 ÷ (1 − (R ÷ 10)²) as fast (2 × (1 − (R ÷ 10)²) h in a steady rain, the work's cut), the rain changing as it burns. 衣 is worn only for warmth; a 衣 put on is kept for the day and worn by all its wearer's energy, and one swapped for a warmer goes back unworn.",
    ]);
    if (wet) add("The rain", "Clothing", [
      "The rain: the village's rainfall R, 0–10, hour by hour (the Weather page's rain under its clouds; snow counts the same). Out of the house, each person feels <b>max(0, R − 2 × their 笠's tier)</b>.",
      "Each unit of work out of the house (milking, the fields, shearing, quarrying, woodcutting) does × <b>1 − (felt ÷ 10)²</b>, at the rain as the unit starts: of a yield job's limit (a field's, a sheep's wool) it still takes energy for energy, bringing in less; at the harvest it does less of the work the rice wants. The loom, the forge, class and poetry are in the house.",
      "Nobody goes home or stays in for the rain, whatever its level: it only cuts the work (at 10 felt, to nothing).",
      "Leaving the house for a job out of it with R felt at 5 or more (heavy rain): they put on the 笠 of the lowest tier that brings it under 5 (the oldest of that tier, taken for the day); with none, the best 笠 there is, if it's better than theirs; and they go either way. The rain goes before the cold: only then do they dress for the cold.",
      "With the rain, 笠 is worn only against it (no longer taken every day); a 笠 put on is kept for the day and worn by all its wearer's energy.",
      "In Macro mode the same rules run along each person's clock, a unit at a time (as their work does): everyone wakes at an even spread over the wake-up window, in the order they come to work, and sees the fires lit by those worked out before them; the felt temperature is taken as a straight line between the times they look, to find when it crosses 0. Planning what someone could do (the 12 h rule) leaves the weather out.",
    ]);

    if (strategy) add("The player", "Strategy", [
      "Each day, before anything else (before the scholars are seen to), the player may: <b>kill</b> anyone (gone at once, counted among the day's deaths; a partner is single again that night); <b>appoint the scholars</b>: the list they give is the day's scholars (grown-ups only, any number, elders too), instead of the village's own choosing; <b>pour</b> the well full to 100; and <b>give</b> any number of 刀 叉 衣 笠 of a tier up to SR, in store as if just made (unworn).",
      "On the 1st of each month (days 1, 31, …, 331 of a year) they may give anyone their <b>own order of the day's jobs</b>, which may hold <b>發呆</b> (doing nothing): coming to it, they stop for the day, the energy left unspent (a child skips class too; a scholar teaches or writes only what comes before it); it stands until changed (a newborn has none). With an order, the person goes down their own order: in Micro choosing their next job, a scholar choosing teaching or poetry, and in Macro the day's jobs go by rank: everyone's first job, then everyone's second, …, at each rank the jobs in the village's order, each with those who have it there.",
      "For each couple they may say whether they may have a child: a couple told no has no chance of one at night (a pregnancy already under way goes on) until told yes. Couples only exist from the Happiness page on.",
      "Strategies, as players: Most people and Brightest person hold the village under 20 people (the children on the way counted), with one scholar, the brightest adult, for every 6 adults (none under 6); Brightest person also kills, every third month (with 10 adults or more and 60 days' food in store), the dullest adult who isn't a scholar, if 10 or more below the adults' average. Most people, Brightest person and A UR craft play all 50 years; Sustainable plays its hands-off years (10 by default), gives on its last day enough SR crafts for everyone to the end, lets every couple have children again, and lets go: from the next day the village chooses its own scholars, nothing is poured or given, and the orders it gave stand.",
    ]);

    if (watering) add("Watering", "Watering", [
      "The well (井, a place on the Map) holds at most 100 water and starts full. Each day, once the day's work is done, it refills over the day's 24 hours: from the ground at W ÷ 2 an hour (W: the land's water level, the Weather page's, at the day's end) while it holds under 50, and from the rain at its rainfall an hour (snow too) up to 100, worked out between the rain's changes.",
      "Each of the 4 fields has a water level, 0–10; the fields are numbered in the order they're taken each day (the first farmer's is field 1), and start at the land's level. Tending uses 0.1 level per energy. A farmer who finds their field at level 3 or lower, on arriving or after each unit, walks for 1 water and back with it: +1 level (at most 10). They go to the well (井) if it has water and is no further from the field than the river (川), otherwise to the river, while it runs: it's dry on a day that starts with the mountain (the Weather page's) at 0 (no river running, or none on the map, and the well empty: no water). In Macro this happens along their clock, as carrying home does.",
      "At the day's end, a field nobody tended today takes the land's level. A field tended at least once this year is seeded: until the harvest (days 1–180) it grows rice by itself each day by its level, rounded down: level 0: −100, 1: +10, 2: +20, 3: +30, 4: +30, 5: +20, 6: +10, 7: 0, 8: −10, 9: −50, 10: −100. On day 181 the rice standing is the tending's (as before) plus all the water's growth this year, never below 0.",
    ]);

    if (crafts) add("Crafts", "Craft", [
      "Women weave (紡織) 衣 clothes (200 wool + 100 timber) or 笠 hats (100 wool + 200 timber); men forge (鍛造) 刀 blades (200 stone + 100 timber) or 叉 hayforks (100 stone + 200 timber); each takes 100 energy of work at the house. One loom and one forge, one crafter each a day; a craft takes its materials up front and is worked until done, across days, by whoever holds the station. Weaving and forging each use a 刀: the crafter's for the day (the one they carry, or the best left, taken at the station); it adds its bonus to the craft. With none they craft without it, the 刀 counting 0 in the score.",
      "To start with, the store holds no crafts (Craft page: any number of R 刀, 叉, 衣 and 笠 to start with, each worn out like a made one).",
      "Next item: the station's item started fewest times (衣 before 笠, 刀 before 叉); the station waits until all its materials are in store.",
      "In use: each day everyone with energy (and the scholars), in village order, takes the best 衣 and 笠 left. Trying field work or collecting, someone without one today first takes the best left of its tool (tending: a 叉; the harvest and collecting: a 刀, the same 刀 all day), putting it back if they don't get the job. Best: the highest tier, the oldest on a tie; each is taken once a day. Wear, by energy spent: 衣 and 笠 all of their wearer's (lasts 2,000), 叉 tending and 刀 at the harvest, collecting and crafting with it (2,000); worn out, it's gone at the end of the day, before the day's new crafts come in.",
      "It takes each material best tier first (closing the filling lot early if the full ones fall short). Done: its score = the average of three, to the nearest 0.01: its materials' average tier, its crafters' skill tier and their 刀's tier (0 without one), these two averaged by work on it. Tier = <b>round((score + roll) ÷ 2)</b>, half up, held to 1–5; roll: an even draw of 1.01, 1.02, …, score + 1 (worked in hundredths). All three SSR (4.00): SSR 50%, SR 49.75%, UR 1 in 400; below 4.00, never UR.",
    ]);

    if (skills) add("Skills", "Resources", [
      "Nine skills, each with exp and a level (0–4), from 0 exp and level 0 (the born too): milking, farming (tending and harvest), woodcutting, weaving, forging, shearing, quarrying, teaching, poetry. Each energy spent on the job is 1 exp; a child's class earns none. Levels 1 / 2 / 3 / 4 take <b>100 / 1,000 / 10,000 / 100,000</b> more exp each (level 4 at 111,100), counted at the end of the day for the next.",
      "<b>Effectiveness m = 1 + 0 / 10% / 20% / 30% / 40% at skill level 0 / 1 / 2 / 3 / 4" + (crafts ? " + their tool's bonus: 叉 tending, 刀 at the harvest and collecting, 20% / 40% / 60% / 80% / 100% for N / R / SR / SSR / UR (as made)" : "") + "</b>, a yield. Milking, tending and shearing: their need, done, reserved and open are energy (milking: no end, one to a cow; the fields' daily limit, the wool on the sheep ÷ wool per energy), each energy using up 1 of it and bringing in m: milk, the field's rice, wool. Timber, stone, knowledge from teaching and poetry: energy × m. Harvest: speed, as the standing rice is all there is: its need, done, reserved and open are work, energy × m (could still do: the energy × m; a unit, min(10, e, reservation left ÷ m) energy, credited × m)." + (crafts ? " Crafts: speed too, a craft's energy being work (a unit: min(10, e, craft left ÷ m) energy, credited × m)." : "") + " Hours go by energy.",
    ]);

    if (school) add("Scholar and school", "Education", [
      "Each morning, while there are fewer scholars than children who may go to class and than the most scholars (1), the adult with the highest Intelligence who isn't one (first in village order on a tie) is appointed if the village could spare them all: without the scholars and the children, at least 4 grown-ups who may tend have energy, and from a second scholar on, the grown-ups left who may milk, the best one to each adult cow, could milk the whole village's need (each energy × milk effectiveness × their milking effectiveness). They serve until elder age or death, and do no other work.",
      "Each day the scholars who may teach and teach first (Education above Poetry, or may not write) take the children who may go: the children in a random order (their own dice), the i-th to the (i mod n)-th of the n teachers in the order appointed. Class is at the house, on for a child while their scholar has energy and hasn't gone in. A child going to class walks home, sits, and chooses again at 5½ or 12 (or when work opens up). A child sitting down calls their scholar at once, if waiting or writing (a poem cut short counts the energy spent so far).",
      "A scholar, choosing: no energy: wait (work opens up). Else a unit of min(10, e) at the house (if it can start: the 12 h rule), the first in priority of teaching (if a child of their class is seated with energy) and a poem (if they may write); neither: wait.",
      "At the end of each teaching unit, each of the class seated (and a child leaving mid-unit) is credited for the time since the latest of sitting down, the unit's start and their last credit, at most e ÷ r: they spend that time × r and take home " + (skills ? "the scholar's teaching effectiveness × " : "") + "min(that time × the scholar's r, their energy spent) ÷ the children in the class knowledge. Out of energy, a child leaves and chooses again; lunch and night end class.",
      "A child's knowledge bank + what they take home buys Intelligence one point at a time, for life, each costing <b>(max(x, I) − x)² + 100</b> (x = 70, the Inheritance page's points dearer past; 100: the base cost) at their Intelligence I then. Poetry: ⌊the day's poetry energy" + (skills ? " × poetry effectiveness" : "") + "⌋ knowledge, kept apart as the scholar's poetry; it doesn't change their Intelligence.",
    ]);

    if (at("food")) add("Whole numbers", "", [
      `Energy, food made${at("inheritance") ? " and attributes" : ""} round down; food from energy keeps its fraction in a running total. The day's food eaten rounds to the nearest unit.${school ? " Knowledge keeps its fractions." : ""}`,
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
      "A quick copy of the rules above, worked out for the village as a whole; Micro mode compares the two. The grown-ups, in a new random order each day, each on their own clock (walking, lunch, carrying), spend as much as their day allows on the jobs in priority order: milking, one to a cow (milk-only first), the 4 fields, one person to each, up to its daily limit (most energy left first), the harvest until it has its work" + (crafts ? ", crafts (whoever has no food work first, as in Micro)" : "") + (resources ? ", collecting (each in their order, as in Micro)" : "") + "." + (crafts ? " Tools are taken as in Micro." : "") + " Children fill the food work left, most energy first, and keep the rest for class." + (school ? " Each child is taught for the hours they'd share with their scholar on average over wake-up times (a triangle over ±4 h), ÷ the children in the class." : "") + (skills ? " Work is energy × effectiveness, as in Micro." : ""),
    ]);

    add("Simulation notes", "", [
      is("herd") ? "Runs last 1,000 days by default." : is("humans") ? "Runs last 10,000 days by default." : "Runs last 18,000 days (50 years of 360; day of year = ((day − 1) mod 360) + 1).",
      (is("herd") ? "The page plays 20 seeded runs (mulberry32) and draws the first; a run survives if anyone is alive at the end." : "The page plays one seeded village (mulberry32), the one drawn; it survives if anyone is alive at the end.") +
        (at("food") ? ` Separate dice for ${["the cows", resources && "the sheep", "the people", at("inheritance") && "the birth draws", working && "the day's waking", school && "the classes", happiness && "the pairing", resources && "the tiers", cold && "the weather"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")}, so each policy faces the same luck; the identical runs also depend on the order dice are drawn, which only the code sets. Comparisons allow a billionth for rounding.` : ""),
      at("humans") && "A run stops past 2,000 people (counted as surviving). A death is hunger's if hunger took at least a day off that life.",
      working && "Micro mode (the switch at the top) is the game's rules; Macro is the quick copy and runs by default.",
      "Lifespans are at least 1 day." + (at("food") ? " The cows carry on after the people are gone." : ""),
    ], { note: true });

    return out;
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

  document.querySelectorAll("section.impl[data-page]").forEach(render);
  window.MagicRules = { groups, render };
})();
