# Magic Scroll Ecology: the simulation

Made by `node tools/spec.js` from rules.js and the models; edit those, not this file.

A village over 100 years of 360 days: a herd of cows (and from the Resources page on, sheep), and people who are born, pair up, work for their food on a small map, eat, learn, collect, craft, dress for the weather and die. Each page of the site adds a part; this file has them all, as the Strategy page runs them, at the default settings.

How to read it:
- **Rules** are in the order a day needs them. Numbers that are settings are written at their defaults; Settings below lists each one with its range. Every other number is fixed.
- "Settings: the X page" under a heading, or "the X page's …" in a rule, names the page of the site where those settings live. They're listed under X in Settings; the Weather page's rules are under Weather, and the Jobs table is at the end.
- **Micro mode** is the game's rules: the day played out person by person, event by event. **Macro mode** is a faster approximation of it, which the pages run by default; it's described, but not to the letter.
- Randomness: each kind has its own dice (mulberry32, seeded). A rebuild that follows these rules should match the site's results in distribution, not draw for draw.

## Rules

### Terms

1. Time goes in days; a year is 360 days, and the day of the year is ((day − 1) mod 360) + 1. Village order: the starting men, then the starting women, then everyone else in the order they came (born or joined).
2. u is an even (uniform) draw in [0, 1); “an even draw” of a range is uniform over it. ⌊x⌋ rounds down, ⌈x⌉ rounds up. Each kind of randomness has its own dice (see Simulation notes).

### Cows

*Settings: the Herd page.*

1. Each cow lives 360 × (1 ± up to 15%) days, an even draw. Start: 10 cows, each aged ⌊u × its lifespan⌋. Calves (under 60 days) give no milk.
2. Each day every cow ages a day, and those reaching their lifespan die. Then, with N cows left, the herd changes by **Δ = r·N·(N/A − 1)·(1 − N/K)** (r 0.02, A 2, K 10): by the whole part of |Δ|, and one more with chance its fraction (2.3: 2, and a third at 30%). Δ > 0: that many calves are born, never past 100 cows (10 × K). Δ < 0: that many cows, drawn at random, die.
3. The herd lives on its own: nothing the village does changes it. The village milks the cows that were adults the day before.
4. Tiers: 1 N, 2 R, 3 SR, 4 SSR, and 5 UR (crafts only). **draw(x)** = x + an even draw of −0.49, −0.48, …, +0.50, rounded half up and held to 1–4 (cows and sheep: 1–3). Every starting cow is SR. A calf's tier is draw(the average tier of two different adults, drawn at random; with one adult, it twice; with none, any two of the herd).

### People

*Settings: the Humans page.*

