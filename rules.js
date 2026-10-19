// Implementation details: every rule a page runs, tersely, for building the simulation into the game.
// Each page has <section class="card impl" data-page="..."> with a .rules-body inside; this fills it
// with the groups that page uses, then a footer of simulation notes (how the page runs, not game rules).
// Numbers are the defaults. Keep this in step with the models: from the Attribute page on, these are
// Micro mode's rules (micro-model.js), complete enough to rebuild it and as short as that allows; worked
// examples belong in page hints.
(function () {
  const ORDER = ["herd", "humans", "food", "map", "attribute", "inheritance", "education", "happiness", "resources", "craft"];

  function groups(page) {
    const at = (name) => ORDER.indexOf(page) >= ORDER.indexOf(name);   // this page or a later one
    const is = (...names) => names.includes(page);
    const working = at("attribute");   // people work for their food, on the Map page's map and day
    const school = at("education"), happiness = at("happiness"), resources = at("resources"), skills = resources, crafts = at("craft");
    const out = [];
    const add = (title, where, items, opts = {}) => out.push({ title, where, items, ...opts });
    const walking = () => {
      add("Map and walking", "Map", [
        "A 16 × 16 grid of house, farm, pasture, forest and mine tiles (well and river tiles do nothing). Each kind of place is worked at its tile with the fewest steps (no diagonals) to any house (tie: first scanning rows top to bottom, left to right). Walking is 1 minute a tile: house ↔ place, that place's steps; place ↔ place, the steps between their two tiles.",
        "Waking: N people, N + 1 exponential gaps g₀ … g<sub>N</sub>, the people in a random order; the k-th (from 0) wakes at 4 + 4 × (g₀ + … + g<sub>k</sub>) ÷ (g₀ + … + g<sub>N</sub>) o'clock. All times below are hours since that person woke.",
        "Out of the house for 12 h. Breakfast by the house (24 min). From 5½ h: home for lunch (idle: at once; working: once the unit under way is done and carried home), eaten by the house (24 min), then back out. From 12 h: the same, home for the night; they go in on reaching the house.",
        "Work goes a unit at a time: 10 energy, or less if the person or job has less left, taking unit ÷ r hours (r: see Power and Intelligence). <b>A unit starts only if they'd finish it and be home by 12</b>; once started it's finished. Collecting (milking, harvest" + (resources ? ", timber, wool, stone" : "") + ") is carried home after every 10 energy and at the end of the job: a walk home and back each time. Anyone with nothing to do waits by the house.",
      ]);
      add("Meals and hunger", "Map", [
        "Share g = the food eaten ÷ need, at most 1" + (working ? " (each person's group's, see Food advisor)" : "") + ". Breakfast and lunch are each half of it and each keeps them full for <b>f = 6g</b> hours: breakfast until f; lunch, from Lh (when they got home for it), until max(f, Lh) + f.",
        "Out and empty, they lose 2k × t ÷ u² days of life an hour, t = hours hungry so far today (eating or going in pauses it; it restarts at 0 each day), k = 0.1, u = 12 ÷ their need. With s₁ = max(0, Lh − f) and s₂ = max(0, E − max(f, Lh) − f) (E: when they went in), the day costs <b>k × ((s₁ + s₂) ÷ u)²</b>.",
        "Going in early (it changes nobody's work): let o be when they were first back at the house with no energy left. If o < Lh and max(o, f − 2.4) < Lh, they go in then and skip lunch (s₂ = 0, s₁ to then). Otherwise, if max(o, Lh + 24 min, max(f, Lh) + f − 2.4) is before E, that's their E. Never home for lunch: Lh = 5½; never went in: E = 12. Shown as hungry at 2.4 h of food left or less.",
      ]);
    };
    if (is("map")) { walking(); return out; }

    if (!is("humans")) add("Cows", "Herd", [
      "Lifespan 360 × (1 ± up to 15%) days, drawn evenly. Start: 11 cows, each aged ⌊an even draw below its lifespan⌋." + (at("food") ? " Calves (under 60 days) give no milk." : " Under 60 days, a calf."),
      "Each day: ageing, deaths at lifespan; then with N cows the herd changes by <b>r·N·(N/A − 1)·(1 − N/K)</b> (r 0.02, A 2, K 10). The fraction is a chance (2.3: 2, plus 1 at 30%). Positive: that many calves, never past 10 × K cows; negative: that many deaths, each the cow at ⌊u × N⌋ in herd order, the last cow taking its place (u: a die roll in [0, 1)).",
      at("food") && "Each day the village has the adult cows of the day before.",
      "Tiers: 1 基本, 2 中階, 3 進階, 4 稀有. <b>draw(x)</b> = x + (⌊u × 100⌋ − 49) ÷ 100, rounded half up, held to 1–4; cows and sheep at most 3. Start: all 進階. A calf (on the day's births, in turn): draw(the average of two different adults: the ⌊u × n⌋-th of the n adults in herd order, then the ⌊u × (n − 1)⌋-th of the rest; one adult: it twice; none: from everyone).",
    ]);

    if (at("humans")) add("People", "Humans", [
      "Lifespan 3,600 × (1 ± up to 10%) days, drawn evenly. Child under 360 days, adult to 2,880, then elder; adults and elders are grown-ups. Start: 5 men, 5 women, each aged min(lifespan − 1, 360 + ⌊an even draw below (lifespan − 360)⌋).",
      happiness
        ? "Couples last for life. Each night after the deaths, a couple with a dead partner ends; then single adult men and women, each shuffled, pair up in order (the shorter list's length). Only couples of two adults can have a child, each at its own chance (see Happiness), taken in the order they paired; boy or girl 50/50."
        : "Couples = min(adult men, adult women). Each has a child at 0.003 a day, boy or girl 50/50.",
      "Need: 100 food a day per adult, 70 per child, " + (working ? "100 × (1 − elder penalty) = 80" : "80") + " per elder." + (working ? " Hunger (see Meals and hunger) takes days off the lifespan; they die when their age reaches it." : " Each loses <b>0.1 × (their missing food)²</b> days of life a day (missing = (1 − share) × their need; share = food ÷ total need), off their lifespan; they die when their age reaches it."),
      is("humans") && "Each day: hunger, ageing and deaths, births. Food: a fixed 2,000 a day, never stored.",
    ]);

    if (at("food")) add("Food", "Food", [
      "Milk and rice meet need one for one. Made on day d, they keep until day d + keep (milk 1, rice 360). Start: 200,000 food in store that never spoils. Eat whatever spoils soonest first (milk on a tie), the starting food last.",
      "A standard day is 100 energy. 1 energy collects 1 milk (an adult cow gives at most 100 a day as 進階, 90 as 中階, 80 as 基本: its cap) or grows 1 rice tending (at most 50,000 per field a year, 4 fields).",
      !working && "Nobody works: each adult cow gives its cap; while any adult lives, the year's 72,000 rice comes in evenly over days 181–210.",
    ]);

    if (at("food")) add("Food advisor", "Food", [
      "Who rations: nobody (everyone eats their need), the advisor (" + (school ? "the scholar, IQ = ⌊Intelligence × 1.1⌋; no scholar: nobody" : "IQ 120") + "), or you. Rationing gives two shares of need: grown-ups' and children's. Yours: 0–100% and 0–200%" + (at("inheritance") ? " (above 100% is extra food, at most 30 per child a day)" : " (here children get at most their need)") + ". Eaten: grown-ups' need × theirs + children's need × theirs, rounded; if stores run short, both shrink alike.",
      "The advisor: <b>plan = supply ÷ horizon × e<sup>error</sup></b>; both shares = min(1, plan ÷ need)" + (at("inheritance") ? ". If planOwn (the same with the starting food left out of supply) exceeds need, children also get the difference, at most 30 each" : "") + ". Horizon: 181 − day of year before day 181, else 541 − day of year. Supply: milk, rice and starting food in store (with today's) + today's milk × (horizon − 1) + rice to come (" + (working ? "days 181–270: min(rice in the field, (270 − day of year) × today's field energy × 25)" : "days 181–210: the rest of the harvest") + ").",
      `error = lean + (σ ÷ 2) × z; σ = max(0, (160 − IQ) ÷ 400); z a standard normal each day; lean = σ × z′, z′ drawn once per ${school ? "scholar" : "village"}.`,
    ]);

    if (working) add("Jobs", "Jobs", [
      "The Jobs table: children milk" + (school ? " and go to class" : "") + "; men milk, tend, harvest" + (resources ? ", cut wood, quarry" : "") + (crafts ? ", forge" : "") + "; women the same but " + (resources ? "shear instead of quarry" : "likewise") + (crafts ? " and weave instead of forge" : "") + "; old men and women as men and women" + (school ? "; scholars (row by sex) write poetry and teach" : "") + ". Field work is tending on days 1–180, harvest after. Milk-only: a grown-up who may milk but not do today's field work.",
      "Priority (the order of the day's jobs): milking, fields, crafts (loom, then forge), collecting (shearing, quarrying, woodcutting), Education (class and teaching), Poetry. Jobs a page doesn't have are skipped.",
      "Milking needs the adult cows' caps in energy; milk made = whole milk from all milking energy so far, less earlier days' (fractions carry over). Tending: 4 × 50,000 ÷ 180 energy a day in all; on day 181 the field holds ⌊the year's tending work⌋ rice. Harvest: ⌈min(400, rice in the field ÷ 25)⌉ energy, each bringing in 25 rice; whatever's left after day 270 is lost.",
    ]);

    if (working) walking();

    if (working) add("The day, person by person", "", [
      "Everyone (grown-ups, children" + (school ? ", the scholar" : "") + ") has today's energy e and rate r, in village order (starting men, starting women, then the born by birth), starting at the house. Events run on one clock in time order, ties in the order given; each person has at most one event pending, and a new one replaces it.",
      "Waking: breakfast, then <b>choose</b>. Choosing at hour t: t ≥ 12: let go of any job" + (school ? " and class" : "") + " and head home for the night; before lunch and t ≥ 5½: head home for lunch, keeping the job" + (school ? " (leaving class)" : "") + "." + (school ? " The scholar: see School." : "") + " Otherwise, with energy, up to 4 tries: drop a job with nothing left for them or no unit that could start there; " + (school ? "children without a food job choose food work or class" : "children without a job choose food work") + ", grown-ups without a job take one from the board; then go to it. Nothing found: <b>wait</b>.",
      "Waiting: let go of the job, walk home if out (no choosing on the way). At the house, the first time with no energy left marks o. Choose again at 5½, after lunch at 12, or when work opens up.",
      "Going to a job: walk straight there, choose again on arrival. There, unit = min(10, e, what the job lets them do), 0 if it can't start (the 12 h rule); 0: let it go and try again; otherwise work it, then it's credited and taken off e. Then choose again where they are, except collecting away from the house: add it to the load, and with 10 carried, no energy, or nothing more for them there, walk home first (setting off home empties the load).",
      "Home for lunch: Lh = then; eat (24 min), choose. Home for the night: E = then; done.",
      "<b>Could still do</b> at a place: the whole energy (≤ ⌊e⌋) they'd get done going there now and doing only that job all day, in whole units, under these rules: from where they are (walking: where they set out from), with their load, from now or the end of their meal; units start only before 5½ unlunched (else home, lunch, back first), and by the 12 h rule.",
    ], { ordered: true });

    if (working) add("The job board", "", [
      "<b>Shared</b>: milking, fields" + (resources ? ", shearing (needs ⌈wool on the sheep this morning ÷ 1⌉)" : "") + ". Open = need − done − reserved. Taking one reserves min(open, could still do there, any cap); the job lets them do their reservation left; grown-ups who run out reserve again the same way (children don't), and there's nothing left for them at 0. Letting go returns the unused.",
      crafts && "<b>One at a time</b>: loom and forge, while a craft is under way or all its next item's materials are in store (min(10, e, what's left of the craft); with none under way, the unit starts one). Taken if nobody holds it, it has work and they could still do ≥ 1 there.",
      resources && "<b>Quarrying, woodcutting</b>: always open while they could still do ≥ 1 at the mine / forest (min(10, e)).",
      "Grown-ups take the first job in priority order that they may do and can get. Milking: anyone else who may do today's field work takes at most the open milk less what the milk-only grown-ups without a job (awake or not) could still do at the pasture." + (resources ? " Collecting: of their own (women wool, men stone) and timber, the one with less (in store + today's credited take; tie: their own) first, then the other, then the other sex's." : ""),
      "Children go down the same list: milking or fields only for the gap the grown-ups without a job (awake or not) who may do it couldn't cover (open − the sum of what they could still do there), at most that" + (school ? "; Education if class is on. A child in class keeps the seat unless food work above Education needs them" : "") + ".",
      "<b>Work opens up</b> when someone lets go of a shared job with reserved energy unused while some is open" + (crafts ? ", or of a one-at-a-time job with work left" : "") + (school ? ", or the scholar runs out of energy or goes in" : "") + ": everyone at the house with energy who is waiting" + (school ? " or in class" : "") + " chooses again at once, in village order.",
    ].filter(Boolean));

    if (working) add("Power and Intelligence", "Attribute", [
      "Energy e = <b>⌊Power⌋</b> a day; rate r = <b>Intelligence ÷ 10</b> energy an hour. " + (is("attribute") ? "Everyone has 100 / 100." : "Starting grown-ups have 100 / 100.") + " Elders: both × 0.8 (the elder penalty), and they eat 80%." + (school ? " The scholar: Power × 0.9, Intelligence × 1.1." : ""),
    ]);

    if (at("inheritance")) add("Inheritance", "Inheritance", [
      "Newborn: each attribute = <b>max(0, ⌊0.7 × average of a random adult man and woman × (1 ± up to 10%)⌋)</b>; the pair drawn once, the variation evenly, Power first. No adult man or woman: 100 / 100.",
      "At 360 days: +30 to both; then extra food buys Power a point at a time, each costing <b>100 + 10 × max(0, Power − 100)</b>; any remainder is lost.",
      "Extra food: a child's ration above their need, shared evenly (fractions kept), less any of it that came out of the starting food (eaten last). It isn't need: hunger counts only their need.",
    ]);

    if (happiness) add("Happiness", "Happiness", [
      "Happiness = min(100, <b>max(0, 100 − ⌊Intelligence ÷ 2⌋) + ⌊energy left at the end of their last day ÷ 1⌋</b>), set each night (in time for that night's births) and kept through the next day. Energy left: after all jobs" + (school ? " and a child's class; a scholar who writes poetry has none" : "") + ". Day 1 and the born: none yet.",
      "Each person's chance of a child: <b>0.003 × happiness ÷ 50</b>; a couple's is the average of the two.",
    ]);

    if (resources) add("Sheep and resources", "Resources", [
      "Sheep: the cows' herd model (same settings, own dice); the village has the adult sheep of the day before. Each carries 0–100 wool. Each morning all grow 10 back (to 100); new adults arrive with 100; when there are fewer, sheep are removed one at a time from the wool level most sheep have (the lower on a tie). All of this per tier.",
      "1 energy = 1 timber (forest), 1 wool (pasture) or 1 stone (mine); forest and mine never run out. Each day's take is whole (fractions carry over) and kept forever. Shorn wool comes off the fullest sheep first (the higher tier first), one sheep at a time. Children don't collect" + (crafts ? " or craft" : "") + ".",
      "Tiers: a skill's is ⌊(level + 1) ÷ 2⌋; forest and mine are 進階. The day's take of each has one average: wool (skill, sheep), timber (skill, forest), stone (skill, mine), skill weighted by work, sheep by the wool shorn off each. It fills lots of 100 in turn; a full lot's tier is draw(the average over its units).",
    ]);

    if (crafts) add("Crafts", "Craft", [
      "Women weave (紡織) 衣 clothes or 笠 hats (each 100 wool + 100 timber); men forge (鍛造) 刀 blades or 叉 hayforks (each 100 stone + 100 timber); each takes 200 energy of work at the house. One loom and one forge, one person each; a craft takes its materials up front and is worked until done, across days, by whoever holds the station.",
      "Next item: the station's item started fewest times (衣 before 笠, 刀 before 叉); the station waits until all its materials are in store.",
      "In use: each day everyone with energy (and the scholar), in village order, takes the best 衣 and 笠 left. Trying field work or collecting, someone without one today first takes the best 叉 or 刀 left, putting it back if they don't get the job. Best: the highest tier, the oldest on a tie; each is taken once a day. Wear, by energy spent: 衣 and 笠 all of their wearer's (lasts 10,000), 叉 farming and 刀 collecting with it (1,000); worn out, it's gone at the end of the day, before the day's new crafts come in.",
      "It takes each material lowest tier first (closing the filling lot early if the full ones fall short). Done: tier = draw(the average of three: its materials' average tier, and its crafters' skill tier and human tier (⌊Intelligence ÷ 10 − 7⌋ held to 1–4), these two averaged by work on it); then a roll on the tier dice keeps it with 100% / 75% / 50% / 25% (基本 / 中階 / 進階 / 稀有), else it's one tier lower.",
    ]);

    if (skills) add("Skills", "Resources", [
      "Nine skills, each with exp and a level (1–5), from 0 exp and level 1 (the born too): milking, farming (tending and harvest), woodcutting, weaving, forging, shearing, quarrying, teaching, poetry. Each energy spent on the job is 1 exp; a child's class earns none. Level L + 1 comes at <b>10,000 × L(L + 1) ÷ 2</b> exp, counted at the end of the day for the next.",
      "<b>Work = energy × (1 + 5% × (level − 1)" + (crafts ? " + their tool's bonus: 叉 farming, 刀 collecting, 50% / 100% / 150% / 200% for 基本 / 中階 / 進階 / 稀有 (as made)" : "") + ")</b>. Everything a job makes or needs is in work: shared jobs' need, done, reserved and open; milk, rice" + (crafts ? ", a craft's energy" : "") + ", timber, wool, stone; knowledge from teaching and poetry. Could still do, as work: the energy × that. A unit is min(10, e, reservation left" + (crafts ? " or craft left" : "") + " ÷ that) energy, credited × that. Hours go by energy.",
    ]);

    if (school) add("Scholar and school", "Education", [
      "With no scholar, each morning the adult with the highest Intelligence (first in village order on a tie) is appointed if the others could spare them: without them and the children, the grown-ups (elders first, then adults, each in village order), each doing what they could still do from the start of a day, can fully milk every adult cow (first those who may milk but not tend) and still have 4 who may tend with energy left (in priority order: if fields come first, the 4 and the day's tending, most energy first, come before the milking)." + (skills ? " Skills count, as work." : "") + " They serve until elder age or death, do no other work, and advise on food.",
      "Class is at the house, on while the scholar may teach and teaches first (Education above Poetry, or may not write), children may go, and the scholar has energy and hasn't gone in. A child going to class walks home, sits, and chooses again at 5½ or 12 (or when work opens up). A child sitting down calls a waiting or writing scholar at once (a poem cut short counts the energy spent so far).",
      "The scholar, choosing: no energy: wait (work opens up). Else a unit of min(10, e) at the house (if it can start: the 12 h rule), the first in priority of teaching (if they may and a seated child has energy) and a poem (if they may write); neither: wait.",
      "At the end of each teaching unit, each seated child (and a child leaving mid-unit) is credited for the time since the latest of sitting down, the unit's start and their last credit, at most e ÷ r: they spend that time × r and take home " + (skills ? "the scholar's teaching effectiveness × " : "") + "min(that time × the scholar's r, their energy spent) knowledge. Out of energy, a child leaves and chooses again; lunch and night end class.",
      "Every 1,000 knowledge (for life, fractions kept) is +1 Intelligence. Poetry: ⌊the day's poetry energy" + (skills ? " × poetry effectiveness" : "") + "⌋ knowledge to the scholar, every 10,000 +1 Intelligence, apart from what they learned as a child.",
    ]);

    if (at("food")) add("Whole numbers", "", [
      `Energy, food made${at("inheritance") ? " and attributes" : ""} round down; food from energy keeps its fraction in a running total. The day's food eaten rounds to the nearest unit.${school ? " Knowledge keeps its fractions." : ""}`,
    ]);

    if (at("food")) add("One day, in order", "", working ? [
      "Stored food ages; past its keeping time, it spoils." + (school ? " The scholar steps down at elder age or death; appointment (above)." : "") + " Day 1: tending restarts; day 181: the crop is ripe." + (resources ? " The sheep grow wool." : ""),
      "The day, person by person, with yesterday's adult cows" + (resources ? " and sheep" : "") + ". Then " + (skills ? "exp and levels; " : "") + (school ? "knowledge and poetry; " : "") + (resources ? "timber, wool (off the sheep), stone" + (crafts ? " and finished crafts" : "") + " into store; " : "") + "milk and rice into store; on day 270 the field's rice is lost.",
      "Rationing; everyone eats.",
      "Hunger, ageing and deaths, " + (happiness ? "happiness, couples, " : "") + "births" + (at("inheritance") ? "; newborns' attributes, and those coming of age get their bonus" : "") + ".",
    ] : [
      "Stored food ages and spoils; today's milk and rice go into store.",
      (is("food") ? "Rationing; everyone eats." : "Everyone eats.") + " Hunger, ageing and deaths, births.",
    ], { ordered: true });

    if (working) add("Macro mode", "", [
      "A quick copy of the rules above, worked out for the village as a whole; Micro mode compares the two. The grown-ups, in a new random order each day, each on their own clock (walking, lunch, carrying), spend as much as their day allows on the jobs in priority order: milking cow after cow (milk-only first), the 4 fields up to their daily limit each (most energy left first), the harvest until it has its work" + (crafts ? ", crafts (the station's last crafter first)" : "") + (resources ? ", collecting (each in their order, as in Micro)" : "") + "." + (crafts ? " Tools are taken as in Micro." : "") + " Children fill the food work left, most energy first, and keep the rest for class." + (school ? " Each child is taught for the hours they'd share with the scholar on average over wake-up times (a triangle over ±4 h)." : "") + (skills ? " Work is energy × effectiveness, as in Micro." : ""),
    ]);

    add("Simulation notes", "", [
      is("herd") ? "Runs last 1,000 days by default." : is("humans") ? "Runs last 10,000 days by default." : "Runs last 3,600 days (10 years of 360; day of year = ((day − 1) mod 360) + 1).",
      "Each page plays 20 seeded runs (mulberry32) and draws the first; a run survives if anyone is alive at the end." +
        (at("food") ? ` Separate dice for ${["the cows", resources && "the sheep", "the people", "the advisor", at("inheritance") && "the birth draws", working && "the day's waking", happiness && "the pairing", resources && "the tiers"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")}, so each policy faces the same luck; the identical runs also depend on the order dice are drawn, which only the code sets. Comparisons allow a billionth for rounding.` : ""),
      at("humans") && "A run stops past 2,000 people (counted as surviving). A death is hunger's if hunger took at least half a day off that life.",
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
