// Implementation details for the Magic Scroll ecology pages: every rule a page runs, in plain words,
// for building the simulation into the game. Each page has a <section class="card impl" data-page="…">
// with a .rules-body inside; this fills it with the groups of rules that page uses.
// Numbers are the defaults. Keep this in step with the models when a rule changes.
(function () {
  const ORDER = ["herd", "humans", "food", "advisor", "production", "attribute"];

  function groups(page) {
    const at = (name) => ORDER.indexOf(page) >= ORDER.indexOf(name);   // this page or a later one
    const is = (...names) => names.includes(page);
    const working = at("production");   // people do the work from the Production page on
    const out = [];

    // ---------- Runs and luck ----------
    out.push({
      title: "Runs and luck",
      items: [
        is("herd") ? "A run lasts 1,000 days by default (the Days setting); each day is one step."
          : is("humans") ? "A run lasts 10,000 days by default (the Days setting); each day is one step."
          : "A run lasts 3,600 days: 10 years of 360 days. Day of the year = ((day − 1) mod 360) + 1.",
        "The page plays 20 runs with different luck and draws the first. All randomness comes from a seeded generator (mulberry32), so a seed always replays the same run.",
        at("food") && "Each run of people is paired with its own run of the cows. Cows and people roll separate dice.",
        at("advisor") && "The advisor rolls its own dice too, so every policy faces the same luck.",
        at("humans") && "A run that grows past 2,000 people stops early and counts as surviving (only to keep the page fast).",
        "A run survives if anyone is still alive on its last day.",
      ],
    });

    // ---------- Cows ----------
    if (!is("humans")) out.push({
      title: "Cows", where: "Herd",
      items: [
        "Each cow has an age in days and its own lifespan: 360 days ± 15%, drawn evenly, at least 1 day.",
        "Start: 11 cows, each at a random age from 0 up to its lifespan.",
        at("food") ? "Cows under 60 days are calves. Only adult cows give milk, but calves still count toward births and crowding."
          : "Cows under 60 days are calves. This is only a label: calves still count toward births and crowding.",
        "Each day, every cow ages a day and any that reach their lifespan die.",
        "Then, with N cows left, the herd changes by <b>r·N·(N/A − 1)·(1 − N/K)</b>: growth rate r = 0.02, Allee threshold A = 2, carrying capacity K = 10. Above zero, that many calves are born (age 0, new lifespan); below zero, that many cows picked at random die.",
        "Fractions become chances: a change of 2.3 is 2 cows, plus a third with a 30% chance.",
        "Births stop once the herd reaches 10 × K = 100 cows.",
        at("food") && "The herd doesn't depend on the people: nobody eats the cows. Each day the village works with yesterday's count of adult cows.",
      ],
    });

    // ---------- People ----------
    if (at("humans")) out.push({
      title: "People", where: "Humans",
      items: [
        "Each person has a sex, an age in days and a lifespan: 3,600 days ± 10%, drawn evenly, at least 1 day.",
        "Children are under 360 days, adults are 360 days and over, and elders are 3,600 days (the average lifespan) and over, so about half live to be elders. Adults and elders are both grown-ups.",
        "Start: 5 men and 5 women, all grown-up, each at a random age from 360 days up to their lifespan, so a few may already be elders.",
        "Couples = the smaller of grown men and grown women. Each couple has a child with a 0.002 chance a day: a boy or girl 50/50, age 0, with its own lifespan.",
        "Food needed a day: 8 per grown-up, 4 per child.",
        "Food is shared in proportion to need, so everyone gets the same share: food eaten ÷ food needed. Anything over 100% does nothing.",
        "Hunger: with a shortfall g = 1 − share, everyone loses <b>3,600 × g³</b> days of lifespan that day. No food at all costs 3,600 days, half the need 450, and 90% of it 3.6.",
        "Each day, in order: hunger shortens lifespans; everyone ages a day and anyone who reaches their lifespan dies; then each remaining couple rolls for a child.",
        "A death counts as hunger's doing if hunger had taken at least half a day off that life.",
        is("humans") && "On this page the food is fixed at 200 a day, shared out and never stored. Later pages replace it with what the village actually eats.",
      ],
    });

    // ---------- Food and stores ----------
    if (at("food")) out.push({
      title: "Food and stores", where: "Food",
      items: [
        "There are two foods, milk and rice. One unit of either meets one unit of need.",
        "Every batch remembers the day it was made. Milk keeps 1 day and rice 360: food made on day d can be eaten up to day d + keep and spoils the day after. So today's milk is eaten today or tomorrow, or it's lost.",
        "The village starts with 20,000 rice, counted as made on day 0 (it spoils after day 360), and no milk.",
        "Eating: the village takes the day's food from the batch that spoils soonest first, and on a tie milk before rice. Whatever is left stays in store.",
        "If there isn't enough, they eat all the good food there is and the share drops below 100%.",
        "Once everyone has died, the run is over for the people, but the cows carry on.",
      ],
    });

    // ---------- Energy and effectiveness ----------
    if (at("food")) out.push({
      title: "Energy and effectiveness", where: "Food",
      items: [
        "A standard working day (100 Power, 100 Intelligence) is 10 energy.",
        "Milk effectiveness: 1 energy collects 1 milk.",
        "Rice effectiveness: 1 energy of tending grows 2 rice. A full crew is 4 people × 180 days × 10 energy = 7,200 energy, so a full crop is 14,400 rice.",
      ],
    });

    // ---------- Food with nobody working ----------
    if (is("food", "advisor")) out.push({
      title: "Food with nobody working",
      items: [
        "Nobody works on this page. Each adult cow gives what one standard day of milking collects: 10 energy × 1 = 10 milk a day.",
        "The full crop, 14,400 rice, comes in evenly over the harvest on days 181–210 (480 a day). It comes in on any day with at least one adult alive; elders and children can't farm.",
      ],
    });

    // ---------- Food advisor ----------
    if (at("advisor")) out.push({
      title: "Food advisor", where: "Advisor",
      items: [
        "With the advisor off, everyone eats their full need while the food lasts.",
        "With it on (the default, IQ 120), the advisor sets a share of need for everyone to eat each day, once today's food is in store.",
        "Horizon = days to the start of the next harvest: 181 − day of the year before the harvest begins, otherwise 360 − day of the year + 181.",
        "Supply = all food in store + today's milk × (horizon − 1) + rice still to come this harvest.",
        working ? "Rice still to come = the smaller of the rice still in the field and the remaining harvest days × what today's rice workers bring in a day."
          : "Rice still to come = the remaining harvest days × the daily rice, if any adult is alive.",
        "Share = min(100%, supply ÷ (today's need × horizon) × e<sup>error</sup>).",
        "Error: σ = max(0, (160 − IQ) ÷ 400), which is 10% at IQ 120 and 0 from IQ 160 up. Error = lean + (σ ÷ 2) × z, with z a fresh standard normal each day. The lean = σ × z is drawn once per village, so an advisor keeps over- or underestimating.",
        "The estimate ignores milk spoiling, and the people who will be born or die before the harvest.",
        "The village eats need × share.",
      ],
    });

    // ---------- Work ----------
    if (working) out.push({
      title: "Work",
      items: [
        "Each grown-up does one job a day, or none. Children don't work, and elders can milk but not farm.",
        "Milking comes first: one milker per adult cow, with elders picked before adults so the adults stay free for the rice. A cow gives whatever its milker collects; there's no cap per cow.",
        is("production") ? "A milker spends a standard day: 10 energy, so 10 milk."
          : "A milker spends their day's energy (see Power and Intelligence), so at 120 Intelligence and Power, 12 energy and 12 milk.",
        "Adults left over go to the rice.",
        is("production")
          ? "Tending, days 1–180: the rice wants a full crew of 4 hands, and more doesn't help. Each hand is 10 energy, so tending counts up to 40 energy a day."
          : "Tending, days 1–180: adults are sent one at a time until the rice has at least 40 energy (a full crew). Tending counts at most 40 energy a day; the rest is wasted.",
        "On day 181 the crop is ripe in the field: this year's tending energy × rice effectiveness. A full crew every day gives 14,400 rice, and one hand all season a quarter of that.",
        is("production")
          ? "Harvest, days 181–270: each hand brings in up to 250 rice a day (25 per energy) until the field is bare. The rice wants just enough hands to clear the field today, at most 4."
          : "Harvest, days 181–270: each energy brings in 25 rice until the field is bare. Adults are sent until they bring at least min(40, field ÷ 25) energy; all of it counts.",
        "Rice still in the field after day 270 is lost. Tending starts again from zero on day 1 of each year.",
        "Adults with no job stay idle.",
      ],
    });

    // ---------- Power and Intelligence ----------
    if (is("attribute")) out.push({
      title: "Power and Intelligence", where: "Attribute",
      items: [
        "Every person has Power (力量) and Intelligence (智力), 120 each by default, set at birth. For now everyone has the same values.",
        "Durability (耐力), from Power: floor(Power ÷ 10) energy a day. Once it's spent, they stop.",
        "Efficiency (效率), from Intelligence: Intelligence ÷ 100 energy an hour, for at most 10 hours, so at most floor(Intelligence ÷ 10) energy.",
        "A day's energy is the smaller of the two, and hours worked = energy ÷ efficiency. For example, 120 / 120 spends 12 energy in 10 hours, while Power 150 with Intelligence 100 spends 10 and leaves 5 unspent.",
        "Someone with 0 energy gets no job.",
      ],
    });

    // ---------- Whole numbers ----------
    if (at("food")) out.push({
      title: "Whole numbers",
      items: [
        "Food always comes in whole units.",
        is("attribute") && "Energy is whole too, rounded down: 119 Power gives 11 energy.",
        "Food made from energy is rounded down, and the fraction carries over: after E energy in all, floor(E × effectiveness) food has been made, and each day adds the difference. At 2.5 milk per energy, energy by energy gives 2, 3, 2, 3, …, and an 11-energy milker collects 27, 28, 27, … A village keeps one running total for its milk across the whole run.",
        working ? "Rice crop = floor(tending energy × rice effectiveness), each year on its own; the fraction is lost. Harvesting brings in 25 rice per energy, already whole."
          : "Full crop = floor(7,200 × rice effectiveness). The k-th harvest day brings in floor(Y × k ÷ 30) − floor(Y × (k − 1) ÷ 30) rice, so the 30 days add up to exactly the year's Y.",
        "The food eaten each day (need × share) is rounded to the nearest whole unit.",
        "Not rounded: shares, lifespans, and days lost to hunger, which stay fractional.",
      ],
    });

    // ---------- One day, in order ----------
    if (at("food")) out.push({
      title: "One day, in order", ordered: true,
      items: working ? [
        "Stored food ages a day, and anything past its keeping time spoils.",
        "On day 1 of the year, tending starts from zero. On day 181, the crop is ripe in the field.",
        "Jobs go to today's adults and elders, for yesterday's count of adult cows.",
        "Milk and harvested rice go into store. On day 270, rice left in the field is lost.",
        "The advisor sets the share.",
        "The village eats.",
        "People: hunger, then ageing and deaths, then births. A child who comes of age today starts work tomorrow.",
      ] : [
        "Stored food ages a day, and anything past its keeping time spoils.",
        "Today's food goes into store: milk from yesterday's adult cows, and rice on harvest days.",
        is("advisor") && "The advisor sets the share.",
        "The village eats.",
        "People: hunger, then ageing and deaths, then births.",
      ],
    });

    return out;
  }

  function render(section) {
    const body = section.querySelector(".rules-body");
    if (!body) return;
    body.innerHTML = groups(section.dataset.page).map((g) => {
      const items = g.items.filter(Boolean).map((t) => `<li>${t}</li>`).join("");
      const where = g.where ? `<span class="rule-where">set on ${g.where}</span>` : "";
      const list = g.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      return `<div class="rule-group"><h3>${g.title}${where}</h3>${list}</div>`;
    }).join("");
  }

  document.querySelectorAll("section.impl[data-page]").forEach(render);
  window.MagicRules = { groups };
})();