1. Each person lives 3,600 × (1 ± up to 10%) days, an even draw. A child under 360 days, an adult until 3,240, an elder from then; adults and elders are grown-ups. Start: 6 men and 6 women, each aged min(lifespan − 1, 360 + ⌊u × (lifespan − 360)⌋).
2. Couples. Each night, after the deaths, a couple with a dead partner ends, and the single adult men and women pair up at random (as many couples as the smaller group); a couple then lasts until one of them dies. Next, mothers who conceived G = 300 days ago give birth (a mother who died first loses the child; a father who died still counts as the father). Then each couple of two adults whose woman can conceive (she isn't expecting, and her age + G is under 3,240) conceives with its chance (see Happiness).
3. A newborn is a boy with chance (W + X) ÷ (M + W + 2X): M and W are the living males and females under elder age, tonight's newborns counted as they come, and X is the birth balance (1; 0–1). Nobody to count: even odds.
4. Need: everyone eats their **Power** in food a day, children too; an elder ⌊Power × 0.8⌋, the Power they work with (the elder penalty). Eating a share s of their need, someone misses (1 − s) × their need (s: the children's or the grown-ups' share, see Eating). **Hunger's toll**: their lifespan is their drawn lifespan less **⌊S⌋** days, S being all the food they've missed in their life (a day of life for each food missed); they die when their age reaches it. So a day with nothing to eat, at a need of 100, costs 100 days.
5. Newcomers: after the births, a village of n people (tonight's newborns included) under 10 gains an outsider with chance 1 ÷ (10 × (n + 1)²): a grown-up aged 360 + ⌊u × 1,081⌋ days (at most their lifespan − 1), a man or woman by the newborns' rule, with Power and Intelligence each 80 + ⌊u × 21⌋. So an empty village gets someone at 1 in 10 a day; it has "died out" only while nobody is there.

### Food

*Settings: the Food page.*

1. Milk and rice meet need one for one. Food made on day d keeps until day d + its keeping time (milk 1, rice 360), then spoils. Start: 50,000 food in store that never spoils.
2. A standard day is 100 Power. 1 Power spent milking collects 1 milk; 1 Power spent tending grows 1 rice, each of the 4 fields giving at most 50,000 a year. A cow has no milk limit, whatever its tier.

### Eating

*Settings: the Food page.*

1. Children eat first: their full need while there's any food in store (milk, rice or the starting food), the milk first (the oldest first), then whatever spoils soonest. If there isn't enough, each child gets the same share of their need.
2. Then the grown-ups eat what's left, whatever spoils soonest first (milk before rice on a tie), the starting food last: their full need, or if short, each the same share of it, s = the food left ÷ the grown-ups' need. Nobody holds food back. If the grown-ups' need was met too, the children then drink all the milk left in store: **extra milk**, split evenly.

### Jobs

*Settings: the Jobs table.*

1. Who may do each job is the Jobs table. By default: children milk and go to class; men milk, tend, harvest, cut wood, quarry, forge; women the same, but shear instead of quarrying and weave instead of forging; old men and women as men and women; scholars (a row for each sex) write poetry and teach. The table's 生火 (fire-making) column isn't used. Field work is tending on days 1–180 and the harvest from day 181. A **milk-only** grown-up is one who may milk but not do today's field work.
2. The village's order of jobs (its priority): the fields, milking, crafts (the loom, then the forge), 採石 / 羊毛 (quarrying for men, shearing for women), 伐木 (woodcutting), 教育 (class and teaching), 吟詩 (poetry). A page leaves out the jobs it doesn't have.
3. Milking: one milker to each adult cow for the day, spending as much as they like on it. Fields: one person to each of the 4 fields for the day. The day's milk is the whole milk in all the Power spent milking so far in the run, less what earlier days made (fractions carry over). Tending: each field takes at most 50,000 ÷ 180 Power a day (so no one person gives it more), and on day 181 it holds ⌊its year's tending work⌋ rice. Harvest: each day wants ⌈min(400, the rice in the fields ÷ 25)⌉ Power of work, each bringing in 25 rice; whatever's left after day 270 is lost.

### Map and walking

*Settings: the Map page.*

1. The map is a 16 × 16 grid; a tile is empty or a house, farm, pasture, forest, mine, well (井) or river (川). Each kind of place is worked at its tile with the fewest steps (no diagonals) to a house (on a tie, the first in reading order: rows top to bottom, each left to right). Walking takes 1 minute a tile: between the house and a place, that place's steps; between two places, the steps between their two tiles.
2. Waking: the N people, in a random order, wake between 4 and 8 o'clock: draw N + 1 exponential gaps g₀ … g<sub>N</sub>; the k-th (from 0) wakes at 4 + 4 × (g₀ + … + g<sub>k</sub>) ÷ (g₀ + … + g<sub>N</sub>). Every time below is in hours since that person woke.
3. The day: out of the house for 12 h. Breakfast first, by the house (24 min). From 5½ h they go home for lunch (if idle, at once; if working, once the unit in hand is done and carried home), eat by the house (24 min) and go out again. From 12 h the same, home for the night; they go in on reaching the house.
4. Work goes a unit at a time: 10 Power, or less if the person or the job has less left, taking unit ÷ r hours (r: see Power and Intelligence). **A unit starts only if they'd finish it and be home by 12 h** (the 12 h rule); once started, it's finished. What's collected (milk, the harvest, timber, wool, stone) is carried home after every 10 Power and at the end of the job: a walk home and back each time. Anyone with nothing to do waits by the house.

### Hunger through the day (display only)

*Settings: the Map page.*

1. Only shown, in Micro mode: it changes nobody's work and costs no days of life (hunger's toll goes by the food missed; see People). Let g be the share of their need they ate (at most 1; see Eating). Breakfast and lunch each keep them full for **f = 6g** hours: breakfast until f; lunch, from Lh (when they got home for it), until max(f, Lh) + f. They show as hungry with 2.4 h or less of that left.
2. Going in early: let o be when they were first back at the house with no Power left. If o < Lh and max(o, f − 2.4) < Lh, they go in at o and skip lunch. Otherwise, if max(o, Lh + 24 min, max(f, Lh) + f − 2.4) is before E (when they went in for the night), they go in then instead. Never home for lunch: Lh = 5½; never went in: E = 12.

### The day, person by person

1. Everyone (grown-ups, children, the scholars) starts the day at the house with their Power left e and rate r. Everything runs on one clock, events in time order, ties in village order. Each person has at most one event pending; a new one replaces it.
2. Waking: breakfast, then they **choose**. Choosing at hour t: from 12, let go of any job and class and go home for the night; before lunch and from 5½, go home for lunch, keeping the job (but leaving class). A scholar chooses as in Scholar and school. Otherwise, with Power left, up to 4 tries: drop their job if there's nothing left for them there or no unit could start; then a child without a food job chooses food work or class, and a grown-up without a job takes one from the board; then they go to it. If none is found, they **wait**.
3. Waiting: they let go of the job and walk home if out (not choosing on the way). Back at the house, the first time with no Power left is o (for the display). They choose again at 5½ (after lunch, at 12), or sooner when work opens up.
4. Going to a job: they walk straight there and choose again on arrival. At the job, the unit is min(10, e, what the job lets them do), or 0 if it couldn't finish in time (the 12 h rule); at 0 they let the job go and try again. Otherwise they work the unit; it's credited, and taken off e. Then they choose again where they are, except when collecting away from the house: the unit goes in their load, and with 10 carried, no Power left, or nothing more for them there, they walk home first (setting off home empties the load).
5. Home for lunch: Lh is then; they eat (24 min) and choose. Home for the night: E is then, and their day is done.
6. **Could still do** at a place: the most whole Power (at most ⌊e⌋) they'd spend if they went there now and did only that job for the rest of the day, in whole units, by these rules: from where they are (while walking, from where they set out), with their load, from now or from the end of their meal; units start only before 5½ until they've lunched (after that: home, lunch and back first), and by the 12 h rule.

### The job board

1. **Shared jobs**: milking (no end), the fields, shearing (it needs ⌈the wool on the sheep this morning ÷ 1⌉ Power), quarrying and woodcutting (no end). Each has places, one person to a place for the day, theirs once they take the job: a cow each, the 4 fields, a sheep each with wool (the fullest first), 2 places at the mine and 3 in the forest. A field takes at most its daily limit from its person, a sheep its wool. A job's open work = its need − what's done − what's reserved. Taking a job reserves min(open, what they could still do there, the place's limit), and they may then do what's left of their reservation. A grown-up who uses it up reserves again the same way (a child doesn't); at 0 there's nothing left for them. Letting go returns what's unused.
2. **The loom and the forge**: one person at each a day, the first to take it keeping it all day. A station has work while a craft is under way, or when all its next item's materials are in store (a unit: min(10, e, what's left of the craft); with none under way, the first unit starts one). Someone takes it if nobody else has had it today, nobody holds it now, it has work, and they could still do at least 1 there.
3. Grown-ups take the first job in priority order that they may do and can get. A milker's cow is theirs once they take milking, even between spells of it. A grown-up who may do today's field work takes a cow only if one is left over for each milk-only grown-up without a job or a cow (awake or not) who could still milk. Collecting: at 採石 / 羊毛 they collect their own (men stone, women wool), at 伐木 timber; going by the village's order, at whichever of the two they come to first, they take whichever of their two materials fewer people are collecting so far today, then the other (see Sheep and resources).
4. Children go down the same list: milking only if a cow is left over for each grown-up without a job (awake or not) who may milk and could; the fields only if a field is left over for each grown-up without a job or a field (awake or not) who may farm and could, and only for the gap those grown-ups couldn't cover (open − the sum of what they could still do there), at most that; class, if their class is on. A child in class keeps the seat unless food work above class needs them.
5. **Work opens up** when someone lets go of a shared job with reserved Power unused while some is open, or of the loom or forge with work left, or a scholar runs out of Power or goes in: then everyone at the house with Power left who is waiting or in class chooses again at once, in village order.

### Power and Intelligence

*Settings: the Attribute page.*

1. A person's **Power** is both what they can spend in a day and what they eat. Each morning they have **e = ⌊Power⌋** to spend (their Power left), and they spend it at **r = Intelligence ÷ 10** Power an hour. Short of food, they still have their full Power the next day, but lose life (see People); Power left unspent at the end of a day becomes happiness. Starting grown-ups have Power 100 and Intelligence 100. Elders work with both × 0.8 (the elder penalty), and eat that much Power. Power and Intelligence never go below **70**; a child's never below 70 less the coming-of-age bonus (24), 46, at birth or from hunger. A scholar works with Power × 0.9 and Intelligence × 1.1 (the scholar adjustment).

