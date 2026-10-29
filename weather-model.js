// Weather for the Magic Scroll ecology pages: clouds blown across the map's sky, a birth-move process.
// The weather goes in spells: clear spells, when no clouds come, and cloudy spells, when clouds come in at
// the west edge at random (spawnRate an hour on average). Cloudiness is the share of time in cloudy
// spells; a clear and a cloudy spell last SPELL_CROSSINGS crossings of the sky together on average, at the
// average wind, each spell's length drawn exponentially: weather moves with the wind, so a calm season's
// spells are long (the sky you see now is likely still the same half a day later) and a windy one's short.
// Clouds blow east at the wind's speed and leave at the east edge; the sky holds at most
// MAX_CLOUDS, and a cloud due while it's full doesn't come. The Weather page (weather.html) is where it's
// set; the Clothing page's villages feel its temperatures, and its rain too (Micro mode).
//
// Wind: the same for every cloud. It holds a speed for a while (exponential, WIND_HOURS on average),
// then changes to a new one drawn from a gamma distribution with mean `wind` and standard deviation
// `windVol` (never below 0; volatility 0: always the average).
//
// With clouds coming evenly instead (the same number on average, no spells) and a steady wind, the number in the sky has an
// exact distribution: with a = the clouds that come per crossing, the share of time with n clouds is
// a^n / n! over the sum of a^k / k! for k = 0 … MAX_CLOUDS (a Poisson distribution cut off at the cap: the
// Erlang loss formula). Spells cluster the clouds, so the sky is more often clear and more often full
// than that; their distribution comes from a long simulation.
//
// Rain: with n clouds in the sky the chance it's raining is log10(n) (none with 0 or 1 cloud, certain
// with 10), and while it rains the rainfall is n. The sky keeps a rain die, an even draw in [0, 1),
// re-rolled at random (rainChange times an hour on average); it's raining whenever the die is below
// log10(n). So at every moment the chance of rain is exactly log10(n), and rain starts or stops when
// the die is re-rolled or clouds come and go, its rainfall rising and falling with them.
//
// Seasons: the year's 360 days are spring (days 1–90), summer, autumn and winter (271–360), each with its
// own set of the settings above (P below is one season's set). At a season's start its set takes over at
// once (setParams).
//
// Temperature, one a day: the season's average temp, plus the day's weather part less the season's
// average of it, plus a random part. The weather part is −(cloudCool × the day's average clouds ÷ 10 +
// rainCool × the share of the day raining): sunny days are warmest, cloudy ones cooler, rainy ones
// coolest. Taking off the season's average of it (from its long run) keeps the long-run average at temp.
// The random part carries over from day to day (TEMP_PERSIST of it) and is sized so the temperature's
// standard deviation is tempSd. Rain on a day below 0 °C falls as snow.
//
// Through the year the season's temp is the day's base, ramping in a straight line to the next season's
// over the rampDays either side of each season's start (half-way at the boundary), so the temperature
// doesn't jump overnight. The ramps pull each season's average a little toward its neighbours'.
//
// Through the day (for Micro mode later; nothing in the weather depends on it): the day's temperature
// is its average over the 24 hours, coldest at COLDEST_HOUR and warmest at WARMEST_HOUR, the warmest
// hour the day's swing above the coldest. It warms from the coldest hour to the warmest along half a
// cosine, and cools from the warmest to the next coldest along another, so the hours average the day's
// temperature exactly. The swing is the season's daily swing on a clear day; clouds hold it down: a
// full sky all day keeps 1 − SWING_CLOUD of it.
//
// Water level, 0 to 10, one for the whole year: each hour of rain (or snow) adds rainfall ÷ perLevel;
// each hour with no clouds drains sunnyDrain and each cloudy, dry hour cloudyDrain, both at level 5, and
// more above it, less below (× 1 + slope × (level − 5) ÷ 5), which pulls the level back toward the
// middle. At 0 it's a drought, at 10 a flood. The sky's state only changes at events, so between two the
// level follows a set curve (a straight line rising, an exponential draining): advance works it out
// event by event, to the exact moment it reaches 0 or 10, however the caller splits the time.
//
// The mountain above the river (川) is a reservoir with a level of its own, by the same rule and the
// same settings, but it doesn't drain while the hour's temperature is below RIVER_FREEZE (−5 °C: the river is frozen).
// While it holds any water the river runs; at 0 the river is dry.
(function () {
  const MAX_CLOUDS = 10;
  const WIND_HOURS = 3;     // how long the wind holds a speed, on average
  const SPELL_CROSSINGS = 16;   // a clear and a cloudy spell together: crossings of the sky at the average wind
  const TEMP_PERSIST = 0.6; // the share of a day's random temperature part that carries to the next
  const RAMP_DAYS = 15;     // season ramp: days each side of a season's start the base temperature ramps over
  const RAMP_LIMITS = [0, 45, 1];
  const COLDEST_HOUR = 6, WARMEST_HOUR = 15;   // clock hours (0–24) of the day's lowest and highest temperature
  const SWING_CLOUD = 0.6;  // the share of the daily swing a full sky all day takes away
  const WATER_MAX = 10, WATER_START = 5;   // the water level's top (flood) and where a year run starts it
  const RIVER_FREEZE = -5;  // °C: below it the river is frozen and the mountain doesn't drain
  // Water settings, for the whole year: rain per +1 water level (rainfall × hours); the levels an hour a
  // sunny and a cloudy, dry hour take off at level 5; and the drain slope (0: the same at every level)
  // (tuned so that about one year in ten has a drought, in summer, and about one in eight a flood, after
  // winter's blizzards, each lasting a few days; and so that about one year in 35 the drought dries the
  // river too)
  const WATER = { perLevel: 320, sunnyDrain: 0.0036, cloudyDrain: 0.0019, slope: 0.45 };
  const WATER_LIMITS = { perLevel: [10, 1000, 5], sunnyDrain: [0, 0.2, 0.0001], cloudyDrain: [0, 0.2, 0.0001], slope: [0, 1, 0.05] };
  const SEASONS = [
    { id: "spring", zh: "春", en: "Spring", feel: "Many small, light rains" },
    { id: "summer", zh: "夏", en: "Summer", feel: "Mostly sunny, the driest" },
    { id: "autumn", zh: "秋", en: "Autumn", feel: "Rainy days and sunny days by turns, windy" },
    { id: "winter", zh: "冬", en: "Winter", feel: "Calm and sunny, with the odd blizzard" },
  ];
  const SEASON_DAYS = 90;
  // Weather settings, by season. Change these to change the defaults.
  //   spawnRate   clouds an hour coming in at the west edge during a cloudy spell, on average
  //   wind        average wind speed: tiles an hour the clouds blow east
  //   windVol     wind volatility: the standard deviation of the wind's speed, tiles an hour
  //   cloudiness  % of the time in cloudy spells
  //   rainChange  rain changeability: times an hour the rain die is re-rolled, on average
  //   temp        average temperature, °C
  //   tempSd      temperature spread: the standard deviation of the day's temperature, °C
  //   cloudCool   cloud cooling: °C cooler for a day under a full sky (10 clouds) all day
  //   rainCool    rain cooling: °C cooler, on top, for a day raining all day
  //   swing       daily swing: °C from the coldest hour to the warmest on a clear day
  const TEMP = { tempSd: 5, cloudCool: 10, rainCool: 10, swing: 8 };
  const DEFAULTS = {
    spring: { spawnRate: 0.65, wind: 5.5, windVol: 1.5, cloudiness: 75, rainChange: 2.65, temp: 15, ...TEMP },   // brisk: a few clouds most of the time, many short, light showers
    summer: { spawnRate: 0.45, wind: 2.5, windVol: 1.5, cloudiness: 15, rainChange: 0.55, temp: 30, ...TEMP },   // still: long clear spells, the driest
    autumn: { spawnRate: 1.5, wind: 6, windVol: 2, cloudiness: 50, rainChange: 0.3, temp: 15, ...TEMP },         // windy: a rainy day, a sunny day, by turns
    winter: { spawnRate: 1.45, wind: 1.5, windVol: 1.5, cloudiness: 10, rainChange: 0.85, temp: -5, ...TEMP },   // calm and clear for days, but now and then a day-long blizzard that fills the sky
  };
  const LIMITS = { spawnRate: [0, 10, 0.05], wind: [0, 32, 0.5], windVol: [0, 16, 0.5], cloudiness: [0, 100, 5], rainChange: [0.05, 5, 0.05],
    temp: [-30, 45, 1], tempSd: [0, 15, 0.5], cloudCool: [0, 20, 0.5], rainCool: [0, 20, 0.5], swing: [0, 25, 0.5] };   // lowest, highest, step
  // The chance of rain with n clouds, and the rainfall while it rains
  // (a table by cloud count: there are 0 to MAX_CLOUDS)
  const RAIN_CHANCE = Array.from({ length: MAX_CLOUDS + 1 }, (_, n) => (n > 1 ? Math.log10(n) : 0));
  const rainChance = (n) => RAIN_CHANCE[n];
  // Weather v3: a set for each season, every default new, so nothing came over from v1 or v2. v4 (spring
  // and winter cloudiness 70%) keeps the rest of v3
  // v6 (water; summer's and winter's spawn rates 0.6 and 1.6) keeps the rest of v4. (v5 was a trial of
  // other defaults, since dropped; its saves aren't read.)
  const STORE_KEY = "weather-v13";
  try {
    if (!localStorage.getItem("weather-v6")) {
      const v4 = JSON.parse(localStorage.getItem("weather-v4") || "null");
      const v3 = !v4 && JSON.parse(localStorage.getItem("weather-v3") || "null");
      if (v3 && typeof v3 === "object") for (const id of ["spring", "winter"]) if (v3[id] && typeof v3[id] === "object") delete v3[id].cloudiness;
      const old = v4 || v3;
      if (old && typeof old === "object") {
        for (const id of ["summer", "winter"]) if (old[id] && typeof old[id] === "object") delete old[id].spawnRate;
        localStorage.setItem("weather-v6", JSON.stringify(old));
      }
    }
  } catch (e) {}
  // v7 (the drain slope, and new water defaults) keeps the rest of v6
  try {
    if (!localStorage.getItem("weather-v7")) {
      const v6 = JSON.parse(localStorage.getItem("weather-v6") || "null");
      if (v6 && typeof v6 === "object") { delete v6.water; localStorage.setItem("weather-v7", JSON.stringify(v6)); }
    }
  } catch (e) {}
  // v8 (each season's spell length, and new water defaults to match) keeps the rest of v7
  try {
    if (!localStorage.getItem("weather-v8")) {
      const v7 = JSON.parse(localStorage.getItem("weather-v7") || "null");
      if (v7 && typeof v7 === "object") { delete v7.water; localStorage.setItem("weather-v8", JSON.stringify(v7)); }
    }
  } catch (e) {}
  // v9 (every season's daily swing 5 °C) keeps the rest of v8
  try {
    if (!localStorage.getItem("weather-v9")) {
      const v8 = JSON.parse(localStorage.getItem("weather-v8") || "null");
      if (v8 && typeof v8 === "object") { for (const { id } of SEASONS) if (v8[id] && typeof v8[id] === "object") delete v8[id].swing; localStorage.setItem("weather-v9", JSON.stringify(v8)); }
    }
  } catch (e) {}
  // v10 (a lighter winter: spawn rate 1, wind volatility 1, cloudiness 80%; new water defaults to match)
  // keeps the rest of v9
  try {
    if (!localStorage.getItem("weather-v10")) {
      const v9 = JSON.parse(localStorage.getItem("weather-v9") || "null");
      if (v9 && typeof v9 === "object") {
        if (v9.winter && typeof v9.winter === "object") for (const k of ["spawnRate", "windVol", "cloudiness"]) delete v9.winter[k];
        delete v9.water;
        localStorage.setItem("weather-v10", JSON.stringify(v9));
      }
    }
  } catch (e) {}
  // v11 (each season's clouds and rain new: blizzards in winter, light showers in spring, the driest summer,
  // autumn's rainy and sunny days by turns; new water defaults to match) keeps the temperatures of v10
  try {
    if (!localStorage.getItem("weather-v11")) {
      const v10 = JSON.parse(localStorage.getItem("weather-v10") || "null");
      if (v10 && typeof v10 === "object") {
        for (const { id } of SEASONS) if (v10[id] && typeof v10[id] === "object") for (const k of ["spawnRate", "wind", "windVol", "cloudiness", "spell", "rainChange"]) delete v10[id][k];
        delete v10.water;
        localStorage.setItem("weather-v11", JSON.stringify(v10));
      }
    }
  } catch (e) {}
  // v12 (every season's daily swing 8 °C) keeps the rest of v11
  try {
    if (!localStorage.getItem("weather-v12")) {
      const v11 = JSON.parse(localStorage.getItem("weather-v11") || "null");
      if (v11 && typeof v11 === "object") { for (const { id } of SEASONS) if (v11[id] && typeof v11[id] === "object") delete v11[id].swing; localStorage.setItem("weather-v12", JSON.stringify(v11)); }
    }
  } catch (e) {}
  // v13 (no spell length: spells go by the wind; each season's clouds and rain retuned to keep its
  // character, and new water defaults to match) keeps the temperatures of v12
  try {
    if (!localStorage.getItem("weather-v13")) {
      const v12 = JSON.parse(localStorage.getItem("weather-v12") || "null");
      if (v12 && typeof v12 === "object") {
        for (const { id } of SEASONS) if (v12[id] && typeof v12[id] === "object") for (const k of ["spawnRate", "wind", "windVol", "cloudiness", "spell", "rainChange"]) delete v12[id][k];
        delete v12.water;
        localStorage.setItem("weather-v13", JSON.stringify(v12));
      }
    }
  } catch (e) {}
  // The season of a day (1, 2, …): its index in SEASONS
  const seasonOf = (day) => Math.floor((((day - 1) % (SEASONS.length * SEASON_DAYS)) + SEASONS.length * SEASON_DAYS) % (SEASONS.length * SEASON_DAYS) / SEASON_DAYS);

  const width = () => (window.MapModel ? MapModel.W : 16);
  const share = (P) => P.cloudiness / 100;
  // Hours a cloud takes to cross the sky at the average wind (Infinity with no wind)
  const crossHours = (P) => (P.wind > 0 ? width() / P.wind : Infinity);
  // Clouds an hour, on average over clear and cloudy spells
  const meanRate = (P) => P.spawnRate * share(P);
  // Clouds that come per crossing, on average
  const loadOf = (P) => (meanRate(P) > 0 ? meanRate(P) * crossHours(P) : 0);
  // Average hours of a clear and a cloudy spell together (SPELL_CROSSINGS crossings; Infinity with no
  // wind), and of a cloudy and of a clear spell
  const spellOf = (P) => SPELL_CROSSINGS * crossHours(P);
  const spellHours = (P) => ({ cloudy: spellOf(P) * share(P), clear: spellOf(P) * (1 - share(P)) });

  // The share of time with 0 … MAX_CLOUDS clouds if the same clouds came evenly (no spells)
  function evenDistribution(P) {
    const a = loadOf(P), out = new Array(MAX_CLOUDS + 1).fill(0);
    if (!isFinite(a)) { out[MAX_CLOUDS] = 1; return out; }   // no wind: the sky fills and stays full
    let term = 1, sum = 0;
    for (let n = 0; n <= MAX_CLOUDS; n++) { out[n] = term; sum += term; term *= a / (n + 1); }
    return out.map((v) => v / sum);
  }
  const meanOf = (dist) => dist.reduce((s, p, n) => s + n * p, 0);

  // A sky in its long-run state: clouds [{ x, y, size }] in tiles (x from the west edge, 0 to the map's
  // width; y down the map), the spell (cloudy or not, and the hours it has left), the rain die (on its own
  // dice, so the clouds are the same whatever the rain's settings) and the hours to its next re-roll, the
  // hours gone by, and the clouds that came and that didn't (sky full)
  function newSky(P, rand) {
    const W = width(), q = share(P), rrand = HerdModel.rng((rand() * 2 ** 32) >>> 0), wrand = HerdModel.rng((rand() * 2 ** 32) >>> 0);
    const sky = { P, rand, rrand, wrand, t: 0, clouds: [], came: 0, lost: 0, next: Infinity, cloudy: rand() < q, spellLeft: 0, die: rrand(), roll: 0, v: 0, gustLeft: 0 };
    sky.roll = rollGap(sky);
    sky.spellLeft = spellLength(sky);
    sky.v = windDraw(sky); sky.gustLeft = windHold(sky);
    if (sky.cloudy) sky.next = gap(sky);
    if (!(P.wind > 0) || (q >= 1 && !(P.windVol > 0))) {
      // No wind, or no spells and a steady wind: the even distribution is exact; the clouds spread evenly across the sky
      const dist = q > 0 ? evenDistribution(P) : [1];
      let u = rand(), n = 0;
      while (n < dist.length - 1 && u >= dist[n]) { u -= dist[n]; n++; }
      for (let k = 0; k < n; k++) sky.clouds.push(cloudAt(sky, rand() * W));
      sky.clouds.sort((a, b) => b.x - a.x);   // furthest east first: the order they leave in
    } else {
      // Otherwise warm up from an empty sky until no trace of the start is left, then count from there
      advance(sky, 5 * (crossHours(P) + spellOf(P) + WIND_HOURS));
      Object.assign(sky, { t: 0, came: 0, lost: 0 });
    }
    return sky;
  }
  const cloudAt = (sky, x) => ({ x, y: 0.5 + sky.rand() * (MapModel.H - 1), size: 0.8 + sky.rand() * 0.5 });
  // Hours to the next cloud due in a cloudy spell (exponential, mean 1 ÷ spawnRate)
  const gap = (sky) => (sky.P.spawnRate > 0 ? -Math.log(1 - sky.rand()) / sky.P.spawnRate : Infinity);
  // A new spell's length (exponential, by its average); none ends with cloudiness 0 or 100%
  const spellLength = (sky) => {
    const q = share(sky.P);
    if (q <= 0 || q >= 1) return Infinity;
    return -Math.log(1 - sky.rand()) * (sky.cloudy ? spellHours(sky.P).cloudy : spellHours(sky.P).clear);
  };
  // A standard normal draw (Box–Muller), and a gamma draw of shape k, scale 1 (Marsaglia–Tsang)
  const normal = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  function gammaDraw(k, rand) {
    if (k < 1) return gammaDraw(k + 1, rand) * Math.pow(rand(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    while (true) {
      let x, v;
      do { x = normal(rand); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rand();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  // A new wind speed: gamma with the average and volatility as mean and standard deviation
  const windDraw = (sky) => {
    const m = sky.P.wind, s = sky.P.windVol;
    if (!(m > 0)) return 0;
    if (!(s > 0)) return m;
    return gammaDraw((m / s) ** 2, sky.wrand) * (s * s) / m;
  };
  // Hours the wind holds its speed (exponential, mean WIND_HOURS); for good with no volatility
  const windHold = (sky) => (sky.P.wind > 0 && sky.P.windVol > 0 ? -Math.log(1 - sky.wrand()) * WIND_HOURS : Infinity);
  // Hours to the rain die's next re-roll (exponential, mean 1 ÷ rainChange)
  const rollGap = (sky) => -Math.log(1 - sky.rrand()) / sky.P.rainChange;
  // The rainfall now: the number of clouds while it rains, else 0
  const rainfall = (sky) => (sky.die < rainChance(sky.clouds.length) ? sky.clouds.length : 0);
  // Moves the sky on by dt hours; onEvent(t, n, cloudy, rain, v) hears every cloud coming, leaving or
  // turned away, every change of spell or wind and every re-roll, with the clouds, the rainfall and the
  // wind after it
  // A water level w (the settings, level, and hours at 0 and 10 so far) over dt hours of unchanged sky,
  // rainfall r, sunny or not, stopping at 0 or 10; drain false: it doesn't drain. Rain: up rainfall ÷
  // perLevel an hour, a straight line. Dry: down base × (1 + slope (L − 5) ÷ 5) an hour = a + bL, so
  // L(t) = (L₀ + a/b) e^(−bt) − a/b, reaching 0 after ln((L₀ + a/b) ÷ (a/b)) ÷ b hours (a straight line
  // when b = 0)
  function flowLevel(w, dt, r, sunny, drain = true) {
    if (!(dt > 0)) return;
    let L = w.level, t = dt;
    if (r > 0) {
      const k = r / w.perLevel;
      if (L < WATER_MAX) { const hit = (WATER_MAX - L) / k; if (hit < t) { L = WATER_MAX; t -= hit; } else { L += k * t; t = 0; } }
    } else {
      const base = !drain ? 0 : sunny ? w.sunnyDrain : w.cloudyDrain, s = w.slope || 0;
      const a = base * (1 - s), b = (base * s) / (WATER_MAX / 2);
      if (L > 0 && base > 0) {
        if (b > 0) {
          const c = a / b, hit = a > 0 ? Math.log((L + c) / c) / b : Infinity;
          if (hit < t) { L = 0; t -= hit; } else { L = Math.max(0, (L + c) * Math.exp(-b * t) - c); t = 0; }
        } else { const hit = L / a; if (hit < t) { L = 0; t -= hit; } else { L -= a * t; t = 0; } }
      } else if (L > 0) t = 0;   // no drain
    }
    if (t > 0) { if (L >= WATER_MAX) w.flood += t; else if (L <= 0) w.drought += t; }   // the rest of the time, at a bound
    w.level = L;
  }
  // The water level (sky.water; none: nothing to do) over dt hours of unchanged sky
  const flowWater = (sky, dt) => { if (sky.water) flowLevel(sky.water, dt, rainfall(sky), sky.clouds.length === 0); };
  // The mountain's level m over a day: segs, its sky from clock hour 0 ([hours, rainfall, sunny, …]); it
  // drains only in the hours at RIVER_FREEZE or above, by the day's temperature and swing (worked out as 0
  // for the day RIVER_FREEZE warmer). hourTemp is temp + swing × f ÷ 2, f = −cos(π(h − lo) ÷ warm) warming
  // from the coldest hour lo to the warmest hi, then cos(π(h − hi) ÷ cool) cooling to the next lo: it
  // crosses 0 where f = −2 × temp ÷ swing, once warming and once cooling, if that's strictly between −1 and 1
  function flowMountain(m, segs, temp0, swing) {
    const temp = temp0 - RIVER_FREEZE, cuts = [], c = swing > 0 ? (-2 * temp) / swing : Infinity;
    if (Math.abs(c) < 1) {
      const lo = COLDEST_HOUR, hi = WARMEST_HOUR, warm = hi - lo, cool = 24 - warm, down = hi + (cool * Math.acos(c)) / Math.PI;
      cuts.push(lo + (warm * Math.acos(-c)) / Math.PI, down >= 24 ? down - 24 : down);
      cuts.sort((a, b) => a - b);
    }
    // Whether it thaws, as hourTemp says, between the two crossings and outside them (or all day, without)
    const two = cuts.length === 2, thawIn = hourTemp(temp, swing, two ? (cuts[0] + cuts[1]) / 2 : 12) >= 0;
    const thawOut = two ? hourTemp(temp, swing, ((cuts[0] + cuts[1] + 24) / 2) % 24) >= 0 : thawIn;
    const thaws = (t) => (two && t > cuts[0] && t < cuts[1] ? thawIn : thawOut);
    let h = 0;
    for (let i = 0; i < segs.length; i += 3) {
      const end = h + segs[i];
      for (const c of cuts) if (c > h && c < end) { flowLevel(m, c - h, segs[i + 1], segs[i + 2], thaws((h + c) / 2)); h = c; }
      flowLevel(m, end - h, segs[i + 1], segs[i + 2], thaws((h + end) / 2)); h = end;
    }
  }
  function advance(sky, dt, onEvent) {
    const W = width(), end = sky.t + dt;
    while (true) {
      // The next event: the furthest-east cloud leaving, the next cloud due, the spell ending, the wind
      // changing, or a re-roll
      const v = sky.v, first = sky.clouds[0], leave = first && v > 0 ? sky.t + (W - first.x) / v : Infinity;
      const due = sky.t + sky.next, turn = sky.t + sky.spellLeft, gust = sky.t + sky.gustLeft, roll = sky.t + sky.roll;
      const at = Math.min(leave, due, turn, gust, roll);
      if (at > end) break;
      const step = at - sky.t;
      flowWater(sky, step);
      for (const c of sky.clouds) c.x += v * step;
      sky.next -= step; sky.spellLeft -= step; sky.gustLeft -= step; sky.roll -= step; sky.t = at;
      if (at === leave) sky.clouds.shift();
      else if (at === due) {
        if (sky.clouds.length < MAX_CLOUDS) { sky.clouds.push(cloudAt(sky, 0)); sky.came++; } else sky.lost++;
        sky.next = gap(sky);
      } else if (at === turn) {
        sky.cloudy = !sky.cloudy;
        sky.spellLeft = spellLength(sky);
        sky.next = sky.cloudy ? gap(sky) : Infinity;
      } else if (at === gust) {
        sky.v = windDraw(sky);
        sky.gustLeft = windHold(sky);
      } else {
        sky.die = sky.rrand();
        sky.roll = rollGap(sky);
      }
      if (onEvent) onEvent(sky.t, sky.clouds.length, sky.cloudy, rainfall(sky), sky.v);
    }
    const step = end - sky.t;
    flowWater(sky, step);
    for (const c of sky.clouds) c.x += sky.v * step;
    if (isFinite(sky.next)) sky.next -= step;
    if (isFinite(sky.spellLeft)) sky.spellLeft -= step;
    if (isFinite(sky.gustLeft)) sky.gustLeft -= step;
    sky.roll -= step;
    sky.t = end;
  }

  // ---------- Temperature ----------
  // A day's weather part: −(cloudCool × average clouds ÷ 10 + rainCool × the share of the day raining)
  const weatherPart = (P, d) => -(P.cloudCool * (d.clouds / MAX_CLOUDS) + P.rainCool * (d.wet / 24));
  // A day's type, by what most of its hours were: sunny (no clouds), cloudy (clouds, no rain) or wet
  // (raining or snowing); a tie goes to the wetter
  const dayType = (d) => { const cloudy = 24 - d.sun - d.wet; return d.wet >= cloudy && d.wet >= d.sun ? "wet" : cloudy >= d.sun ? "cloudy" : "sunny"; };
  // A season's temperature figures from its days' weather ([{ clouds, wet }]): the weather part's average
  // (ex) and the random part's size (noise), so the spread comes out at tempSd
  function tempStats(P, days) {
    let s = 0, s2 = 0;
    for (const d of days) { const x = weatherPart(P, d); s += x; s2 += x * x; }
    const ex = days.length ? s / days.length : 0, vx = days.length ? Math.max(0, s2 / days.length - ex * ex) : 0;
    return { ex, noise: Math.sqrt(Math.max(0, P.tempSd * P.tempSd - vx)) };
  }
  // The random part, day to day: u ← TEMP_PERSIST × u + √(1 − TEMP_PERSIST²) × a standard normal draw
  // (standard deviation 1 throughout)
  const nextU = (u, rand) => TEMP_PERSIST * u + Math.sqrt(1 - TEMP_PERSIST * TEMP_PERSIST) * normal(rand);
  // A day's temperature
  const tempOf = (P, stats, d, u, base = P.temp) => base + weatherPart(P, d) - stats.ex + stats.noise * u;
  // A day's base temperature through the year (day 1, 2, …): its season's temp, ramping to the season's
  // before or after within sets.rampDays of a boundary
  function baseTemp(sets, day) {
    const k = seasonOf(day), mu = (j) => sets[SEASONS[(j + SEASONS.length) % SEASONS.length].id].temp, h = sets.rampDays || 0;
    const pos = ((((day - 1) % (SEASONS.length * SEASON_DAYS)) + SEASONS.length * SEASON_DAYS) % (SEASONS.length * SEASON_DAYS)) - k * SEASON_DAYS + 0.5;
    if (pos < h) return mu(k) + ((mu(k - 1) - mu(k)) * (h - pos)) / (2 * h);
    if (pos > SEASON_DAYS - h) return mu(k) + ((mu(k + 1) - mu(k)) * (pos - (SEASON_DAYS - h))) / (2 * h);
    return mu(k);
  }
  // A day's swing, held down by its clouds (its average over the day)
  const daySwing = (P, d) => P.swing * (1 - (SWING_CLOUD * d.clouds) / MAX_CLOUDS);
  // The temperature at clock hour h (0–24) of a day whose temperature is temp and swing is swing
  const WARM_HOURS = WARMEST_HOUR - COLDEST_HOUR, COOL_HOURS = 24 - WARM_HOURS;
  function hourTemp(temp, swing, h) {
    const f = h >= COLDEST_HOUR && h <= WARMEST_HOUR ? -Math.cos((Math.PI * (h - COLDEST_HOUR)) / WARM_HOURS) : Math.cos((Math.PI * ((h - WARMEST_HOUR + 24) % 24)) / COOL_HOURS);
    return temp + (swing * f) / 2;
  }
  // Each season's average base temperature through the year, ramps and all (the weather and random
  // parts average 0), in SEASONS order
  const seasonAverages = (sets) => SEASONS.map((s, k) => {
    let t = 0;
    for (let d = 1; d <= SEASON_DAYS; d++) t += baseTemp(sets, k * SEASON_DAYS + d);
    return t / SEASON_DAYS;
  });

  // Each day's weather over a run: wraps an onEvent, tallying [{ clouds (average), sun (hours with no
  // clouds), wet (hours raining), rain (rainfall × hours) }] for each whole day from the sky's start
  function dayTally(sky) {
    const days = [];
    let cur = { clouds: 0, sun: 0, wet: 0, rain: 0 }, dayEnd = sky.t + 24, last = sky.t, n = sky.clouds.length, r = rainfall(sky);
    const put = (t0, t1) => { const dt = t1 - t0; cur.clouds += (n * dt) / 24; if (n === 0) cur.sun += dt; if (r > 0) cur.wet += dt; cur.rain += r * dt; };
    const to = (t) => {
      while (t >= dayEnd - 1e-9) { put(last, dayEnd); days.push(cur); cur = { clouds: 0, sun: 0, wet: 0, rain: 0 }; last = dayEnd; dayEnd += 24; }
      put(last, t); last = t;
    };
    return { days, to, set: (m, rain) => { n = m; r = rain; } };
  }

  // A new season's set takes over at once: a fresh wind, and fresh times to the next cloud, the spell's
  // end, the wind's change and the re-roll (all memoryless, so nothing else changes); the clouds, the
  // spell and the rain die stay
  function setParams(sky, P) {
    sky.P = P;
    sky.next = sky.cloudy ? gap(sky) : Infinity;
    sky.spellLeft = spellLength(sky);
    sky.v = windDraw(sky); sky.gustLeft = windHold(sky);
    sky.roll = rollGap(sky);
  }

  // One year through the seasons (sets: by season id, and rampDays), from a sky warmed up on spring's: each
  // day's rain (rainfall × hours, summed), hours raining, average clouds, average wind, base temperature,
  // temperature and swing through the day, and whether it snowed ([{ rain, wet, clouds, wind, base, temp, swing, snow }]). stats: each season's tempStats, from its long run
  // (a season without them gets no temperatures)
  // years: that many years in a row (the days of all of them); water: the water settings (sets.water by
  // default), each day also giving the level at its end and its hours of drought and of flood, and the
  // mountain's level at its start and end (mountain0, mountain) and its hours with the river dry (riverDry;
  // with no temperatures, the base temperature's hours freeze the mountain), and whether the river runs
  // that day (river: the mountain held water at the day's start). hourly: each
  // day also gives its rainfall through the day, rainAt: [hour, rainfall, hour, rainfall, …] from hour 0, a
  // pair at each change (rainAtHour reads it); it takes no dice, so the weather is the same either way
  function simulateYear(sets, seed, stats, years = 1, water = sets.water, hourly = false) {
    const sky = newSky(sets[SEASONS[0].id], HerdModel.rng(seed)), days = [], trand = HerdModel.rng(seed + 7777);
    if (water) sky.water = { ...water, level: WATER_START, drought: 0, flood: 0 };
    const mtn = water ? { ...water, level: WATER_START, drought: 0, flood: 0 } : null;
    let u = normal(trand);
    let n = sky.clouds.length, r = rainfall(sky), w = sky.v, last = 0, d = null, segs = [];
    const add = (t) => { const dt = t - last; d.rain += r * dt; if (r > 0) d.wet += dt; if (n === 0) d.sun += dt; d.clouds += (n * dt) / 24; d.wind += (w * dt) / 24; if (mtn) segs.push(dt, r, n === 0); last = t; };
    for (let day = 1; day <= years * SEASONS.length * SEASON_DAYS; day++) {
      if (day > 1 && seasonOf(day) !== seasonOf(day - 1)) { setParams(sky, sets[SEASONS[seasonOf(day)].id]); w = sky.v; }
      d = { rain: 0, wet: 0, sun: 0, clouds: 0, wind: 0 }; last = sky.t; segs = [];
      const wd = sky.water ? sky.water.drought : 0, wf = sky.water ? sky.water.flood : 0, t0 = sky.t;
      if (hourly) d.rainAt = [0, r];
      advance(sky, 24, (t, m, cloudy, rain, v) => { add(t); if (hourly && rain !== r) d.rainAt.push(t - t0, rain); n = m; r = rain; w = v; });
      add(sky.t);
      if (sky.water) { d.water = sky.water.level; d.drought = sky.water.drought - wd; d.flood = sky.water.flood - wf; }
      const id = SEASONS[seasonOf(day)].id, st = stats && stats[id];
      d.base = baseTemp(sets, day);
      d.temp = st ? tempOf(sets[id], st, d, u, d.base) : NaN;
      d.swing = daySwing(sets[id], d);
      d.snow = d.wet > 0 && d.temp < 0;
      if (mtn) {
        const m0 = mtn.drought;
        d.mountain0 = mtn.level; d.river = mtn.level > 0;
        flowMountain(mtn, segs, isFinite(d.temp) ? d.temp : d.base, d.swing);
        d.mountain = mtn.level; d.riverDry = mtn.drought - m0;
      }
      u = nextU(u, trand);
      days.push(d);
    }
    return days;
  }

  // The rainfall at clock hour h (0–24) of a day, from its rainAt
  const rainAtHour = (rainAt, h) => { let r = rainAt[1]; for (let i = 2; i < rainAt.length && rainAt[i] <= h; i += 2) r = rainAt[i + 1]; return r; };
  // When a fire lit at clock hour t0 that burns hours when dry goes out: rain at level R burns it (R ÷ 10)²
  // faster, the work's cut (it lasts hours × (1 − (R ÷ 10)²) in a steady rain; at 10 it's out at once); the
  // day's last rain holds on after its last change
  function fireOut(rainAt, t0, hours) {
    let fuel = hours;
    for (let i = 0; i < rainAt.length; i += 2) {
      const a = Math.max(t0, rainAt[i]), b = i + 2 < rainAt.length ? rainAt[i + 2] : Infinity;
      if (b <= t0) continue;
      const keep = 1 - (rainAt[i + 1] / 10) ** 2;   // hours of fuel an hour burns: 1 ÷ keep
      if (keep <= 0) return a;
      if (fuel <= (b - a) / keep) return a + fuel * keep;
      fuel -= (b - a) / keep;
    }
    return t0 + fuel;
  }

  // Droughts and floods over a long run of years in a row (the first one only to settle the level): the
  // share of time at 0 and at 10, overall and by season; the share of years with any; how many a year and
  // how long they last (a run of days with some), and the share of time at each level (0–1, …, 9–10). The
  // same for the river running dry (riverDry: the mountain at 0), and the share of years with a drought
  // and the river dry (bothYears: the river can only run dry in a drought, the mountain never being
  // lower than the land)
  function waterRun(sets, seed, stats, years, water = sets.water) {
    const D = SEASONS.length * SEASON_DAYS, days = simulateYear(sets, seed, stats, years + 1, water).slice(D);
    const out = { drought: 0, flood: 0, riverDry: 0, bySeason: SEASONS.map(() => ({ drought: 0, flood: 0, riverDry: 0 })), droughtYears: 0, floodYears: 0, riverDryYears: 0, bothYears: 0, levels: new Array(WATER_MAX).fill(0) };
    const runs = { drought: [], flood: [], riverDry: [] };
    for (const kind of ["drought", "flood", "riverDry"]) {
      let len = 0;
      for (let i = 0; i <= days.length; i++) {
        if (i < days.length && days[i][kind] > 0) len++;
        else if (len) { runs[kind].push(len); len = 0; }
      }
    }
    days.forEach((d, i) => {
      out.drought += d.drought / 24; out.flood += d.flood / 24; out.riverDry += d.riverDry / 24;
      const b = out.bySeason[Math.floor((i % D) / SEASON_DAYS)]; b.drought += d.drought / 24; b.flood += d.flood / 24; b.riverDry += d.riverDry / 24;
      out.levels[Math.min(WATER_MAX - 1, Math.floor(d.water))]++;
    });
    for (let y = 0; y < years; y++) {
      const yd = days.slice(y * D, (y + 1) * D);
      if (yd.some((d) => d.drought > 0)) out.droughtYears++;
      if (yd.some((d) => d.flood > 0)) out.floodYears++;
      if (yd.some((d) => d.riverDry > 0)) out.riverDryYears++;
      if (yd.some((d) => d.drought > 0) && yd.some((d) => d.riverDry > 0)) out.bothYears++;
    }
    const n = days.length;
    out.drought /= n; out.flood /= n; out.riverDry /= n; out.droughtYears /= years; out.floodYears /= years; out.riverDryYears /= years; out.bothYears /= years;
    for (const b of out.bySeason) { b.drought /= years * SEASON_DAYS; b.flood /= years * SEASON_DAYS; b.riverDry /= years * SEASON_DAYS; }
    out.levels = out.levels.map((c) => c / n);
    for (const kind of ["drought", "flood", "riverDry"]) { const r = runs[kind]; out[kind + "Spells"] = r.length / years; out[kind + "Days"] = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0; }
    out.years = years;
    return out;
  }

  // A long run: the share of time at each count and at each rainfall, the clouds that came and didn't,
  // the times it started raining and stopped, the average wind, the steps of the count, the rainfall and
  // the wind over the first showHours hours ([[t, n, rain, v]]) and the cloudy spells in them ([[from, to]]),
  // and how steady the sky is: of the hours with clouds, the share with clouds LAG_HOURS later too, and
  // of the clear hours, the share still clear (steady: { cloudy, clear })
  const LAG_HOURS = 12;
  function simulate(P, hours, seed, showHours) {
    const sky = newSky(P, HerdModel.rng(seed)), time = new Array(MAX_CLOUDS + 1).fill(0), rainTime = new Array(MAX_CLOUDS + 1).fill(0), spells = [];
    let last = 0, n = sky.clouds.length, r = rainfall(sky), w = sky.v, windSum = 0, from = sky.cloudy ? 0 : null, starts = 0, stops = 0;
    const steps = [[0, n, r, w]], tally = dayTally(sky), hourly = new Uint8Array(Math.floor(hours) + 1);
    let hour = 0;
    const hoursTo = (t) => { for (; hour <= t && hour < hourly.length; hour++) hourly[hour] = n > 0 ? 1 : 0; };
    advance(sky, hours, (t, m, cloudy, rain, v) => {
      tally.to(sky.t); tally.set(m, rain); hoursTo(t);
      time[n] += t - last; rainTime[r] += t - last; windSum += w * (t - last); last = t;
      if (rain > 0 && r === 0) starts++;
      if (rain === 0 && r > 0) stops++;
      if (t <= showHours) {
        if (m !== n || rain !== r || v !== w) steps.push([t, m, rain, v]);
        if (cloudy && from === null) from = t;
        if (!cloudy && from !== null) { spells.push([from, t]); from = null; }
      }
      n = m; r = rain; w = v;
    });
    time[n] += hours - last; rainTime[r] += hours - last; windSum += w * (hours - last);
    tally.to(sky.t); hoursTo(hours);
    const same = [0, 0], of = [0, 0];
    for (let k = 0; k + LAG_HOURS < hourly.length; k++) { const a = hourly[k]; of[a]++; if (hourly[k + LAG_HOURS] === a) same[a]++; }
    const steady = { cloudy: of[1] ? same[1] / of[1] : NaN, clear: of[0] ? same[0] / of[0] : NaN };
    if (from !== null) spells.push([from, showHours]);
    // Temperatures: the season's figures from these days, then each day's, on their own dice
    const stats = tempStats(P, tally.days), trand = HerdModel.rng(seed + 7777), types = { sunny: [0, 0], cloudy: [0, 0], wet: [0, 0] };
    let u = normal(trand), ts = 0, ts2 = 0, snow = 0, frost = 0;
    for (const d of tally.days) {
      const T = tempOf(P, stats, d, u);
      ts += T; ts2 += T * T; if (T < 0) { frost++; if (d.wet > 0) snow++; }
      const ty = types[dayType(d)]; ty[0]++; ty[1] += T;
      u = nextU(u, trand);
    }
    const nd = tally.days.length, tm = nd ? ts / nd : NaN;
    const temp = { stats, mean: tm, sd: nd ? Math.sqrt(Math.max(0, ts2 / nd - tm * tm)) : NaN, frost: nd ? frost / nd : 0, snow: nd ? snow / nd : 0,
      types: Object.fromEntries(Object.entries(types).map(([k, [c, s]]) => [k, { share: nd ? c / nd : 0, mean: c ? s / c : NaN }])) };
    return { share: time.map((v) => v / hours), rain: rainTime.map((v) => v / hours), came: sky.came, lost: sky.lost, starts, stops, wind: windSum / hours, hours, steps, spells, temp, steady };
  }

  // A fresh copy of the default sets, with the season ramp
  const defaultSets = () => ({ ...Object.fromEntries(SEASONS.map(({ id }) => [id, { ...DEFAULTS[id] }])), rampDays: RAMP_DAYS, water: { ...WATER } });
  // The saved sets (each field held to its limits), or the defaults
  function savedParams() {
    const sets = defaultSets();
    try {
      const a = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (a && typeof a === "object") for (const { id } of SEASONS) {
        const s = a[id];
        if (s && typeof s === "object") for (const [k, [lo, hi]] of Object.entries(LIMITS)) { const v = Number(s[k]); if (k in s && isFinite(v)) sets[id][k] = Math.min(hi, Math.max(lo, v)); }
      }
      const r = Number(a && a.rampDays);
      if (a && "rampDays" in a && isFinite(r)) sets.rampDays = Math.min(RAMP_LIMITS[1], Math.max(RAMP_LIMITS[0], r));
      if (a && a.water && typeof a.water === "object") for (const [k, [lo, hi]] of Object.entries(WATER_LIMITS)) { const v = Number(a.water[k]); if (k in a.water && isFinite(v)) sets.water[k] = Math.min(hi, Math.max(lo, v)); }
    } catch (e) {}
    return sets;
  }

  window.WeatherModel = { MAX_CLOUDS, LAG_HOURS, WIND_HOURS, SEASONS, SEASON_DAYS, seasonOf, DEFAULTS, defaultSets, LIMITS, STORE_KEY, SPELL_CROSSINGS, crossHours, meanRate, loadOf, spellOf, spellHours, windDraw, rainChance, rainfall, evenDistribution, meanOf, newSky, advance, setParams, simulate, simulateYear, savedParams, TEMP_PERSIST, RAMP_DAYS, RAMP_LIMITS, WATER_MAX, WATER_START, RIVER_FREEZE, WATER, WATER_LIMITS, flowWater, waterRun, baseTemp, seasonAverages, weatherPart, dayType, tempOf, nextU, normal, COLDEST_HOUR, WARMEST_HOUR, SWING_CLOUD, daySwing, hourTemp, rainAtHour, fireOut };
})();
