// Implementation details for the Magic Scroll ecology pages: every rule a page runs, in plain words,
// for building the simulation into the game. Each page has a <section class="card impl" data-page="…">
// with a .rules-body inside; this fills it with the groups of rules that page uses, then a short
// footer of simulation notes (how the page runs, not rules of the game).
// Numbers are the defaults. Keep this in step with the models when a rule changes; worked examples
// belong in the page hints, not here.
(function () {
  const ORDER = ["herd", "humans", "food", "advisor", "production", "attribute", "inheritance", "education"];

  function groups(page) {
    const at = (name) => ORDER.indexOf(page) >= ORDER.indexOf(name);   // this page or a later one
    const is = (...names) => names.includes(page);
    const working = at("production");   // people do the work from the Production page on
    const out = [];

    // ---------- Time ----------
    if (at("food")) out.push({
      title: "Time",
      items: ["A year is 360 days. Day of the year = ((day − 1) mod 360) + 1."],
    });

    // ---------- Cows ----------
    if (!is("humans")) out.push({
      title: "Cows", where: "Herd",
      items: [
        "Each cow has an age in days and a lifespan of 360 days ± 15%, drawn evenly. Start: 11 cows at random ages.",
        at("food") ? "Cows under 60 days are calves; only adult cows give milk." : "Cows under 60 days are calves (only a label).",
        "Each day, every cow ages a day and any that reach their lifespan die. Then, with N cows left, the herd changes by <b>r·N·(N/A − 1)·(1 − N/K)</b> (r = 0.02, Allee threshold A = 2, carrying capacity K = 10): that many calves are born, or below zero, that many cows picked at random die. A fraction is a chance of one more: 2.3 is 2, plus 1 with a 30% chance.",
        at("food") && "Nobody eats the cows. The village works with yesterday's count of adult cows.",
      ],
    });

    // ---------- People ----------
    if (at("humans")) out.push({
      title: "People", where: "Humans",
      items: [
        "Each person has a sex, an age in days and a lifespan of 3,600 days ± 10%, drawn evenly.",
        "Children are under 360 days, adults 360 and over, elders 3,240 and over. Adults and elders are grown-ups.",
        "Start: 5 men and 5 women, all grown-up, at random ages up to their lifespan.",
        "Couples = the smaller of grown men and grown women. Each couple has a child with a 0.002 chance a day, a boy or girl 50/50.",
        "Food needed a day: 8 per grown-up, 4 per child. Everyone gets the same share of their need: food eaten ÷ food needed.",
        "Hunger: with a shortfall g = 1 − share, everyone loses <b>3,600 × g³</b> days of lifespan that day.",
        is("humans") && "Each day, in order: hunger shortens lifespans; everyone ages a day and anyone who reaches their lifespan dies; then each couple rolls for a child.",
        is("humans") && "On this page the food is fixed at 200 a day and never stored.",
      ],
    });

    // ---------- Food ----------
    if (at("food")) out.push({
      title: "Food", where: "Food",
      items: [
        "Two foods, milk and rice. One unit of either meets one unit of need.",
        "Food made on day d can be eaten until day d + keep, then spoils: milk keeps 1 day, rice 360. The village starts with 20,000 rice, counted as made on day 0.",
        "Eating takes the food that spoils soonest first, milk first on a tie. If there isn't enough, they eat what there is.",
        "A standard working day is 10 energy. 1 energy collects 1 milk, or grows 2 rice when tending, so a full crop is 4 people × 180 days × 10 energy × 2 = 14,400 rice.",
      ],
    });

    // ---------- Food with nobody working ----------
    if (is("food", "advisor")) out.push({
      title: "Food with nobody working",
      items: [
        "Each adult cow gives a standard day's milk: 10 a day.",
        "The full crop comes in evenly over days 181–210, on days with at least one adult alive.",
      ],
    });

    // ---------- Food advisor ----------
    if (at("advisor")) out.push({
      title: "Food advisor", where: "Advisor",
      items: [
        "Off: everyone eats their full need while the food lasts.",
        is("education") ? "On (the default): the scholar advises, with their Intelligence at work as IQ. With no scholar, nobody rations."
          : "On (the default): an advisor with IQ 120 rations the food.",
        "Each day, once today's food is in store, everyone eats need × share, with <b>share = min(100%, supply ÷ (need × horizon) × e<sup>error</sup>)</b>. Horizon = days until the next harvest starts. Supply = food in store + today's milk × (horizon − 1) + rice still to come this harvest.",
        working ? "Rice still to come = the smaller of the rice in the field and the remaining harvest days × what today's rice workers bring in a day."
          : "Rice still to come = the remaining harvest days × the daily rice, if any adult is alive.",
        `Error = lean + (σ ÷ 2) × z, with σ = max(0, (160 − IQ) ÷ 400) and z a fresh standard normal each day. The lean = σ × z is drawn once per ${is("education") ? "scholar" : "village"}.`,
      ],
    });

    // ---------- Work ----------
    if (working) out.push({
      title: "Work",
      items: [
        "Each grown-up does one job a day, or none. Children don't work; elders can milk but not farm.",
        is("production") ? "Milking first: one milker per adult cow, elders before adults. A milker spends a standard day, 10 energy, so collects 10 milk."
          : "Milking first: one milker per adult cow, elders before adults. A milker collects their day's energy × milk effectiveness.",
        is("production") ? "Adults left over go to the rice. Tending, days 1–180: up to 4 hands of 10 energy each; more doesn't help."
          : "Adults left over go to the rice. Tending, days 1–180: adults are added until it has 40 energy; at most 40 a day counts.",
        "On day 181 the crop is ripe: this year's tending energy × rice effectiveness.",
        is("production") ? "Harvest, days 181–270: 250 rice per hand a day (25 per energy) until the field is bare, with just enough hands to clear it, at most 4. Rice left after day 270 is lost."
          : "Harvest, days 181–270: 25 rice per energy until the field is bare; adults are added until they bring min(40, field ÷ 25) energy. Rice left after day 270 is lost.",
      ],
    });

    // ---------- Power and Intelligence ----------
    if (at("attribute")) out.push({
      title: "Power and Intelligence", where: "Attribute",
      items: [
        is("attribute") ? "Everyone has Power (力量) and Intelligence (智力): 120 each."
          : "The starting grown-ups have Power (力量) and Intelligence (智力) of 120 each; everyone born later inherits theirs.",
        "Power is durability (耐力): Power ÷ 10 energy a day. Intelligence is efficiency (效率): Intelligence ÷ 100 energy an hour, for at most 10 hours. A day's energy is the smaller, rounded down: <b>floor(min(Power, Intelligence) ÷ 10)</b>. With 0 energy, no job.",
        "Elders work with 90% of both.",
      ],
    });

    // ---------- Inheritance ----------
    if (at("inheritance")) out.push({
      title: "Inheritance", where: "Inheritance",
      items: [
        "A newborn's parents are a grown man and a grown woman drawn at random. Each attribute = <b>floor(0.7 × their average × (1 + v))</b>, with v drawn evenly from −10% to +10%, separately for Power and Intelligence. Parents pass on their full values, not the elder 90%.",
        "On coming of age (360 days), both attributes go up by 30, and Power by 1 more for every 20 extra food eaten as a child, rounded down.",
        "Extra food: on days everyone ate their full need, food that would spoil overnight goes to the children, split evenly, up to 8 each. It doesn't count toward need.",
      ],
    });

    // ---------- Scholar and school ----------
    if (is("education")) out.push({
      title: "Scholar and school", where: "Education",
      items: [
        "The village picks its adult with the highest Intelligence as Scholar (文人), first in line on a tie, for life. When the scholar dies, it picks again the next day.",
        "The scholar does no other work, and is the food advisor. In the job, they work with Intelligence × 1.1 and Power × 0.9 (not passed on).",
        "Every child comes to class. The scholar and each child start together, and each stops when their energy runs out. Over the time both are there, with the scholar spending S energy and the child K (whole, rounded down), the child takes home <b>floor(S × 1 × min(1, K ÷ S))</b> knowledge, 1 being the knowledge effectiveness.",
        "Every 100 knowledge is +1 Intelligence for life.",
      ],
    });

    // ---------- Whole numbers ----------
    if (at("food")) out.push({
      title: "Whole numbers",
      items: [
        `Everything countable is whole, rounded down: food made${at("attribute") ? ", energy" : ""}${at("inheritance") ? ", attributes" : ""}${is("education") ? ", knowledge" : ""}. Food made from energy keeps its fraction in a running total (at 2.5 milk per energy: 2, 3, 2, 3, …); ${working ? "a year's rice crop doesn't" : "the harvest days add up to exactly the full crop"}.`,
        at("advisor") ? "The food eaten each day (need × share) is rounded to the nearest unit." : "The food eaten each day is rounded to the nearest unit.",
      ],
    });

    // ---------- One day, in order ----------
    if (at("food")) out.push({
      title: "One day, in order", ordered: true,
      items: working ? [
        "Stored food ages a day; anything past its keeping time spoils.",
        "On day 1 of the year, tending starts from zero; on day 181, the crop is ripe.",
        is("education") && "If there's no scholar, one is picked.",
        "Jobs are handed out, for yesterday's count of adult cows." + (is("education") ? " The scholar teaches." : ""),
        "Milk and harvested rice go into store. On day 270, rice left in the field is lost.",
        "The advisor sets the share, and the village eats." + (at("inheritance") ? " Children get any spare food." : ""),
        "People: hunger, then ageing and deaths, then births." + (at("inheritance") ? " Newborns get their attributes; anyone who came of age gets their bonus." : ""),
      ] : [
        "Stored food ages a day; anything past its keeping time spoils.",
        "Today's food goes into store: milk from yesterday's adult cows, and rice on harvest days.",
        is("advisor") ? "The advisor sets the share, and the village eats." : "The village eats.",
        "People: hunger, then ageing and deaths, then births.",
      ],
    });

    // ---------- Simulation notes: how the page runs, not rules of the game ----------
    out.push({
      title: "Simulation notes", note: true,
      items: [
        is("herd") ? "A run lasts 1,000 days by default." : is("humans") ? "A run lasts 10,000 days by default." : "A run lasts 3,600 days.",
        "The page plays 20 runs with different luck and draws the first; a run survives if anyone is alive on its last day.",
        "Random numbers are seeded (mulberry32), so a seed replays the same run." + (at("food") ? ` Cows, people${at("advisor") ? ", the advisor" : ""}${at("inheritance") ? " and the birth draws" : ""} roll separate dice, so changing one doesn't change the others' luck.` : ""),
        at("humans") && "A run stops early past 2,000 people and counts as surviving.",
        at("humans") && "A death counts as hunger's doing if hunger took at least half a day off that life.",
        "Lifespans are at least 1 day." + (!is("humans") ? " Births stop at 10 × K cows, which a herd near K never reaches." : ""),
        at("food") && "Once the people are gone, the cows carry on.",
      ],
    });

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
      const list = g.ordered ? `<ol>${li}</ol>` : `<ul>${li}</ul>`;
      return `<div class="rule-group"><h3>${g.title}${where}</h3>${list}</div>`;
    }).join("");
  }

  document.querySelectorAll("section.impl[data-page]").forEach(render);
  window.MagicRules = { groups };
})();