### Inheritance

*Settings: the Inheritance page.*

1. A newborn's Power and Intelligence: each **max(46, ⌊0.7 × the parents' average × (1 + v)⌋)**, v an even draw within ±10%, drawn for each. The parents: the mother and her partner when she conceived (alive or not by the birth); with no partner on record, a random adult man and woman; with no adult man or woman, the starting 100 each. (46 is 70 less the coming-of-age bonus, so a child born at it comes of age at 70.)
2. **Extra milk** (see Eating): when everyone, children and grown-ups, has eaten their full need, all the milk left in store is shared evenly among the children (fractions kept). Rice and the starting food never build Power.
3. Each day after eating, a child's milk bank plus their extra milk buys Power one point at a time, each costing **(max(100, P) − 100)² + 100** at their Power P then; the rest stays in the bank. Their hunger bank plus the food they missed (need × (1 − share)) takes **1 Power for every 100**, down to 46 (even below their born Power). At 360 days they come of age: +24 Power and +24 Intelligence (the coming-of-age bonus), and both banks are emptied.

### Happiness

*Settings: the Happiness page.*

1. Happiness = min(100, **max(0, 150 − ⌊Intelligence ÷ 1⌋) + ⌊Power left at the end of their last day ÷ 1⌋**), set each night in time for that night's births and kept through the next day. Power left is what's unspent after all their jobs and a child's class; a scholar who writes poetry has none. On day 1, and for a newborn, there's none yet.
2. Each person's chance of conceiving is **0.005 × happiness ÷ 50**; a couple's is the average of the two.

### Sheep and resources

*Settings: the Resources page.*

