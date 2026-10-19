// Weather for the Magic Scroll ecology pages: clouds blown across the map's sky, a birth-move process.
// The weather goes in spells: clear spells, when no clouds come, and cloudy spells, when clouds come in at
// the west edge at random (spawnRate an hour on average). Cloudiness is the share of time in cloudy
// spells; a clear and a cloudy spell last SPELL_HOURS together on average, each spell's length drawn
// exponentially. Clouds blow east at the wind's speed and leave at the east edge; the sky holds at most
// MAX_CLOUDS, and a cloud due while it's full doesn't come. The Weather page (weather.html) is where it's
// set; nothing else uses it yet.
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
(function () {
  const MAX_CLOUDS = 10;
  const SPELL_HOURS = 24;   // a clear spell and a cloudy spell together, on average
  const WIND_HOURS = 3;     // how long the wind holds a speed, on average
  const TEMP_PERSIST = 0.6; // the share of a day's random temperature part that carries to the next
  const RAMP_DAYS = 15;     // season ramp: days each side of a season's start the base temperature ramps over
  const RAMP_LIMITS = [0, 45, 1];
  const SEASONS = [
    { id: "spring", zh: "春", en: "Spring", feel: "Many light rains, fairly calm" },
    { id: "summer", zh: "夏", en: "Summer", feel: "Mostly dry and calm" },
    { id: "autumn", zh: "秋", en: "Autumn", feel: "Dry spells and medium rains, windy" },
    { id: "winter", zh: "冬", en: "Winter", feel: "Rainy and windy" },
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
  const TEMP = { tempSd: 5, cloudCool: 10, rainCool: 10 };
  const DEFAULTS = {
    spring: { spawnRate: 0.45, wind: 3, windVol: 0.5, cloudiness: 70, rainChange: 2, temp: 15, ...TEMP },     // steady modest clouds, short showers
    summer: { spawnRate: 0.5, wind: 2.5, windVol: 1, cloudiness: 25, rainChange: 0.5, temp: 30, ...TEMP },    // long clear spells
    autumn: { spawnRate: 1.8, wind: 7, windVol: 2, cloudiness: 40, rainChange: 0.2, temp: 15, ...TEMP },      // clear spells, then fronts of medium rain
    winter: { spawnRate: 3, wind: 7, windVol: 3, cloudiness: 70, rainChange: 0.3, temp: -5, ...TEMP },        // full, gusty skies
  };
  const LIMITS = { spawnRate: [0, 10, 0.1], wind: [0, 32, 0.5], windVol: [0, 16, 0.5], cloudiness: [0, 100, 5], rainChange: [0.05, 5, 0.05],
    temp: [-30, 45, 1], tempSd: [0, 15, 0.5], cloudCool: [0, 20, 0.5], rainCool: [0, 20, 0.5] };   // lowest, highest, step
  // The chance of rain with n clouds, and the rainfall while it rains
  const rainChance = (n) => (n > 1 ? Math.log10(n) : 0);
  // Weather v3: a set for each season, every default new, so nothing came over from v1 or v2. v4 (spring
  // and winter cloudiness 70%) keeps the rest of v3
  const STORE_KEY = "weather-v4";
  try {
    const v3 = !localStorage.getItem(STORE_KEY) && JSON.parse(localStorage.getItem("weather-v3") || "null");
    if (v3 && typeof v3 === "object") {
      for (const id of ["spring", "winter"]) if (v3[id] && typeof v3[id] === "object") delete v3[id].cloudiness;
      localStorage.setItem(STORE_KEY, JSON.stringify(v3));
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
  // Average hours of a cloudy and of a clear spell
  const spellHours = (P) => ({ cloudy: SPELL_HOURS * share(P), clear: SPELL_HOURS * (1 - share(P)) });

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
      advance(sky, 5 * (crossHours(P) + SPELL_HOURS + WIND_HOURS));
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
  // day's rain (rainfall × hours, summed), hours raining, average clouds, average wind, base temperature and
  // temperature, and whether it snowed ([{ rain, wet, clouds, wind, base, temp, snow }]). stats: each season's tempStats, from its long run
  // (a season without them gets no temperatures)
  function simulateYear(sets, seed, stats) {
    const sky = newSky(sets[SEASONS[0].id], HerdModel.rng(seed)), days = [], trand = HerdModel.rng(seed + 7777);
    let u = normal(trand);
    let n = sky.clouds.length, r = rainfall(sky), w = sky.v, last = 0, d = null;
    const add = (t) => { const dt = t - last; d.rain += r * dt; if (r > 0) d.wet += dt; if (n === 0) d.sun += dt; d.clouds += (n * dt) / 24; d.wind += (w * dt) / 24; last = t; };
    for (let day = 1; day <= SEASONS.length * SEASON_DAYS; day++) {
      if (day > 1 && seasonOf(day) !== seasonOf(day - 1)) { setParams(sky, sets[SEASONS[seasonOf(day)].id]); w = sky.v; }
      d = { rain: 0, wet: 0, sun: 0, clouds: 0, wind: 0 }; last = sky.t;
      advance(sky, 24, (t, m, cloudy, rain, v) => { add(t); n = m; r = rain; w = v; });
      add(sky.t);
      const id = SEASONS[seasonOf(day)].id, st = stats && stats[id];
      d.base = baseTemp(sets, day);
      d.temp = st ? tempOf(sets[id], st, d, u, d.base) : NaN;
      d.snow = d.wet > 0 && d.temp < 0;
      u = nextU(u, trand);
      days.push(d);
    }
    return days;
  }

  // A long run: the share of time at each count and at each rainfall, the clouds that came and didn't,
  // the times it started raining and stopped, the average wind, the steps of the count, the rainfall and
  // the wind over the first showHours hours ([[t, n, rain, v]]) and the cloudy spells in them ([[from, to]])
  function simulate(P, hours, seed, showHours) {
    const sky = newSky(P, HerdModel.rng(seed)), time = new Array(MAX_CLOUDS + 1).fill(0), rainTime = new Array(MAX_CLOUDS + 1).fill(0), spells = [];
    let last = 0, n = sky.clouds.length, r = rainfall(sky), w = sky.v, windSum = 0, from = sky.cloudy ? 0 : null, starts = 0, stops = 0;
    const steps = [[0, n, r, w]], tally = dayTally(sky);
    advance(sky, hours, (t, m, cloudy, rain, v) => {
      tally.to(sky.t); tally.set(m, rain);
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
    tally.to(sky.t);
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
    return { share: time.map((v) => v / hours), rain: rainTime.map((v) => v / hours), came: sky.came, lost: sky.lost, starts, stops, wind: windSum / hours, hours, steps, spells, temp };
  }

  // A fresh copy of the default sets, with the season ramp
  const defaultSets = () => ({ ...Object.fromEntries(SEASONS.map(({ id }) => [id, { ...DEFAULTS[id] }])), rampDays: RAMP_DAYS });
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
    } catch (e) {}
    return sets;
  }

  window.WeatherModel = { MAX_CLOUDS, SPELL_HOURS, WIND_HOURS, SEASONS, SEASON_DAYS, seasonOf, DEFAULTS, defaultSets, LIMITS, STORE_KEY, crossHours, meanRate, loadOf, spellHours, windDraw, rainChance, rainfall, evenDistribution, meanOf, newSky, advance, setParams, simulate, simulateYear, savedParams, TEMP_PERSIST, RAMP_DAYS, RAMP_LIMITS, baseTemp, seasonAverages, weatherPart, dayType, tempOf, nextU, normal };
})();
