// Implementation details: every rule a page runs, tersely, for building the simulation into the game.
// Each page has <section class="card impl" data-page="..."> with a .rules-body inside; this fills it
// with the groups that page uses, then a footer of simulation notes (how the page runs, not game rules).
// Numbers are the defaults. Keep this in step with the models: from the Production page on, these are
// Micro mode's rules (micro-model.js), complete enough to rebuild it; worked examples belong in page hints.
(function () {
  const ORDER = ["herd", "humans", "food", "advisor", "map", "production", "attribute", "inheritance", "education", "resources", "craft", "happiness"];

  function groups(page) {
    const at = (name) => ORDER.indexOf(page) >= ORDER.indexOf(name);   // this page or a later one
    const is = (...names) => names.includes(page);
    const working = at("production"), energy = at("attribute"), hands = working && !energy;
    const school = at("education"), resources = at("resources"), crafts = at("craft"), happiness = at("happiness");
    const out = [];
    const add = (title, where, items, opts = {}) => out.push({ title, where, items, ...opts });
    const walking = () => {
      add("Map and walking", "Map", [
        "A 16 × 16 grid of house, farm, pasture, forest and mine tiles. Each kind of place is worked at one tile: the one with the fewest steps (no diagonals) to any house; on a tie, the first scanning rows top to bottom, each left to right. Its distance is those steps. Walking takes 1 minute a tile: house ↔ place, its distance; place ↔ place, the steps between their two tiles.",
        "Everyone wakes between 4:00 and 8:00, as a Poisson process at λ = N ÷ 4 an hour for N people, held to the window: draw N + 1 exponential gaps g₀ … g<sub>N</sub>, put the people in a random order, and the k-th (from 0) wakes at 4 + 4 × (g₀ + … + g<sub>k</sub>) ÷ (g₀ + … + g<sub>N</sub>). That's the same as each person drawing an even time between 4 and 8. Times below are hours since that person woke.",
        "Everyone is out of the house for 12 hours. Breakfast first, by the house (24 min). From 5½ hours: anyone idle goes home at once; anyone working goes home as soon as the energy they're on is done (and carried home). Lunch is picked up at home and eaten by the house (24 min), then back out. From 12 hours: the same, for the night; they go in when they reach the house (anyone still working may get home late).",
        "Collecting (milking, harvest, timber, wool, stone) is carried home (搬運) after every 1 energy, and whatever's in hand at the end of the job: a walk home and back out each time. Tending, crafts and class carry nothing.",
        "Work is done a unit at a time, a unit being 1 energy, or less when the person or the job has less left, taking unit ÷ (Intelligence ÷ 100) hours. A unit started is always finished, so lunch and night wait for it; there's no other limit on hours. Anyone with nothing left to do waits by the house." + (resources ? " The forest (timber) and the mine (stone) are worked like any other place." : " Forest and mine are used on the Resources page."),
      ]);
      add("Meals and hunger", "Map", [
        "Breakfast and lunch are each half the day's share: on a full ration a grown-up gets 5 and 5, at 80% 4 and 4 (a child half). With share g (the day's food eaten ÷ need, at most 1), a meal keeps someone full for <b>f = g × 12 ÷ 2</b> hours: breakfast until f, and lunch, eaten from Lh (when they got home for it), until max(f, Lh) + f (what's left of breakfast carries over).",
        "Once someone is out of the house and empty, they lose <b>2k × t ÷ u²</b> days of life an hour, t hours into the hungry spell, where k = 10 (from the Humans page) and u = 12 ÷ their need (1.2 h for a grown-up, 2.4 for a child): a spell of s hours costs <b>k × (s ÷ u)²</b>. Spells: s₁ = max(0, Lh − f) before lunch, s₂ = max(0, E − (max(f, Lh) + f)) after it, E being when they went in for the night. Hunger doesn't count inside.",
        "Fullness = the food still in them as a share of a full day's: 50% after a full breakfast, falling 1 ÷ 12 an hour. At 20% or less (2.4 hours of food left) they're hungry (Micro mode shows it). They keep working while they have energy. Going in early: let o be when they were back at the house with no energy left (if they ever were). If o is before Lh and so is max(o, f − 2.4), they go in for the day then and skip lunch (s₂ = 0, s₁ up to then). Otherwise they go in at max(o, Lh + 24 min, max(f, Lh) + f − 2.4) if that's before E, and that's their E. Going in early changes nobody's work.",
        "Someone who never went home for lunch counts Lh = 5½; someone who never went in, E = 12.",
        "So a full breakfast lasts 6 hours: anyone home later than that for lunch, or out after 12 hours, goes hungry for that long. On 80% with lunch at 5½ hours, spells of 0.7 h and 1.7 h cost 10 × (0.7 ÷ 1.2)² + 10 × (1.7 ÷ 1.2)² ≈ 23 days, against 40 for eating 8 of 10 all at once.",
      ]);
    };
    if (is("map")) { walking(); return out; }

    if (!is("humans")) add("Cows", "Herd", [
      "Lifespan 360 days × (1 ± up to 15%), drawn evenly, at least 1 day. Start: 11 cows, each at age ⌊an even draw below its lifespan⌋." + (at("food") ? " Under 60 days, a calf: no milk, but it counts in N below." : " Under 60 days, a calf (a label only)."),
      "Each day, cows age a day and those at their lifespan die; then, with N the cows left, the herd changes by <b>r·N·(N/A − 1)·(1 − N/K)</b> (r 0.02, Allee threshold A 2, carrying capacity K 10). Fractions are chances: 2.3 is 2, plus 1 at 30%. Positive: that many newborn calves (age 0, their own lifespan), but never past 10 × K cows. Negative: that many cows, picked at random, die.",
      at("food") && "Cows are never eaten; the village works each day with the adult cows of the day before.",
    ]);

    if (at("humans")) add("People", "Humans", [
      "Lifespan 3,600 days × (1 ± up to 10%), drawn evenly, at least 1 day. Child under 360 days, adult from 360, elder from 2,880; adults and elders are grown-ups. Start: 5 men and 5 women, each at age min(lifespan − 1, 360 + ⌊an even draw below (lifespan − 360)⌋).",
      happiness
        ? "Couples = min(adult men, adult women), paired at random afresh every night: the adult men in a random order and the adult women in a random order, the first man with the first woman, and so on. Elders have no children. Each couple's chance of a child is set by the two partners' happiness (see Happiness); boy or girl 50/50."
        : "Couples = min(adult men, adult women); elders have no children. Each couple has a child at 0.002 a day, boy or girl 50/50.",
      "Need: 10 food a day per grown-up, 5 per child. Everyone gets the same share = eaten ÷ need" + (working ? "; the hunger toll follows each person's day (see Meals and hunger)." : "; each person then loses <b>10 × (their missing food)²</b> days of life (an adult eating 6 of 10: 10 × 4² = 160 days)."),
      "Hunger takes days off a person's lifespan; they die once their age reaches it.",
      is("humans") && "Each day: hunger, then ageing and deaths, then births. Food here is a fixed 200 a day, never stored.",
    ]);

    if (at("food")) add("Food", "Food", [
      "Milk and rice; one unit of either meets one unit of need. Food made on day d keeps until day d + keep (milk 1, rice 360). Start: 20,000 food in store that never spoils, so it's eaten last.",
      "Eat what spoils soonest first, milk on a tie.",
      "A standard day is 10 energy. 1 energy collects 1 milk (at most 10 per adult cow a day) or grows 2 rice when tending (at most 5,000 per field a year, 4 fields).",
      !working && "Nobody works: each adult cow gives 10 milk a day, and the year's crop (14,400) comes in evenly over days 181–210 while any adult lives.",
    ]);

    if (at("advisor")) add("Food advisor", "Advisor", [
      school ? "Off: everyone eats their full need. On: the scholar advises, with IQ = ⌊their Intelligence × 1.1⌋; with no scholar, everyone eats their full need."
        : "Off: everyone eats their full need. On: an advisor with IQ 120 rations.",
      "Everyone eats need × <b>share = min(1, supply ÷ (need × horizon) × e<sup>error</sup>)</b>, need being today's (before deaths). Horizon = 181 − day of the year before day 181; from day 181 on, 360 − day of the year + 181. Supply = milk, rice and starting food in store (with today's) + today's milk × (horizon − 1) + rice still to come: " +
        (working ? "on days 181–270, min(rice still in the field, (270 − day of the year) × today's field energy × 25); otherwise 0." : "on days 181–210, the remaining harvest days × the daily rice; otherwise 0."),
      `error = lean + (σ ÷ 2) × z, σ = max(0, (160 − IQ) ÷ 400), z a daily standard normal; lean = σ × z′, z′ a standard normal drawn once per ${school ? "scholar, when they first advise" : "village"}.`,
    ]);

    if (working) add("Jobs", "Jobs", [
      "Who may do what (the Jobs button): children milk" + (school ? " and go to class" : "") + "; men milk, tend and harvest" + (resources ? ", cut wood and quarry" : "") + (crafts ? ", and forge" : "") + "; women milk, tend and harvest" + (resources ? ", cut wood and shear" : "") + (crafts ? ", and weave" : "") + "; " + (school ? "scholars write poetry and teach; " : "") + "elders milk. Anyone may be given or barred any job; fire-making has no use yet." + (school ? " A scholar's row is by their sex." : ""),
      "Today's field work is tending on days 1–180 and harvest from day 181 on (from day 271 there's no rice left to bring in). <b>Milk-only</b>: a grown-up who may milk but not do today's field work (elders, by default).",
      energy ? "The day's jobs come in priority order (the Priority button): milking, fields, woodcutting, crafts (the loom, then the forge), then shearing or quarrying. Jobs a page doesn't have are skipped."
        : "The day's jobs come in order: milking, then the fields. One job a day each: once someone has taken a job, they take no other that day. Children don't work.",
    ]);

    if (working) add("What the work needs", "", energy ? [
      "Milking: the adult cows × 10 energy (a cow gives at most 10 milk; 1 milk per energy). Milk made = whole milk from all milking energy so far, less what earlier days made (fractions carry over).",
      "Fields while tending (days 1–180): 4 × 5,000 ÷ (180 × 2) ≈ 55.56 energy a day in all (kept exact), a field being full at about 13.89 a day. The crop, on day 181: ⌊this year's tending energy × 2⌋ rice in the field.",
      "Harvest (days 181–270): ⌈min(40, rice still in the field ÷ 25)⌉ energy, each bringing in 25 rice (at most what's in the field). Rice left after day 270 is lost.",
    ] : [
      "Every grown-up (elders too) has 10 energy at 1 an hour.",
      "Milking: the adult cows × 10 energy. Tending (days 1–180): 40 energy a day in all; the crop, on day 181: min(20,000, ⌊this year's tending energy × 2⌋) rice in the field. Harvest (days 181–270): 10 × min(4, ⌈rice still in the field ÷ 250⌉) energy, each bringing in 25 rice (at most what's in the field). Rice left after day 270 is lost.",
    ]);

    if (working) walking();

    if (working) add("The day, person by person", "", [
      "Everyone is in it: grown-ups, children" + (school ? " and the scholar" : "") + ", each with today's energy e and rate r (energy an hour)" + (energy ? "" : "; children have none") + ". People are in village order: the starting men, then the starting women, then everyone born, in order of birth (the dead drop out). Everyone starts at the house.",
      "Everything happens as events on one clock. Each person has at most one event waiting: giving them a new one cancels the one they had. Events run in time order; at the same moment, in the order they were given.",
      "Waking (at their time): breakfast by the house, 24 min, then they <b>choose</b>.",
      "<b>Choosing</b>, at t hours since waking: from t ≥ 12, they head home for the night, letting go of any job" + (school ? " (and class)" : "") + ". Before lunch, from t ≥ 5½, they head home for lunch, keeping their job" + (school ? " (but leaving class)" : "") + "." + (school ? " The scholar: see School." : "") + " Otherwise, if they have energy, up to 4 tries: let go of a job with nothing left for them; " + (energy ? "children choose food work or class (see The job board); " : "") + "grown-ups without a job look at the board; then go to their job" + (school ? " or class" : "") + " (below). Anyone with no job, no energy or no luck in 4 tries <b>waits</b>.",
      "<b>Waiting</b>: they let go of any job and walk home if they're out (choosing nothing on the way). At the house: if they have no energy left, this is when they were back with nothing left (o, in Meals and hunger), the first time only. They choose again at 5½ hours, or after lunch at 12 hours — or at once when work opens up (see The job board).",
      "<b>Going to their job</b>: if they're not at its place, they walk there straight from where they are, and choose again on arrival. There, the next unit = min(1, e, what the job lets them do); if that's 0, they let it go and try again. Otherwise they work the unit (unit ÷ r hours), and at its end it's done: credited to the job, taken off their energy.",
      "After a unit they choose again where they are, except after a unit of collecting (away from the house): they add it to what they carry, and with 1 or more carried, no energy left, or nothing more of that job for them, they walk home with it first, then choose again. Setting off for the house empties their load.",
      "Home for lunch: at the house (Lh = then) they eat by the house, 24 min, and then choose. Home for the night: at the house they go in (E = then) and are done for the day.",
      "<b>Could still do</b> at a place: the whole energy (at most ⌊e⌋) a person would get done by going there now and doing only that job for the rest of the day, in whole units, under the rules above: from where they are (someone walking counts as still where they set out from), carrying what they carry, starting now (or when their meal ends, for someone eating or not yet up); a unit only starts before 5½ hours if they haven't had lunch (otherwise home, lunch and back first) and before 12 hours; collecting goes home with every 1 energy carried and at the end.",
    ], { ordered: true });

    if (working) add("The job board", "", [
      "<b>Shared jobs</b>: milking, the fields" + (resources ? ", shearing (the wool on the sheep this morning; it needs ⌈that wool ÷ 1⌉ energy)" : "") + ". Each has today's need, the energy done, and the energy reserved; open = need − done − reserved. Taking one reserves min(open, what they could still do there, any cap below), if that's more than 0. What the job lets them do is their reservation left; when a grown-up's runs out, they reserve again the same way (children don't), and the job has nothing left for them if that's 0. Letting go returns what's unused.",
      resources && "<b>One at a time</b>: woodcutting, while timber in store this morning + today's cut is under 10 (it lets them do min(1, e)), " + (crafts ? "and the loom and the forge, while a craft is under way there or the materials for one of its items are in store (it lets them do min(1, e, what's left of the craft); with none under way, the next unit starts one, see Crafts). " : "") + "Taken only when nobody holds it, it has work, and they could still do 1 or more there; it has nothing left for them once it has no work. <b>Quarrying</b>: anyone, any time, taken if they could still do 1 or more at the mine; it lets them do min(1, e), and has nothing left for them once they couldn't still do 1.",
      "Grown-ups without a job take the first job, in priority order, that they may do and can get: <b>milking</b>, if any is open: anyone who may do today's field work and isn't milk-only takes at most the open milk less what the milk-only grown-ups with no job yet (awake or not) could still do at the pasture; milk-only grown-ups have no cap. <b>Fields</b>: no cap." + (resources ? " <b>Woodcutting.</b>" : "") + (crafts ? " <b>Crafts</b>: the loom, then the forge." : "") + (resources ? " Then <b>shearing or quarrying</b>: women try shearing first, men quarrying first, then the other." : ""),
      energy && "Children: they take food work, in priority order (milking, the fields), only if the grown-ups with no job yet (awake or not) who may do it couldn't cover what's open (the sum of what each could still do there); they take at most that gap" + (school ? ". Otherwise they go to class while it's on (see School), keeping their seat while no food work needs them." : "."),
      "<b>Work opens up</b> when someone lets go of a shared job with reserved energy unused while some is open" + (resources ? ", or of a one-at-a-time job that still has work" : "") + (school ? ", or when the scholar runs out of energy or goes in for the night" : "") + ": then everyone at the house with energy who is waiting" + (school ? " (or is a child in class)" : "") + " chooses again at once, in village order.",
    ].filter(Boolean));

    if (energy) add("Power and Intelligence", "Attribute", [
      "Energy a day = <b>⌊Power ÷ 10⌋</b>: Power is durability (耐力). Intelligence is efficiency (效率): Intelligence ÷ 100 energy an hour, for as long as the day allows. A standard worker spends 10 energy in 10 hours; one with 200 Power and 100 Intelligence has 20 energy but only about 11 hours.",
      (is("attribute") ? "Everyone has 100 / 100, the born too." : "Starting grown-ups have 100 / 100; later ones inherit theirs.") + " Elders work at 80% of both: energy ⌊0.8 × Power ÷ 10⌋, rate 0.8 × Intelligence ÷ 100." + (school ? " The scholar at 90% of Power and 110% of Intelligence." : ""),
    ]);

    if (at("inheritance")) add("Inheritance", "Inheritance", [
      "At birth, each attribute = <b>max(0, ⌊0.7 × average of a random adult man and woman × (1 ± up to 10%)⌋)</b>, the man and woman drawn once per newborn, the variation drawn evenly and separately for Power, then Intelligence. With no adult man or no adult woman: the Attribute page's 100 / 100.",
      "Coming of age (360 days): +30 to both; then the extra food eaten as a child buys Power one point at a time, the next point costing <b>15 + max(0, Power − 100)</b> food. What can't buy another point is lost.",
      "Extra food: on days the food eaten (rounded) is at least the need (rounded), up to 5 × children food that would spoil overnight (the last day of its keeping, milk first) is eaten by the children, shared evenly (fractions kept); it isn't need.",
    ]);

    if (resources) add("Sheep and resources", "Resources", [
      "Sheep: the cows' herd model exactly (same settings, their own dice), on the pasture; the village uses the adult sheep of the day before. Each sheep carries 0 to 10 wool. Each morning every sheep grows 1 wool back (up to 10); if there are more adult sheep than sheep counted, the new ones arrive with 10; if fewer, the missing ones are taken one at a time from the wool level held by the most sheep (the lower level on a tie, 0 included).",
      "1 energy cuts 1 timber (forest), shears 1 wool (pasture) or quarries 1 stone (mine); forest and mine never run out. Each day's take is whole: from all its energy so far, less earlier days' (fractions carry over). Stores start at 0 and never spoil; nothing uses timber yet, so it's only kept at 10.",
      "Shorn wool comes off the fullest sheep first: one sheep at a time gives all its wool, or what's left to take, keeping the rest.",
      crafts ? "Children don't collect or craft." : "Children don't collect.",
    ]);

    if (crafts) add("Crafts", "Craft", [
      "Women weave (紡織) 衣 clothes or 笠 hats, 100 wool each; men forge (鍛造) 刀 blades or 叉 hayforks, 100 stone each. Each takes 20 energy, at the house (no walking). Finished items pile up; nothing uses them yet.",
      "One loom and one forge, one person at each at a time. A craft takes its materials up front and is worked until done, over as many days as it takes, by whoever holds the station.",
      "Starting one: of its trade's items whose materials are in store, the one the village has started fewest of (衣 before 笠, 刀 before 叉 on a tie).",
    ]);

    if (happiness) add("Happiness", "Happiness", [
      "Everyone has a happiness from 0 to 10: a base of <b>10 − ⌊Intelligence ÷ 20⌋</b> (at least 0), plus 1 for every 1 energy they left unspent at the end of their last day (⌊energy left ÷ 1⌋, up to 10 in all). It changes at night: the day's energy left sets it in time for that night's births, and it stays through the next day. Intelligence 100: base 5; 80–99: 6; 200 or more: 0.",
      "Energy left unspent: what a person had left at the end of the day, after every job (and, for a child, class). A scholar who writes poetry spends all of theirs. On day 1, nobody has any until that night. The born start with none; their base comes from the Intelligence they're born with.",
      "Each person's own chance of a child a day = <b>0.002 × happiness ÷ 5</b> (0.002 is the Humans page's chance): 0 at happiness 0, 0.002 at 5, 0.004 at 10. A couple's chance is the average of the two partners'.",
    ]);

    if (school) add("Scholar and school", "Education", [
      "With no scholar, at the start of the day the village picks its adult with the highest Intelligence (the first in village order on a tie) and appoints them only if it can spare them: without them and the children, the grown-ups (elders first, then adults, each in village order) can fully milk every adult cow — first everyone milk-only, then everyone else who may milk, each milking as much as they could still do at the pasture from the start of a day, until the milk's done (milk-only here meaning may milk but not tend) — and still have 4 or more grown-ups who may tend with energy left. Milking and tending are taken in priority order: if the fields come first, those 4 are counted first, and then the day's tending (about 55.56 energy, most energy left first, each as much as they could still do at the farm) is spent before the milking. If not covered, there's no scholar that day. They serve until they become an elder or die.",
      "The scholar does no other work, advises on food, and works at Intelligence × 1.1, Power × 0.9 (see Power and Intelligence).",
      "School is at the house. Class is on while the scholar may teach, children may go to class, and the scholar has energy and hasn't gone in. A child going to class walks home if out, takes a seat, and chooses again at 5½ or 12 hours (or when work opens up). Seating a child calls the scholar at once if they're waiting or writing; a poem cut short counts the energy spent so far.",
      "The scholar, choosing: with no energy, they wait (and work opens up). Otherwise a unit of min(1, e) at the house: teaching if any seated child has energy, else a poem if they may write poetry (吟詩), else they wait.",
      "At the end of each teaching unit every seated child is credited, and a child leaving class during one is credited as they leave: for the time since they sat down, the unit began or they were last credited, whichever was latest, at most their energy ÷ their rate: they spend that time × their rate in energy, and take home 1 × min(that time × the scholar's rate, that energy) knowledge (the smaller of the two's energy spent), fractions kept. A child out of energy leaves class and chooses again. Lunch and night take children out of class.",
      "Knowledge adds up for life; every whole 100 is +1 Intelligence. Poetry: ⌊the day's poetry energy × 1⌋ knowledge, every 500 of it +1 Intelligence for life, counted apart from what they learned as a child.",
    ]);

    if (at("food")) add("Whole numbers", "", [
      `Energy, food made${at("inheritance") ? " and attributes are" : " are"} rounded down; food from energy keeps its fraction in a running total (2.5 per energy: 2, 3, 2, 3, …). The food eaten each day rounds to the nearest unit.${school ? " Knowledge keeps its fractions; Intelligence goes up at each whole 100." : ""}`,
    ]);

    if (at("food")) add("One day, in order", "", working ? [
      "Stored food ages; anything past its keeping time spoils.",
      (school ? "The scholar steps down at elder age or death; with none, one is appointed if the village can spare them. " : "") + "Day 1: tending restarts. Day 181: the crop is ripe.",
      (resources ? "The sheep grow their wool. " : "") + "The day, person by person, for yesterday's adult cows" + (resources ? " and sheep" : "") + ". Then " + (school ? "the children's knowledge and the scholar's poetry are counted; " : "") + (resources ? "the day's timber, wool and stone go into store (wool off the sheep)" + (crafts ? ", finished crafts too" : "") + "; " : "") + "milk and rice go into store; on day 270 the field's rice is lost.",
      "The advisor sets the share; everyone eats" + (at("inheritance") ? "; children get spare food" : "") + ".",
      "Hunger (each person's day), ageing and deaths, " + (happiness ? "happiness from the day's energy left, the night's random couples, births (each couple at its own chance)" : "births") + (at("inheritance") ? "; newborns inherit, and those coming of age get their bonus" : "") + ".",
    ] : [
      "Stored food ages and spoils; today's milk and rice go into store.",
      (is("advisor") ? "The advisor sets the share; everyone eats." : "Everyone eats.") + " Hunger, ageing and deaths, births.",
    ], { ordered: true });

    if (working) add("Macro mode", "", [
      "The other mode works each day out for the village as a whole, as a quick copy of the rules above; Micro mode shows how close it comes. It doesn't change the rules.",
      energy
        ? "The grown-ups go through the day's jobs one after another, in a new random order each day, each with their own day's clock (walking, lunch, carrying, the end of the day) and spending as much as it allows: milking cow after cow, first the milk-only grown-ups, then the rest; tending the 4 fields, up to 13.9 energy each a day, from whoever has most energy left, one after another; at harvest, most left first, until the rice has its work. Children fill what's left of the food work, most energy first, and keep the rest for class."
        : "One job a day each: one milker per adult cow, milk-only first; those left who may farm tend the rice, up to 4; anyone idle covers what's undone.",
      resources && "Resources: woodcutting goes to the first who may" + (crafts ? ", preferring anyone not in the middle of a craft" : "") + ", then shearing and quarrying, each as far as their day allows." + (crafts ? " Crafts: by the station's last crafter if they have energy left, otherwise the first who may." : ""),
      school && "School: each child is taught for the hours they'd share with the scholar on average over the difference in their wake-up times (a triangle over ±4 hours).",
    ]);

    add("Simulation notes", "", [
      is("herd") ? "Runs last 1,000 days by default." : is("humans") ? "Runs last 10,000 days by default." : "Runs last 3,600 days (10 years of 360; day of the year = ((day − 1) mod 360) + 1).",
      "Each page plays 20 runs and draws the first; a run survives if anyone is alive at the end. Dice are seeded (mulberry32)" +
        (at("food") ? `, with separate dice for ${["the cows", resources && "the sheep", "the people", at("advisor") && "the advisor", at("inheritance") && "the birth draws", working && "the day's waking", happiness && "the pairing of couples"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")}, so each policy faces the same luck.` : "."),
      at("humans") && "A run stops early past 2,000 people (counted as surviving). A death counts as hunger's if hunger took at least half a day off that life.",
      at("food") && "These rules give the same model, but not the identical runs: those also depend on the order the dice are drawn in, which only the code sets. Comparisons of numbers allow for rounding: anything within a billionth counts as equal.",
      working && "Two modes (the switch at the top): Micro plays the day person by person, as above; it's the game's rules. Macro is the quick copy (see Macro mode), and Micro mode shows both side by side. Micro is slow, so pages open in Macro and Micro runs only when picked; rolling new runs or changing a setting goes back to Macro.",
      "Lifespans are at least 1 day." + (!is("humans") ? " Births stop at 10 × K cows." : "") + (at("food") ? " The cows carry on after the people are gone." : ""),
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