1. Sheep follow the cows' herd model (the same settings, their own dice); the village has the sheep that were adults the day before. Each carries 0–300 wool: each morning all grow 30 back (up to 300), and a sheep coming of age arrives with 300. When there are fewer adult sheep than the day before, they're removed one at a time from the wool level most sheep have (the lower on a tie). All of this is per tier.
2. 1 Power collects 1 timber (forest), 1 wool (pasture) or 1 stone (mine); the forest and the mine never run out. One person to a place for the day: a shearer to each sheep with wool (the fullest first, taking at most its wool), and at most 2 quarriers and 3 woodcutters a day. There are two jobs: 採石 / 羊毛 (a man quarries, a woman shears) and 伐木 (woodcutting). Going by the village's order, a grown-up at the first of the two they come to collects whichever of their two materials fewer people are collecting so far today (on a tie, the one the store had less of this morning; on a tie, their own), then the other. With an order of their own (the player's), each job is only its own material. Each person tries each material once a day. Each day's take is whole (fractions carry over) and kept for good. Wool comes off the fullest sheep first (the higher tier first), one sheep at a time. Children don't collect or craft.
3. Tiers: a person's tier at a skill is their level there (level 0 counts as N); the forest and the mine are SR. Each day's take of wool, timber and stone has one average tier, the average of three: the collectors' skill tiers, weighted by work; the source's (the forest's, the mine's, or the sheep's, weighted by the wool shorn off each); and the collectors' 刀 tiers (no 刀: N), weighted by work. The take fills lots of 100 in turn; each full lot's tier is draw(the average over its units).

### The cold

*Settings: the Clothing page.*

1. The temperature: each village has its own weather (the Weather page's rules and settings, its own dice); someone's temperature at a moment is the day's T + (D ÷ 2) × f(their clock hour), as in the Weather page's Through the day, their clock hour being when they woke + the hours since.
2. The house is warm: meals, the loom and forge, class, poetry, waiting and the night. Out of it (walking, or at the farm, pasture, forest or mine), a person's **felt temperature** = the hour's + 5 × their 衣's tier + 5 × the tier of the warmest fire burning within 4 tiles (straight-line distance between tiles). Below 0 °C they're in **hypothermia**.
3. Hypothermia lasts from when their felt temperature drops below 0 °C until it's back to 0 °C or more, or they're home. It costs no days of life, but each unit of work out of the house below 0 °C is cut by (felt ÷ 10)², taken as the unit starts (all of it at −10 °C or colder), on top of the rain's cut (the two multiply). Kept in by the cold, they still eat breakfast and lunch as usual.
4. At work and feeling −5 °C or colder, they finish the unit in hand, then walk home to warm up, keeping their job. If they arrive at the work site to find it that cold (after lighting any timber they brought), they turn back. Between 0 and −5 °C they work on, slower.
5. Leaving the house for a job out of it: if the hour's temperature, with their 衣 and any fire burning at the place when they'd arrive, is 0 °C or more, they go. If not, they put on the lowest-tier 衣 that's warm enough (the oldest of that tier, taken for the day); with none, the warmest 衣 there is, and, with more than 1 Power left and the rain under 10, the lowest-tier timber that makes up the rest (from the full lots in store). Still short: if it would feel −5 °C or colder, they let the job go and choose again on the hour (or at lunch, or for the night); otherwise they go.
6. At the work site they light their timber, unless the rain is at 10 (then it stays unlit and goes back to the store when they're home). Lighting it costs 1 Power (or what they have left by then). The fire warms everyone within 4 tiles for 2 h, less in the rain: at rainfall R it burns 1 ÷ (1 − (R ÷ 10)²) times as fast (so it lasts 2 × (1 − (R ÷ 10)²) h in a steady rain), the rain changing as it burns.
7. 衣 is worn only for warmth: once put on, it's kept for the day and wears by all its wearer's Power; one swapped for a warmer one goes back unworn.

### The rain

*Settings: the Clothing page.*

1. The rain: the village's rainfall R, 0–10, hour by hour (the Weather page's rain under its clouds; snow counts the same). Out of the house, each person feels **max(0, R − 2 × their 笠's tier)**.
2. Each unit of work out of the house (milking, the fields, shearing, quarrying, woodcutting) does × **max(0, 1 − (felt ÷ 10)²)**, at the rain as the unit starts. At a job with a limit (a field's daily limit, a sheep's wool) each Power still uses up 1 of it, but brings in less; at the harvest it does less of the work the rice wants. The loom, the forge, class and poetry are indoors.
3. Nobody goes home or stays in for the rain, however hard: it only cuts the work (to nothing at 10 felt).
4. Leaving the house for a job out of it with the felt rain at 5 or more: they put on the lowest-tier 笠 that brings it under 5 (the oldest of that tier, taken for the day); with none, the best 笠 there is, if it's better than theirs; either way they go. They dress for the rain first, then for the cold.
5. With the rain on, a 笠 is worn only against it (not taken every day); once put on, it's kept for the day and wears by all its wearer's Power.

### The player

*Settings: the Strategy page.*

1. Each day, before anything else (before the scholars are seen to), the player may: **kill** anyone (gone at once, counted among the day's deaths; a partner is single again that night); **appoint the scholars** (grown-ups only, any number, elders too: the day's scholars are then that list, not the village's choice); **pour** the well full, to 100; and **give** any number of 刀 叉 衣 笠 of any tier up to SR, in store as if just made.
2. On the 1st of each month (days 1, 31, …, 331 of the year) they may give anyone their **own order of jobs**, which may hold **發呆** (doing nothing): on reaching it, they stop for the day with their Power left unspent (a child skips class too; a scholar only teaches or writes if it comes before). An order stands until changed; a newborn has none. With an order, the person goes down it instead of the village's: in Micro choosing their next job (a scholar, teaching or poetry); in Macro, see Macro mode.
3. For each couple they may say whether it may have a child: a couple told no can't conceive (a pregnancy under way goes on) until told yes.
4. **Strategies** are players. Every one keeps the well full; gives SR 衣 and 笠 to everyone and SR 刀 and 叉 to every grown-up as they're needed (enough in store for 1.2 each); appoints one scholar once there are 6 adults (none before); and kills nobody. No child's or scholar's order has crafting in it, and the scholar's puts teaching first (class, the fields, milking, collecting, poetry). Where a strategy gives orders that collect both materials, every other person by age has 伐木 before 採石 / 羊毛, the rest the other way round.
5. A **smith**, where there is one: once there are 4 adults, the youngest man who isn't a scholar, the forge first every day for the rest of his life (his elder years too; a new one when he dies or is made a scholar). While the forge waits he cuts timber (伐木) first if he has a gatherer, otherwise 伐木 and 採石 first by turns, a month each.
6. **Most people** (goal: the most people at once): every couple may have a child while the store holds 30 days' food; a smith; the brightest adult as the scholar; children go to class first while the store holds 90 days' food; everyone else works the food first.
7. **Best all-rounder** (goal: the highest Power + Intelligence anyone reaches): the village held under 20 people (children on the way counted); a couple may have a child only while there are fewer than 2 children (those on the way counted); every child goes to class first; the strongest adult is the scholar; everyone else works the food first; and while there's room for a child and 60 days' food in store, the couple who could have one now (both adults, she able to conceive) with the most Power + Intelligence between them gets that month's order 發呆.
8. **A UR craft** (goal: a UR craft, or else the most SSR ones): under 20 people and fewer than 2 children, as above; a smith, and his gatherer: once there's a smith, the youngest adult man after him who isn't a scholar, quarrying first every day (採石, 伐木, the fields, milking, teaching, poetry) for the rest of his life; nobody else's order has crafting in it, so only the smith uses the forge and the loom stands idle; the brightest adult as the scholar; children go to class first while the store holds 90 days' food.
9. **Sustainable** (goal: the most people on an average day over its years on its own): for its hands-off years (10) it plays with the brightest grown-up as the scholar, every grown-up on the food first, and children only while the store holds 30 days' food. On its last day it gives enough SR crafts for everyone to the end and lets every couple have children again; from the next day it lets go: the village chooses its own scholars, nothing is poured or given, and the orders it gave stand. The others play all 100 years.

### Watering

*Settings: the Watering page.*

1. The well (井) holds at most 100 water and starts full. Each day, after the day's work, it refills over the 24 hours: from the ground at W ÷ 2 an hour (W: the land's water level at the day's end, from the Weather page) while it holds under 50, and from the rain at its rainfall an hour (snow too), up to 100, worked out between the rain's changes.
2. Each of the 4 fields has a water level, 0–10. The fields are numbered in the order they're taken each day (the first farmer's is field 1), and start at the land's level. Tending uses 0.1 level per Power. A farmer who finds their field at level 4 or lower (and under 10), on arriving or after each unit, walks for 1 water and brings it back: +1 level (at most 10). They go to the well if it has water and is no further from the field than the river, otherwise to the river, while it runs. The river is dry on a day that starts with the mountain's level at 0 (see the Weather page's Water level), or if the map has none; with the well empty too, there's no water.
3. At the day's end, a field nobody tended today takes the land's level. A field tended at least once this year is seeded: until the harvest (days 1–180) it grows rice by itself each day by its level, rounded down: level 0: −100, 1: 0, 2: +25, 3: +50, 4: +100, 5: +50, 6: +25, 7: 0, 8: −25, 9: −50, 10: −100. On day 181 the rice standing is the tending's plus all the water's growth this year, never below 0.

### Crafts

*Settings: the Craft page.*

1. Women weave (紡織) 衣 clothes (200 wool + 100 timber) or 笠 hats (100 wool + 200 timber); men forge (鍛造) 刀 blades (200 stone + 100 timber) or 叉 hayforks (100 stone + 200 timber); each takes 100 Power of work at the house. There is one loom and one forge, one crafter at each a day. A craft takes its materials up front and is worked until done, over days if need be, by whoever holds the station. Weaving and forging use a 刀: the crafter's for the day (the one they carry, or else the best left, taken at the station), adding its bonus; with none they craft without, the 刀 counting 0 in the score.
2. To start with, the store holds no crafts (the Craft page can set any number of R 刀, 叉, 衣 and 笠 to start, each wearing out like a made one).
3. A station's next item is its item started fewest times (衣 before 笠, 刀 before 叉 on a tie); it waits until all that item's materials are in store.
4. In use: each day everyone with Power left (and the scholars), in village order, takes the best 衣 and 笠 left. Trying field work or collecting, someone without the job's tool today first takes the best one left (tending: a 叉; the harvest and collecting: a 刀, the same 刀 all day), putting it back if they don't get the job. Best: the highest tier, the oldest on a tie; each is taken once a day. Wear, by Power spent: 衣 and 笠 with all of their wearer's Power (lasting 2,000), a 叉 tending and a 刀 at the harvest, collecting and crafting (2,000); worn out, it's gone at the end of the day, before the day's new crafts come in.
5. A craft takes each material best tier first (closing the lot still filling early if the full ones fall short). Done, its score is the average of three, to the nearest 0.01: its materials' average tier, its crafters' skill tier and their 刀's tier (0 without one), these two averaged by work on it. Its tier = **round((score + roll) ÷ 2)**, half up, held to 1–5, the roll an even draw of 1.01, 1.02, …, score + 1 (worked in hundredths). So with all three SSR (4.00): SSR 50%, SR 49.75%, UR 1 in 400; below 4.00, never UR.

### Skills

*Settings: the Resources page.*

1. Nine skills, each with exp and a level (0–4), starting at 0 (the born too): milking, farming (tending and the harvest), woodcutting, weaving, forging, shearing, quarrying, teaching, poetry. Each Power spent on a job is 1 exp in its skill; a child's class earns none. Levels 1 / 2 / 3 / 4 take **100 / 1,000 / 10,000 / 100,000** more exp each (level 4 at 111,100), counted at the end of the day for the next.
2. **Effectiveness m = 1 + 0 / 10% / 20% / 30% / 50% at skill level 0 / 1 / 2 / 3 / 4 + their tool's bonus (a 叉 tending, a 刀 at the harvest and collecting): 20% / 40% / 60% / 80% / 100% for N / R / SR / SSR / UR (as made)**. At milking, tending and shearing it's a yield: each Power uses up 1 of the job (a field's daily limit, the sheep's wool; a cow has no limit) and brings in m (milk, the field's rice, wool), so their need, done, reserved and open work are in Power. Timber, stone and the knowledge from teaching and poetry: Power spent × m. At the harvest it's speed, as the standing rice is all there is: its need, done, reserved and open are work, Power × m (could still do: the Power × m; a unit: min(10, e, reservation left ÷ m) Power, credited × m). Crafts are speed too, the Power a craft takes being work (a unit: min(10, e, craft left ÷ m) Power, credited × m). The hours a unit takes go by the Power spent.

### Scholar and school

*Settings: the Education page.*

1. Each morning, while there are fewer scholars than both the children who may go to class and the most allowed (1), the brightest adult who isn't one (first in village order on a tie) is appointed, if the village could spare them all: leaving out the scholars and the children, at least 4 grown-ups who may tend have Power left; and, from a second scholar on, the grown-ups left who may milk, the best one to each adult cow, could milk the whole village's need (each Power × milk effectiveness × their milking effectiveness). Scholars serve until elder age or death, and do no other work.
2. Each day the scholars who may teach and put teaching first (Education above Poetry in their order, or they may not write) take the children who may go: the children in a random order (their own dice), the i-th to the (i mod n)-th of the n teachers, in the order appointed. Class is at the house, on for a child while their scholar has Power left and hasn't gone in. A child going to class walks home, sits, and chooses again at 5½ or 12 (or when work opens up). A child sitting down calls their scholar at once, if the scholar is waiting or writing (a poem cut short counts the Power spent so far).
3. A scholar, choosing: no Power left, they wait (until work opens up). Otherwise a unit of min(10, e) at the house (if it can start, by the 12 h rule), the first in their order of teaching (if a child of their class is seated with Power left) and poetry (if they may write); neither, they wait.
4. At the end of each teaching unit, each child of the class seated (and a child leaving mid-unit) is credited for the time since the latest of: sitting down, the unit's start and their last credit, at most e ÷ r. They spend that time × r and take home the scholar's teaching effectiveness × min(that time × the scholar's r, the Power they spent) ÷ the children in the class, in knowledge. Out of Power, a child leaves and chooses again; lunch and the night end class.
5. A child's knowledge bank plus what they take home buys Intelligence one point at a time, for life, each costing **(max(100, I) − 100)² + 1,000** at their Intelligence I then. Poetry: ⌊the day's Power spent on poetry × poetry effectiveness⌋ knowledge, kept apart as the scholar's poetry; it doesn't change their Intelligence.

### Whole numbers

1. Power to spend, food made and attributes round down; food made from Power spent keeps its fraction in a running total. The day's food eaten rounds to the nearest unit. Knowledge keeps its fractions.

### One day, in order

1. Stored food ages, and past its keeping time it spoils. Scholars step down at elder age or death; appointment (see Scholar and school). Day 1 of the year: tending starts again; day 181: the crop is ripe. The sheep grow wool.
2. The day, person by person, with yesterday's adult cows and sheep. Then exp and levels; knowledge and poetry; timber, wool (off the sheep), stone and finished crafts into store; milk and rice into store; on day 270 the fields' rice left is lost.
3. Everyone eats.
4. Hunger, ageing and deaths, happiness, couples, births, newcomers; newborns' attributes, and those coming of age get their bonus.

### Macro mode

1. Macro mode is a faster approximation of the rules above (Micro mode), and doesn't match them exactly; Micro mode compares the two. Each day the grown-ups, in a new random order, each on their own clock (walking, lunch, carrying, the 12 h rule), spend all their day allows on the jobs in the village's order: milking, one to a cow (milk-only grown-ups first); the 4 fields, one person to each, most Power left first, up to the daily limit while tending and until the rice has its work at harvest; crafts, whoever has no food work first; collecting, each in their order as in Micro. Tools are taken as in Micro. Then the children fill the food work left, most Power left first, and keep the rest for class. Each child is taught for the hours they'd share with their scholar on average over wake-up times (a triangle over ±4 h), ÷ the children in the class. Work is Power spent × effectiveness, as in Micro.
2. Own orders (the player's): the day's jobs go by rank: everyone's first job, then everyone's second, and so on; at each rank the jobs in the village's order, each with those who have it there.
3. The cold and the rain follow Micro's rules along each person's clock, a unit at a time: everyone wakes at an even spread over the wake-up window, in the order they come to work, and sees the fires lit by those worked out before them; the felt temperature goes in a straight line between the times they look, to find when it crosses 0. Working out what someone could do (the 12 h rule) leaves the weather out.

### Simulation notes

- Runs last 36,000 days (100 years).
- The page plays one seeded village (mulberry32), the one drawn; it survives if anyone is alive at the end. Separate dice for the cows, the sheep, the people, the birth draws, the day's waking, the classes, the pairing, the tiers and the weather, so each policy faces the same luck. Exact runs also depend on the order the dice are drawn in, which only the code sets; a rebuild following these rules matches them in distribution, not draw for draw. Comparisons allow a billionth for rounding.
- A run stops past 2,000 people (counted as surviving). A death is hunger's if hunger took at least a day off that life.
- Micro mode (the switch at the top) is the game's rules; Macro mode is the quick approximation and runs by default.
- Lifespans are at least 1 day. The cows carry on after the people are gone.

## Weather

### Seasons

*Settings: the Weather page.*

1. Days 1–90 of each year of 360 are spring, 91–180 summer, 181–270 autumn, 271–360 winter. Each season has its own settings: cloud rate λ, average wind w̄, wind volatility σ, cloudiness q, rain changeability ρ, and for the temperature μ, s, c, k.
2. **Settings** (spring / summer / autumn / winter): λ 0.65 / 0.45 / 1.5 / 1.45 an hour; w̄ 5.5 / 2.5 / 6 / 1.5 tiles an hour (so the spells last L = 47 / 102 / 43 / 171 h); σ 1.5 / 1.5 / 2 / 1.5; q 75 / 15 / 50 / 10%; ρ 2.65 / 0.55 / 0.3 / 0.85 an hour; average temperature μ 15 / 30 / 15 / −5 °C; and in every season spread s 5 °C, cloud cooling c 10 °C, rain cooling k 10 °C.
3. **Season ramp**, h = 15 days: the base temperature b(d) on day d is its season's μ, except within h days of a season's start. There, with p the days from the boundary, counted at mid-day (a season's first day is p = 0.5, the day before it p = −0.5), b = μ<sub>before</sub> + (μ<sub>after</sub> − μ<sub>before</sub>) × (p + h) ÷ 2h. h = 0: no ramp.
4. On a season's first day its settings take over at once: a new wind is drawn, and the waits for the next cloud, the spell's end, the wind's change and the rain re-roll are drawn afresh (as below). The clouds in the sky, the spell and the rain die carry on.

### Clouds and rain

*Settings: the Weather page.*

1. The sky alternates clear spells (no clouds come) and cloudy ones. A cloudy spell lasts an exponential time with mean Lq h, a clear one mean L(1 − q) h, where L = 16 × 16 ÷ w̄: a clear and a cloudy spell together last 16 crossings of the 16-tile sky at the average wind. No wind: the spell never changes. q = 0: always clear; q = 100%: always cloudy.
2. The sky over the 16 × 16 map holds at most 10 clouds. In a cloudy spell, clouds come at the west edge at random: the gaps between them are exponential with mean 1 ÷ λ (a fresh gap is drawn when a cloudy spell starts). A cloud due while 10 are in the sky doesn't come.
3. Wind v, the same for every cloud, holds for an exponential time (mean 3 h); then a new v is drawn from a gamma distribution with mean w̄ and standard deviation σ (shape (w̄ ÷ σ)², scale σ² ÷ w̄). σ = 0: always w̄; w̄ = 0: no wind.
4. Each cloud comes in at x = 0, on a row drawn evenly over the map's height, blows east at v and leaves at x = 16 (after 16 ÷ w̄ h at the average wind; with no wind, never). All clouds move together, so they leave in the order they came.
5. Start (day 1, spring): the spell is cloudy with chance q, its length drawn as above, and the wind drawn as above. With q = 100% and σ = 0 (or no wind), the sky starts with n clouds, n drawn from the distribution below, each at an even draw across the width; otherwise it starts empty and runs for 5 × (16 ÷ w̄ + L + 3) h first.
6. **Rain**: with n clouds in the sky it rains with chance **log₁₀(n)** (0 for n ≤ 1), at rainfall n. The sky keeps a rain die d, an even draw in [0, 1) (its own dice), re-rolled after exponential gaps with mean 1 ÷ ρ; it's raining whenever d < log₁₀(n), checked after every cloud coming or leaving and every re-roll. Start: d drawn evenly.
7. With q = 100% and σ = 0, **the share of time with n clouds**, a = λ × 16 ÷ w̄, is **aⁿ ÷ n!** over the sum of aᵏ ÷ k! for k = 0 … 10, and the share of clouds turned away is the n = 10 share. No wind: always 10 once any cloud has come. Otherwise the counts are clumpier (more 0s and more 10s), and the page simulates them.

### Temperature

*Settings: the Weather page.*

1. One temperature T a day (midnight to midnight). The day's weather part is **x = −(c × its average clouds ÷ 10 + k × its hours raining ÷ 24)**.
2. **T = b(d) + x − x̄ + e × u**: x̄ is the average of x over a long run of the season's settings (86,400 hours of them alone), so T averages b; e = √(max(0, s² − the variance of x over that run)) (so T's standard deviation is s), and u carries over day to day: u ← 0.6u + 0.8z (z a standard normal draw, the temperature's own dice; start: u = z).
3. Rain on a day below 0 °C is snow (at the same rate).
4. **Through the day** (nothing above depends on it): at clock hour t the temperature is **T + (D ÷ 2) × f(t)**, with f = −cos(π (t − 6) ÷ 9) from 06:00 to 15:00 and cos(π ((t − 15) mod 24) ÷ 15) otherwise: lowest, T − D ÷ 2, at 06:00, highest, T + D ÷ 2, at 15:00, and T on average. D = the daily swing × (1 − 0.6 × the day's average clouds ÷ 10); daily swing 8 °C in every season.
5. A day's type is what most of its hours were: sunny (no clouds), cloudy (clouds, no rain) or rainy / snowy; a tie goes to the wetter.

### Water level

*Settings: the Weather page.*

1. The land has one water level W, held to 0–10, starting at 5 when the run starts (the weather runs on year after year). W = 0 is a **drought**, W = 10 a **flood**.
2. While it rains (or snows) at rainfall n, W rises n ÷ 320 an hour. Dry, it falls d × (1 + 0.45 × (W − 5) ÷ 5) an hour, d = 0.0036 with no clouds and 0.0022 with clouds; that is, a + bW with a = 0.55d and b = 0.09d.
3. The sky only changes at its events (a cloud coming or leaving, the spell or the wind changing, a re-roll), so between two events W follows a set curve: rising, W + nt ÷ 320; falling, **W(t) = (W₀ + a/b) e<sup>−bt</sup> − a/b** (b = 0: W₀ − at). Work it out event by event, stopping at 0 or 10 at the moment it gets there.
4. The mountain above the river keeps a second level, the same way (starting at 5, the same rain, the same drain), except that it doesn't drain in hours below −5 °C (the hour's temperature through the day: the river is frozen). The river runs while the mountain's level is above 0. It's never below W, so the river only runs dry in a drought (by default in about 5% of years, about one drought in three).

## Settings

### Herd (index.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `r` | 0.02 | — | Intrinsic growth rate |
| `K` | 10 | — | Carrying capacity |
| `A` | 2 | — | Allee threshold |
| `L` | 360 | — | Average lifespan |
| `S` | 15 | — | Lifespan spread |
| `M` | 60 | — | Adult at age |
| `N0` | 10 | — | Starting herd |
| `cowTier` | 3 | — | Starting cows' tier (1 N to 3 SR) |
| `sheepTier` | 3 | — | Starting sheep's tier (1 N to 3 SR) |

### Humans (humans.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `p` | 0.005 | — | Birth chance |
| `G` | 300 | — | Pregnancy |
| `M` | 360 | — | Adult at age |
| `E` | 3240 | — | Elder at age |
| `L` | 3600 | — | Average lifespan |
| `S` | 10 | — | Lifespan spread |
| `F` | 2000 | — | Food production |
| `c` | 100 | — | Food need |
| `k` | 1 | — | Hunger toll |
| `X` | 1 | — | Birth balance |
| `men` | 6 | — | Starting men |
| `women` | 6 | — | Starting women |

### Food (farm.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `ricePerEnergy` | 1 | 0.1 to 10 | Rice effectiveness |
| `foodStart` | 50000 | 0 to 1000000 | Food in store at start |
| `milkKeep` | 1 | 0 to 30 | Milk keeps |
| `riceKeep` | 360 | 0 to 1080 | Rice keeps |
| `milkPerEnergy` | 1 | 0.1 to 10 | Milk effectiveness |
| `fieldCap` | 50000 | 5000 to 200000 | Rice per field |

### Map (map.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `minPerTile` | 1 | 0 to 60 | minutes to walk one tile |
| `activeHours` | 12 | 6 to 18 | hours a day everyone is out of the house, from waking |
| `lunchAfter` | 5.5 | 1 to 12 | hours after waking from which everyone heads home for lunch, once the energy they're on is done |
| `mealMin` | 24 | 0 to 120 | minutes to eat breakfast or lunch, by the house |
| `load` | 10 | 10 to 200 | Carried home every (搬運) |
| `wakeFrom` | 4 | 0 to 12 | everyone wakes between these hours (o'clock) |
| `wakeTo` | 8 | 0 to 12 | (with wakeFrom) |

### Weather (weather.html)

| Setting | Spring | Summer | Autumn | Winter | Range | What it is |
|---|---|---|---|---|---|---|
| `spawnRate` | 0.65 | 0.45 | 1.5 | 1.45 | 0 to 10 | clouds an hour coming in at the west edge during a cloudy spell, on average |
| `wind` | 5.5 | 2.5 | 6 | 1.5 | 0 to 32 | average wind speed: tiles an hour the clouds blow east |
| `windVol` | 1.5 | 1.5 | 2 | 1.5 | 0 to 16 | wind volatility: the standard deviation of the wind's speed, tiles an hour |
| `cloudiness` | 75 | 15 | 50 | 10 | 0 to 100 | % of the time in cloudy spells |
| `rainChange` | 2.65 | 0.55 | 0.3 | 0.85 | 0.05 to 5 | rain changeability: times an hour the rain die is re-rolled, on average |
| `temp` | 15 | 30 | 15 | −5 | −30 to 45 | average temperature, °C |
| `tempSd` | 5 | 5 | 5 | 5 | 0 to 15 | temperature spread: the standard deviation of the day's temperature, °C |
| `cloudCool` | 10 | 10 | 10 | 10 | 0 to 20 | cloud cooling: °C cooler for a day under a full sky (10 clouds) all day |
| `rainCool` | 10 | 10 | 10 | 10 | 0 to 20 | rain cooling: °C cooler, on top, for a day raining all day |
| `swing` | 8 | 8 | 8 | 8 | 0 to 25 | daily swing: °C from the coldest hour to the warmest on a clear day |

| Setting | Default | Range | What it is |
|---|---|---|---|
| `rampDays` | 15 | 0 to 45 | Season ramp, days |
| `water.perLevel` | 320 | 10 to 1000 | Rain per +1 water level (rainfall × hours) |
| `water.sunnyDrain` | 0.0036 | 0 to 0.2 | Sunny drain: level a dry, clear hour takes off at level 5 |
| `water.cloudyDrain` | 0.0022 | 0 to 0.2 | Cloudy drain: the same under clouds |
| `water.slope` | 0.45 | 0 to 1 | Drain slope (0: the same at every level) |

### Attribute (attribute.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `power` | 100 | 70 to 300 | Power |
| `intel` | 100 | 70 to 300 | Intelligence |
| `elderPenalty` | 20 | 0 to 50 | Elder penalty |

### Inheritance (inheritance.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `dearerPast` | 100 | 0 to 300 | Power points dearer past |
| `share` | 0.7 | 0 to 1 | Passed on (h) |
| `variation` | 10 | 0 to 50 | Variation at birth |
| `grow` | 24 | 0 to 100 | Coming-of-age bonus |
| `powerBase` | 100 | 10 to 1000 | Base cost of +1 Power |
| `hungerFood` | 100 | 1 to 10000 | Hunger per −1 Power |

### Education (education.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `maxScholars` | 1 | 1 to 10 | Most scholars |
| `knowPerEnergy` | 1 | 0.1 to 5 | Knowledge effectiveness |
| `knowBase` | 1000 | 10 to 1000 | Base cost of +1 Intelligence |
| `scholarShift` | 10 | 0 to 50 | Scholar adjustment |
| `intelPast` | 100 | 0 to 300 | Intelligence points dearer past |

### Happiness (happiness.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `happyBase` | 150 | 0 to 300 | Base happiness |
| `iqStep` | 1 | 0.5 to 10 | Intelligence per −1 happiness |
| `joyStep` | 1 | 1 to 100 | Power left per +1 happiness |

### Resources (resources.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `fleece` | 300 | 10 to 500 | Wool per sheep |
| `regrow` | 30 | 1 to 100 | Wool regrows |
| `woolPerEnergy` | 1 | 0.1 to 5 | Shearing |
| `woodPerEnergy` | 1 | 0.1 to 5 | Woodcutting |
| `stonePerEnergy` | 1 | 0.1 to 5 | Quarrying |
| `forestTier` | 3 | 1 to 3 | Forest's tier (1 N to 3 SR) |
| `mineTier` | 3 | 1 to 3 | Mine's tier (1 N to 3 SR) |
| `forestCrew` | 3 | 0 to 20 | Woodcutters at most |
| `mineCrew` | 2 | 0 to 20 | Quarriers at most |
| `exp1` | 100 | 10 to 1000000 | Exp for skill level 1 (on top of the level before) |
| `exp2` | 1000 | 10 to 1000000 | Exp for skill level 2 (on top of the level before) |
| `exp3` | 10000 | 10 to 1000000 | Exp for skill level 3 (on top of the level before) |
| `exp4` | 100000 | 10 to 1000000 | Exp for skill level 4 (on top of the level before) |
| `bonus1` | 10 | 0 to 500 | Effectiveness bonus at skill level 1, % |
| `bonus2` | 20 | 0 to 500 | Effectiveness bonus at skill level 2, % |
| `bonus3` | 30 | 0 to 500 | Effectiveness bonus at skill level 3, % |
| `bonus4` | 50 | 0 to 500 | Effectiveness bonus at skill level 4, % |

### Clothing (clothing.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `coldLimit` | −5 | −30 to 0 | Too cold to stay out |
| `clothStep` | 5 | 0 to 20 | Warmth of 衣 |
| `fireStep` | 5 | 0 to 20 | Warmth of a fire |
| `fireHours` | 2 | 0.25 to 4 | A fire burns |
| `fireReach` | 4 | 0 to 16 | A fire reaches |
| `fireEnergy` | 1 | 0 to 20 | Lighting a fire costs |
| `hatStep` | 2 | 0 to 10 | Rain a 笠 keeps off |
| `rainLimit` | 5 | 1 to 11 | Heavy rain from |

### Strategy (strategy.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `strategy` | 1 | 1 to 4 | Strategy (1 Most people, 2 Best all-rounder, 3 Sustainable, 4 A UR craft) |
| `handsOff` | 10 | 1 to 99 | Hands off after |

### Watering (watering.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `wellCap` | 100 | 10 to 1000 | Holds |
| `wellGround` | 50 | 0 to 1000 | The ground fills it to |
| `waterUse` | 0.1 | 0 to 1 | Tending uses |
| `waterAt` | 4 | 0 to 10 | Fetch water at |
| `g0` | −100 | −500 to 500 | Rice a seeded field grows a day at water level 0 |
| `g1` | 0 | −500 to 500 | Rice a seeded field grows a day at water level 1 |
| `g2` | 25 | −500 to 500 | Rice a seeded field grows a day at water level 2 |
| `g3` | 50 | −500 to 500 | Rice a seeded field grows a day at water level 3 |
| `g4` | 100 | −500 to 500 | Rice a seeded field grows a day at water level 4 |
| `g5` | 50 | −500 to 500 | Rice a seeded field grows a day at water level 5 |
| `g6` | 25 | −500 to 500 | Rice a seeded field grows a day at water level 6 |
| `g7` | 0 | −500 to 500 | Rice a seeded field grows a day at water level 7 |
| `g8` | −25 | −500 to 500 | Rice a seeded field grows a day at water level 8 |
| `g9` | −50 | −500 to 500 | Rice a seeded field grows a day at water level 9 |
| `g10` | −100 | −500 to 500 | Rice a seeded field grows a day at water level 10 |

### Craft (craft.html)

| Setting | Default | Range | What it is |
|---|---|---|---|
| `clothesWool` | 200 | 0 to 10000 | 衣: wool it takes |
| `clothesWood` | 100 | 0 to 10000 | 衣: timber it takes |
| `clothesEnergy` | 100 | 10 to 2000 | 衣: Power of work to make |
| `clothesWear` | 2000 | 500 to 300000 | 衣: Power of use it lasts |
| `hatWool` | 100 | 0 to 10000 | 笠: wool it takes |
| `hatWood` | 200 | 0 to 10000 | 笠: timber it takes |
| `hatEnergy` | 100 | 10 to 2000 | 笠: Power of work to make |
| `hatWear` | 2000 | 500 to 300000 | 笠: Power of use it lasts |
| `bladeStone` | 200 | 0 to 10000 | 刀: stone it takes |
| `bladeWood` | 100 | 0 to 10000 | 刀: timber it takes |
| `bladeEnergy` | 100 | 10 to 2000 | 刀: Power of work to make |
| `bladeWear` | 2000 | 500 to 300000 | 刀: Power of use it lasts |
| `forkStone` | 100 | 0 to 10000 | 叉: stone it takes |
| `forkWood` | 200 | 0 to 10000 | 叉: timber it takes |
| `forkEnergy` | 100 | 10 to 2000 | 叉: Power of work to make |
| `forkWear` | 2000 | 500 to 300000 | 叉: Power of use it lasts |
| `startBlades` | 0 | 0 to 5000 | R 刀 in store at the start |
| `startForks` | 0 | 0 to 5000 | R 叉 in store at the start |
| `startClothes` | 0 | 0 to 5000 | R 衣 in store at the start |
| `startHats` | 0 | 0 to 5000 | R 笠 in store at the start |
| `bonus1` | 20 | 0 to 500 | Tool bonus of a N 叉 or 刀, % |
| `bonus2` | 40 | 0 to 500 | Tool bonus of a R 叉 or 刀, % |
| `bonus3` | 60 | 0 to 500 | Tool bonus of a SR 叉 or 刀, % |
| `bonus4` | 80 | 0 to 500 | Tool bonus of a SSR 叉 or 刀, % |
| `bonus5` | 100 | 0 to 500 | Tool bonus of a UR 叉 or 刀, % |

## The default map

Row 0 is the top, column 0 the left; north is up, and the clouds blow from the west (left) edge.

```
.......RR.TTTTT.
..........TTTTT.
................
................
...W.HH.........
................
.PPP.FF.........
.PPP.FF.........
.PPP............
.PPP............
................
................
................
................
..............MM
..............MM
```

`H` House, `F` Farm, `P` Pasture, `T` Forest, `M` Mine, `W` Well, `R` River, `.` empty.

Steps from the nearest house to the nearest tile of each place: farm 2, pasture 4, forest 7, mine 18, well 2, river 5.

## The default Jobs table

Who may do which job (✓). Grown-ups' rows apply by sex and stage; the scholars' rows to whoever is a scholar that day.

| | 採牛奶 Milking | 伐木 Woodcutting | 採羊毛 Shearing | 採石 Quarrying | 耕田 Tending | 收割 Harvest | 紡織 Weaving | 鍛造 Forging | 生火 Fire-making | 吟詩 Poetry | 教育 Education |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 孩子 Child | ✓ |  |  |  |  |  |  |  |  |  | ✓ |
| 男人 Man | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |
| 女人 Woman | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  |  |
| 文人 (男) Scholar, man |  |  |  |  |  |  |  |  |  | ✓ | ✓ |
| 文人 (女) Scholar, woman |  |  |  |  |  |  |  |  |  | ✓ | ✓ |
| 老人 (男) Old man | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |
| 老人 (女) Old woman | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  |  |
