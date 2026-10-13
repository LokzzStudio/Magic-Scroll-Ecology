// Implementation details: every rule a page runs, tersely, for building the simulation into the game.
// Each page has <section class="card impl" data-page="..."> with a .rules-body inside; this fills it
// with the groups that page uses, then a footer of simulation notes (how the page runs, not game rules).
// Numbers are the defaults. Keep this in step with the models; worked examples belong in page hints.
(function () {
  const ORDER = ["herd", "humans", "food", "advisor", "production", "attribute", "inheritance", "education"];

  function groups(page) {
    const at = (name) => ORDER.indexOf(page) >= ORDER.indexOf(name);   // this page or a later one
    const is = (...names) => names.includes(page);
    const working = at("production"), energy = at("attribute"), school = is("education");
    const out = [];
    const add = (title, where, items, opts = {}) => out.push({ title, where, items, ...opts });

    if (!is("humans")) add("Cows", "Herd", [
      "Lifespan 360 days ± 15%, drawn evenly. Start: 11 cows, each at a random age below its lifespan." + (at("food") ? " Under 60 days, a calf: no milk, but it counts in N below." : " Under 60 days, a calf (a label only)."),
      "Each day, cows age and those at their lifespan die; then the herd changes by <b>r·N·(N/A − 1)·(1 − N/K)</b> (r 0.02, Allee threshold A 2, carrying capacity K 10): calves born, or random cows die if negative. Fractions are chances: 2.3 is 2, plus 1 at 30%.",
      at("food") && "Cows are never eaten; the village works with yesterday's count of adult cows.",
    ]);

    if (at("humans")) add("People", "Humans", [
      "Lifespan 3,600 days ± 10%, drawn evenly. Child under 360 days, adult from 360, elder from 2,880; adults and elders are grown-ups. Start: 5 men and 5 women, each at a random age from 360 up to their lifespan.",
      "Couples = min(adult men, adult women); elders have no children. Each couple has a child at 0.002 a day, boy or girl 50/50.",
      "Need: 10 food a day per grown-up, 5 per child. Everyone gets the same share = eaten ÷ need; a shortfall g = 1 − share costs everyone <b>3,600 × g³</b> days of life.",
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

    if (working) add("Work", "", energy ? [
      "Everyone spends their day's energy. Milking first: a cow's 10 milk takes 10 energy; people milk cow after cow, elders first, then adults, each in the order they joined the village. Adults put what's left into the rice; elders don't farm.",
      "Tending (days 1–180): the 4 fields go to the 4 adults with the most left (ties: who joined first); the rest idle, and a field uses at most 13.9 energy a day. Harvest (days 181–270): 25 rice per energy; adults, most left first, join with all they have left until they bring min(40, field ÷ 25) energy.",
      "Children fill what grown-ups leave undone (a cow not fully milked, an empty field, harvest energy still wanted, no more), most energy first" + (school ? "; leftover energy goes to class." : "."),
      "The crop is ripe on day 181: this year's tending energy × 2. Rice left after day 270 is lost.",
    ] : [
      "One job a day each: one milker per adult cow, elders first (10 milk each); adults left over tend the rice, up to 4, each a quarter of the full crop. Elders don't farm.",
      "Harvest (days 181–270): 250 rice per hand a day, with just enough hands to clear the field, at most 4. Rice left after day 270 is lost.",
    ]);

    if (energy) add("Power and Intelligence", "Attribute", [
      "Energy a day = <b>floor(min(Power, Intelligence) ÷ 10)</b>: Power is durability (耐力), Intelligence efficiency (效率, Intelligence ÷ 100 energy an hour, 10 hours at most).",
      is("attribute") ? "Everyone has 100 / 100; elders work at 80%." : "Starting grown-ups have 100 / 100; later ones inherit theirs. Elders work at 80%.",
    ]);

    if (at("inheritance")) add("Inheritance", "Inheritance", [
      "At birth, each attribute = <b>floor(0.7 × average of a random adult man and woman × (1 ± up to 10%))</b>, the variation drawn evenly and separately for each.",
      "Coming of age (360 days): +30 to both, and +1 Power per 20 extra food eaten as a child.",
      "Extra food: on days everyone ate their full need, food that would spoil overnight is shared evenly among the children (fractions kept), up to 5 each; it isn't need.",
    ]);

    if (school) add("Scholar and school", "Education", [
      "With no scholar, the village appoints its adult with the highest Intelligence only if it can spare them: without them and the children, the grown-ups must fully milk every adult cow and still have 4 adults with energy left for the 4 fields (as at tending time). Ties: who joined first. They serve until they become an elder or die.",
      "The scholar does no other work, advises on food, and works at Intelligence × 1.1, Power × 0.9.",
      "Each child learns until they or the scholar run out of energy; with S and K energy spent by then, the child takes home <b>floor(S × min(1, K ÷ S))</b> knowledge. Every 100 is +1 Intelligence for life.",
      "Once the last child leaves (or on a day with none), the scholar reads (讀書) with the energy left: 1 knowledge per energy, every 500 of it +1 Intelligence for life, counted apart from what they learned as a child.",
    ]);

    if (at("food")) add("Whole numbers", "", [
      `Energy, food made${at("inheritance") ? ", attributes and knowledge are" : " are"} rounded down; food from energy keeps its fraction in a running total (2.5 per energy: 2, 3, 2, 3, …). The food eaten each day rounds to the nearest unit.`,
    ]);

    if (at("food")) add("One day, in order", "", working ? [
      "Stored food ages; anything past its keeping time spoils.",
      "Day 1: tending restarts. Day 181: the crop is ripe." + (school ? " The scholar steps down at elder age or death; a new one is appointed if the village can spare them." : ""),
      "Work, for yesterday's adult cows" + (energy ? "; children fill gaps" : "") + (school ? "; the scholar teaches, then reads" : "") + ". Milk and rice go into store; on day 270 the field's rice is lost.",
      "The advisor sets the share; everyone eats" + (at("inheritance") ? "; children get spare food" : "") + ".",
      "Hunger, ageing and deaths, births" + (at("inheritance") ? "; newborns inherit, and those coming of age get their bonus" : "") + ".",
    ] : [
      "Stored food ages and spoils; today's milk and rice go into store.",
      (is("advisor") ? "The advisor sets the share; everyone eats." : "Everyone eats.") + " Hunger, ageing and deaths, births.",
    ], { ordered: true });

    add("Simulation notes", "", [
      is("herd") ? "Runs last 1,000 days by default." : is("humans") ? "Runs last 10,000 days by default." : "Runs last 3,600 days (10 years of 360; day of the year = ((day − 1) mod 360) + 1).",
      "Each page plays 20 runs and draws the first; a run survives if anyone is alive at the end. Dice are seeded (mulberry32)" +
        (at("food") ? `, with separate dice for the cows, the people${at("advisor") ? ", the advisor" : ""}${at("inheritance") ? " and the birth draws" : ""}, so each policy faces the same luck.` : "."),
      at("humans") && "A run stops early past 2,000 people (counted as surviving). A death counts as hunger's if hunger took at least half a day off that life.",
      at("food") && "These rules give the same model, but not the identical runs: those also depend on the order the dice are drawn in, which only the code sets.",
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
