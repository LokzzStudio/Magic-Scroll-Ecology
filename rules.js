// Implementation details: every rule a page runs, tersely, for building the simulation into the game.
// Each page has <section class="card impl" data-page="..."> with a .rules-body inside; this fills it
// with the groups that page uses, then a footer of simulation notes (how the page runs, not game rules).
// Numbers are the defaults. Keep this in step with the models; worked examples belong in page hints.
(function () {
  const ORDER = ["herd", "humans", "food", "advisor", "map", "production", "attribute", "inheritance", "education", "resources", "craft", "happiness"];

  function groups(page) {
    const at = (name) => ORDER.indexOf(page) >= ORDER.indexOf(name);   // this page or a later one
    const is = (...names) => names.includes(page);
    const working = at("production"), energy = at("attribute"), school = at("education"), resources = at("resources"), crafts = at("craft"), happiness = at("happiness");
    const out = [];
    const add = (title, where, items, opts = {}) => out.push({ title, where, items, ...opts });
    const walking = () => {
      add("Map and walking", "Map", [
        "A 16 × 16 grid of house, farm, pasture, forest and mine tiles. A place's distance = steps (no diagonals) from the nearest house to its nearest tile; walking there takes distance × 1 minute. From one place straight to another: the steps between their nearest tiles.",
        "Everyone wakes between 4:00 and 8:00, as a Poisson process at λ = N ÷ 4 an hour for N people, held to the window (N + 1 exponential gaps, scaled to 4 hours, in a random order). That's the same as each person drawing an even time between 4 and 8.",
        "From waking, everyone is out of the house for 12 hours. Breakfast first, by the house (24 min). From 5½ hours: anyone idle goes home at once; anyone working goes home as soon as the energy they're on is done (and carried home). Lunch is picked up at home and eaten by the house (24 min), then back out. At 12 hours: the same, for the night (anyone still working may get home late).",
        "Collecting (milking, harvest, timber, wool, stone) is carried home (搬運) after every 1 energy, and whatever's in hand at the end of the job: a walk home and back out each time. Tending, crafts and class carry nothing.",
        "Work takes 1 ÷ (Intelligence ÷ 100) hours per energy, a whole energy at a time, for as long as the day allows: there's no other limit on hours. Anyone with nothing left to do waits by the house." + (resources ? " The forest (timber) and the mine (stone) are worked like any other place." : " Forest and mine are used on the Resources page."),
      ]);
      add("Meals and hunger", "Map", [
        "Breakfast and lunch are each half the day's ration: on a full ration a grown-up gets 5 and 5, at 80% 4 and 4 (a child half). A meal keeps them full for share × 12 ÷ 2 hours (one food lasts u = 12 ÷ 10 = 1.2 hours); what's left of breakfast carries over into lunch.",
        "Once someone is out of the house and empty, they lose <b>2k × t ÷ u²</b> days of life an hour, t hours into the hungry spell (k = 10 from the Humans page): a spell of s hours costs <b>k × (s ÷ u)²</b>. It ends when they eat or go into the house; hunger doesn't count inside.",
        "Fullness = the food still in them as a share of a full day's: 50% after a full breakfast, falling 1 ÷ 12 an hour. At 20% or less they're hungry (Micro mode shows it). They keep working while they have energy; once they have none left and are back at the house, they may go in early, whatever the hour.",
        "So a full breakfast lasts 6 hours: anyone home later than that for lunch, or out after 12 hours, goes hungry for that long. On 80% with lunch at 5½ hours, spells of 0.7 h and 1.7 h cost 10 × (0.7 ÷ 1.2)² + 10 × (1.7 ÷ 1.2)² ≈ 23 days, against 40 for eating 8 of 10 all at once.",
      ]);
    };
    if (is("map")) { walking(); return out; }

    if (!is("humans")) add("Cows", "Herd", [
      "Lifespan 360 days ± 15%, drawn evenly. Start: 11 cows, each at a random age below its lifespan." + (at("food") ? " Under 60 days, a calf: no milk, but it counts in N below." : " Under 60 days, a calf (a label only)."),
      "Each day, cows age and those at their lifespan die; then the herd changes by <b>r·N·(N/A − 1)·(1 − N/K)</b> (r 0.02, Allee threshold A 2, carrying capacity K 10): calves born, or random cows die if negative. Fractions are chances: 2.3 is 2, plus 1 at 30%.",
      at("food") && "Cows are never eaten; the village works with yesterday's count of adult cows.",
    ]);

    if (at("humans")) add("People", "Humans", [
      "Lifespan 3,600 days ± 10%, drawn evenly. Child under 360 days, adult from 360, elder from 2,880; adults and elders are grown-ups. Start: 5 men and 5 women, each at a random age from 360 up to their lifespan.",
      happiness
        ? "Couples = min(adult men, adult women), paired at random afresh every day; elders have no children. Each couple's chance of a child is set by the two partners' happiness (see Happiness); boy or girl 50/50."
        : "Couples = min(adult men, adult women); elders have no children. Each couple has a child at 0.002 a day, boy or girl 50/50.",
      "Need: 10 food a day per grown-up, 5 per child. Everyone gets the same share = eaten ÷ need" + (working ? "; the hunger toll follows each person's day (see Meals and hunger)." : "; each person then loses <b>10 × (their missing food)²</b> days of life (an adult eating 6 of 10: 10 × 4² = 160 days)."),
      is("humans") && "Each day: hunger, then ageing and deaths, then births. Food here is a fixed 200 a day, never stored.",
    ]);

    if (at("food")) add("Food", "Food", [
      "Milk and rice; one unit of either meets one unit of need. Food made on day d keeps until day d + keep (milk 1, rice 360). Start: 20,000 food in store that never spoils, so it's eaten last.",
      "Eat what spoils soonest first, milk on a tie.",
      "A standard day is 10 energy. 1 energy collects 1 milk (at most 10 per adult cow a day) or grows 2 rice when tending (at most 5,000 per field a year, 4 fields).",
      !working && "Nobody works: each adult cow gives 10 milk a day, and the year's crop (14,400) comes in evenly over days 181–210 while any adult lives.",
    ]);

    if (at("advisor")) add("Food advisor", "Advisor", [
      school ? "Off: everyone eats their full need. On: the scholar advises, with IQ = their Intelligence × 1.1, rounded down; with no scholar, everyone eats their full need."
        : "Off: everyone eats their full need. On: an advisor with IQ 120 rations.",
      "Everyone eats need × <b>share = min(1, supply ÷ (need × horizon) × e<sup>error</sup>)</b>. Horizon = days until day 181 (from day 181 on, until next year's); supply = store + today's milk × (horizon − 1) + rice still to come " +
        (working ? "(at most the field, at today's harvest pace)." : "(remaining harvest days × the daily rice)."),
      `error = lean + (σ ÷ 2) × z, σ = max(0, (160 − IQ) ÷ 400), z a daily standard normal; lean = σ × z′, z′ drawn once per ${school ? "scholar" : "village"}.`,
    ]);

    if (working) add("Jobs", "Jobs", [
      "Children milk" + (school ? " and go to class" : "") + "; men and women milk, tend and harvest; " + (school ? "scholars write poetry and teach; " : "") + "elders milk. Anyone may be given or barred any job.",
      (energy ? "The day's jobs take energy in priority order (the Priority button): milking, fields" + (resources ? ", woodcutting while timber is under 10" + (crafts ? ", crafts" : "") + ", then shearing or quarrying" : "") + "; children fill food work left undone after all of them. " : "") +
      "Milking goes first to those who may milk but not do the day's field work. " + (crafts ? "Men and women may cut wood, women shear and weave, men quarry and forge; fire-making has no use yet." : resources ? "Men and women may cut wood, women shear, men quarry; weaving and forging are used on the Craft page, fire-making has no use yet." : "Woodcutting, shearing and quarrying are used on the Resources page, weaving and forging on the Craft page; fire-making has no use yet."),
    ]);

    if (working) add("Work", "", energy ? [
      "Everyone spends their day's energy, each as far as their own day allows (walking, lunch, the end of the day). Milking first: a cow's 10 milk takes 10 energy; people milk cow after cow, elders first, then adults. Adults put what's left into the rice; elders don't farm. Grown-ups come to the jobs in the order they wake: a new random order each day.",
      "Tending (days 1–180): each of the 4 fields takes up to 13.9 energy a day, from whoever has energy left, most first, one after another. Harvest (days 181–270): 25 rice per energy; adults, most left first, join until they bring min(40, field ÷ 25) energy.",
      "Children fill what grown-ups leave undone in the jobs they may do (by default only milking: a cow not fully milked), most energy first" + (school ? "; leftover energy goes to class." : "."),
      "The crop is ripe on day 181: this year's tending energy × 2. Rice left after day 270 is lost.",
    ] : [
      "One job a day each: one milker per adult cow, elders first (10 milk each); adults left over tend the rice, up to 4, each a quarter of the full crop. Elders don't farm.",
      "Harvest (days 181–270): 250 rice per hand a day, with just enough hands to clear the field, at most 4. Rice left after day 270 is lost.",
    ]);

    if (working) walking();

    if (energy) add("Power and Intelligence", "Attribute", [
      "Energy a day = <b>floor(Power ÷ 10)</b>: Power is durability (耐力). Intelligence is efficiency (效率): Intelligence ÷ 100 energy an hour, for as long as the day allows. A standard worker spends 10 energy in 10 hours; one with 200 Power and 100 Intelligence has 20 energy but only about 11 hours.",
      is("attribute") ? "Everyone has 100 / 100; elders work at 80%." : "Starting grown-ups have 100 / 100; later ones inherit theirs. Elders work at 80%.",
    ]);

    if (at("inheritance")) add("Inheritance", "Inheritance", [
      "At birth, each attribute = <b>floor(0.7 × average of a random adult man and woman × (1 ± up to 10%))</b>, the variation drawn evenly and separately for each.",
      "Coming of age (360 days): +30 to both; then the extra food eaten as a child buys Power one point at a time, the next point costing <b>15 + max(0, Power − 100)</b> food. What can't buy another point is lost.",
      "Extra food: on days everyone ate their full need, food that would spoil overnight is shared evenly among the children (fractions kept), up to 5 each; it isn't need.",
    ]);

    if (resources) add("Sheep and resources", "Resources", [
      "Sheep: the cows' herd model exactly (same settings, their own dice), on the pasture. Each sheep carries up to 10 wool and grows 1 a day back, shorn or part-shorn; sheep come of age full. Shearers take the fullest sheep first.",
      "1 energy cuts 1 timber (forest), shears 1 wool or quarries 1 stone (mine); forest and mine never run out. Stores start at 0 and never spoil.",
      "Only energy left after every food job is filled goes to resources. Children don't collect.",
      "Woodcutting: while timber in store (with today's) is under 10, the first idle grown-up who may cuts what's short, as far as their day allows" + (crafts ? ", preferring anyone not in the middle of a craft" : "") + ". Shearing and quarrying: each grown-up with energy left goes until their energy or the day runs out; women shear first, men quarry first, or take the other if theirs isn't possible (no wool left on the sheep, or barred by the jobs table).",
    ]);

    if (crafts) add("Crafts", "Craft", [
      "Women weave (紡織) 衣 clothes or 笠 hats, 100 wool each; men forge (鍛造) 刀 blades or 叉 hayforks, 100 stone each. Each takes 20 energy, at the house (no walking). Finished items pile up; nothing uses them yet.",
      "One loom and one forge, one person at each at a time. A craft takes its materials up front and is worked until done, over as many days as it takes, by its crafter if they have energy left, otherwise by the first idle grown-up who may; when they run out, the next who may takes over.",
      "With nothing under way, a station starts the item of its trade the village has started fewest of (衣 before 笠, 刀 before 叉 on a tie), if the materials are in store.",
    ]);

    if (happiness) add("Happiness", "Happiness", [
      "Everyone has a happiness from 0 to 10: a base of <b>10 − ⌊Intelligence ÷ 20⌋</b> (at least 0), plus 1 for every 1 energy they left unspent at the end of their last day (up to 10 in all). It changes at night: the day's energy left sets it in time for that night's births, and it stays through the next day. Intelligence 100: base 5; 80–99: 6; 200 or more: 0.",
      "Energy left unspent: what a person had left at the end of the day, after every job (and, for a child, class). A scholar who writes poetry spends all of theirs. On day 1, nobody has any until that night.",
      "Each person's own chance of a child a day = <b>0.002 × happiness ÷ 5</b> (0.002 is the Humans page's chance): 0 at happiness 0, 0.002 at 5, 0.004 at 10. A couple's chance is the average of the two partners'.",
    ]);

    if (school) add("Scholar and school", "Education", [
      "With no scholar, the village appoints its adult with the highest Intelligence only if it can spare them: without them and the children, the grown-ups must fully milk every adult cow and still have 4 adults with energy left for the 4 fields (as at tending time). Ties: who joined first. They serve until they become an elder or die.",
      "The scholar does no other work, advises on food, and works at Intelligence × 1.1, Power × 0.9.",
      "School is at the house. The scholar works through their day, teaching whenever a child is in class and writing poetry (吟詩) otherwise. A child is in class once their food work is done, except at lunch, and spends energy only while the scholar teaches. Over the hours both are there, the child takes home <b>min(scholar's, child's energy an hour) × hours</b> knowledge: the smaller of the two's energy spent, fractions kept. Every 100 is +1 Intelligence for life.",
      "Each person keeps their own clock, so a child who wakes after the scholar misses the start, and each one's lunch breaks the lesson. In Macro mode, the hours a child shares with the scholar are the average over the difference in their wake-up times (a triangle over ±4 hours).",
      "Poetry: 1 knowledge per energy the scholar doesn't spend teaching, every 500 of it +1 Intelligence for life, counted apart from what they learned as a child.",
    ]);

    if (at("food")) add("Whole numbers", "", [
      `Energy, food made${at("inheritance") ? " and attributes are" : " are"} rounded down; food from energy keeps its fraction in a running total (2.5 per energy: 2, 3, 2, 3, …). The food eaten each day rounds to the nearest unit.${school ? " Knowledge keeps its fractions; Intelligence goes up at each whole 100." : ""}`,
    ]);

    if (at("food")) add("One day, in order", "", working ? [
      "Stored food ages; anything past its keeping time spoils.",
      "Day 1: tending restarts. Day 181: the crop is ripe." + (school ? " The scholar steps down at elder age or death; a new one is appointed if the village can spare them." : ""),
      "Work, for yesterday's adult cows" + (energy ? "; children fill gaps" : "") + (school ? "; the scholar teaches, then writes poetry" : "") + (crafts ? "; idle grown-ups craft, then" : "") + (resources ? (crafts ? " cut wood, shear and quarry" : "; idle grown-ups cut wood, shear and quarry") : "") + ". Milk and rice go into store; on day 270 the field's rice is lost.",
      "The advisor sets the share; everyone eats" + (at("inheritance") ? "; children get spare food" : "") + ".",
      "Hunger, ageing and deaths, " + (happiness ? "happiness from the day's energy left, the day's random couples, births (each couple at its own chance)" : "births") + (at("inheritance") ? "; newborns inherit, and those coming of age get their bonus" : "") + "." + "",
    ] : [
      "Stored food ages and spoils; today's milk and rice go into store.",
      (is("advisor") ? "The advisor sets the share; everyone eats." : "Everyone eats.") + " Hunger, ageing and deaths, births.",
    ], { ordered: true });

    add("Simulation notes", "", [
      is("herd") ? "Runs last 1,000 days by default." : is("humans") ? "Runs last 10,000 days by default." : "Runs last 3,600 days (10 years of 360; day of the year = ((day − 1) mod 360) + 1).",
      "Each page plays 20 runs and draws the first; a run survives if anyone is alive at the end. Dice are seeded (mulberry32)" +
        (at("food") ? `, with separate dice for the cows, ${resources ? "the sheep, " : ""}the people${at("advisor") ? ", the advisor" : ""}${at("inheritance") ? " and the birth draws" : ""}${happiness ? ", and the pairing of couples" : ""}, so each policy faces the same luck.` : "."),
      at("humans") && "A run stops early past 2,000 people (counted as surviving). A death counts as hunger's if hunger took at least half a day off that life.",
      at("food") && "These rules give the same model, but not the identical runs: those also depend on the order the dice are drawn in, which only the code sets.",
      working && "Two modes (the switch at the top): Macro works each day out for the village as a whole, which is quick; Micro plays it person by person on their own clocks, with a job board in priority order (taking a job reserves the energy that person can give it today). Micro is the game's rules; Macro copies what they do on average, and Micro mode shows both side by side. Micro is slow, so pages open in Macro and Micro runs only when picked; rolling new runs or changing a setting goes back to Macro.",
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
