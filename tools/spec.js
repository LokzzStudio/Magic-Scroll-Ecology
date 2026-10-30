// SPEC.md: the whole simulation in one file, enough to rebuild it from nothing else: every rule (the
// Implementation details of the Strategy page, where every feature is on, and of the Weather page, at
// the default settings), then every setting with its default and range, the default map and the default
// Jobs table. Made from rules.js and the models, so it says what they say:
//   node tools/spec.js           writes SPEC.md
//   node tools/spec.js --check   exits 1 if SPEC.md is out of date (tests/run.js runs this)
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "SPEC.md");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// ---------- The models, at their defaults (nothing saved) ----------
const ctx = { console, Math, JSON, Number, Object, Array, Set, Map, WeakMap, isFinite, Infinity, NaN, Float32Array, Float64Array, Int32Array, Int8Array, Uint8Array, Uint16Array, ArrayBuffer, String, Date,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, CustomEvent: class {}, dispatchEvent() {}, addEventListener() {},
  document: { querySelectorAll: () => [], addEventListener() {}, readyState: "complete" }, navigator: { hardwareConcurrency: 1 }, setTimeout, clearTimeout };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["roles-model.js", "herd-model.js", "human-model.js", "food-model.js", "map-model.js", "weather-model.js", "day-model.js", "strategy-model.js", "village-model.js", "village-page.js", "rules.js"]) vm.runInContext(read(f), ctx, { filename: f });
const { MagicRules, HerdModel, HumanModel, FoodModel, MapModel, WeatherModel, RolesModel, VillagePage } = ctx;

// ---------- Text ----------
const md = (html) => html.replace(/<b>(.*?)<\/b>/g, "**$1**").replace(/<(?!\/?su[bp]>)[^>]+>/g, "");
const fmt = (v) => (typeof v === "number" ? String(+v.toFixed(6)).replace("-", "−") : String(v));
const groupsOf = (page) => MagicRules.groups(page).map((g) => {
  const items = g.items.filter(Boolean).map(md);
  if (g.note) return `### ${g.title}\n\n${items.map((t) => `- ${t}`).join("\n")}\n`;
  const where = g.where ? `*Settings: ${g.where === "Jobs" ? "the Jobs table" : `the ${g.where} page`}.*\n\n` : "";
  return `### ${g.title}\n\n${where}${items.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`;
}).join("\n");

// ---------- Settings: default, range, and a label from the page or the model's own comments ----------
// A page's slider labels: <label for="x-num">…</label>, with { id: "x", key: "field" } mapping slider to setting
function pageLabels(file) {
  const src = read(file), byId = {};
  for (const m of src.matchAll(/<label for="([A-Za-z0-9]+)-num"[^>]*>([\s\S]*?)<\/label>/g)) byId[m[1]] = m[2].replace(/<[^>]+>[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "").trim();
  const out = { ...byId };
  for (const m of src.matchAll(/\{ id: "([A-Za-z0-9]+)", key: "([A-Za-z0-9]+)"/g)) if (byId[m[1]]) out[m[2]] = byId[m[1]];
  return out;
}
// A model's own words for its settings: the comment block before DEFAULTS (`//   key   what it is`), or
// the comment after each in it (`key: value,   // what it is`)
function modelLabels(file) {
  const src = read(file), out = {}, at = src.indexOf("const DEFAULTS = {"), block = src.slice(at, src.indexOf("\n  };", at));
  for (const m of src.matchAll(/^\s+\/\/\s{3}([A-Za-z]+)\s{2,}(.+)$/gm)) out[m[1]] = m[2].trim();
  for (const m of block.matchAll(/^\s+([A-Za-z0-9]+): [^/\n]+\/\/ ?(.+)$/gm)) if (!(m[1] in out)) out[m[1]] = m[2].trim();
  return out;
}
// Settings that come in sets, and a few the pages label only with a picture, in words
const TIER_CODES = ["N", "R", "SR", "SSR", "UR"], CRAFT_NAMES = { clothes: "衣", hat: "笠", blade: "刀", fork: "叉" };
function setLabel(page, k) {
  let m;
  if ((m = k.match(/^exp(\d)$/))) return `Exp for skill level ${m[1]} (on top of the level before)`;
  if ((m = k.match(/^bonus(\d)$/))) return page === "craft" ? `Tool bonus of a ${TIER_CODES[m[1] - 1]} 叉 or 刀, %` : `Effectiveness bonus at skill level ${m[1]}, %`;
  if ((m = k.match(/^g(\d+)$/))) return `Rice a seeded field grows a day at water level ${m[1]}`;
  if ((m = k.match(/^(clothes|hat|blade|fork)(Wool|Wood|Stone)$/))) return `${CRAFT_NAMES[m[1]]}: ${m[2] === "Wood" ? "timber" : m[2].toLowerCase()} it takes`;
  if ((m = k.match(/^(clothes|hat|blade|fork)Energy$/))) return `${CRAFT_NAMES[m[1]]}: Power of work to make`;
  if ((m = k.match(/^(clothes|hat|blade|fork)Wear$/))) return `${CRAFT_NAMES[m[1]]}: Power of use it lasts`;
  if ((m = k.match(/^start(Blades|Forks|Clothes|Hats)$/))) return `R ${{ Blades: "刀", Forks: "叉", Clothes: "衣", Hats: "笠" }[m[1]]} in store at the start`;
  return { forestTier: "Forest's tier (1 N to 3 SR)", mineTier: "Mine's tier (1 N to 3 SR)", cowTier: "Starting cows' tier (1 N to 3 SR)", sheepTier: "Starting sheep's tier (1 N to 3 SR)", wakeTo: "(with wakeFrom)",
    perLevel: "Rain per +1 water level (rainfall × hours)", sunnyDrain: "Sunny drain: level a dry, clear hour takes off at level 5", cloudyDrain: "Cloudy drain: the same under clouds", slope: "Drain slope (0: the same at every level)" }[k] || "";
}
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|");
const table = (rows) => ["| Setting | Default | Range | What it is |", "|---|---|---|---|", ...rows.map(([k, v, range, label]) => `| \`${k}\` | ${cell(fmt(v))} | ${cell(range)} | ${cell(label)} |`)].join("\n");
const rangeOf = (lim) => (lim ? `${fmt(lim[0])} to ${fmt(lim[1])}` : "");
function settingsSection() {
  const parts = [];
  const model = (title, file, page, values, limits = {}, skip = []) => {
    const a = modelLabels(file), b = pageLabels(page);
    parts.push(`### ${title}\n\n` + table(Object.entries(values).filter(([k]) => !skip.includes(k)).map(([k, v]) => [k, v, rangeOf(limits[k]) || "—", b[k] || a[k] || setLabel(page, k)])));
  };
  model("Herd (index.html)", "herd-model.js", "index.html", { ...HerdModel.DEFAULTS, ...HerdModel.START });
  model("Humans (humans.html)", "human-model.js", "humans.html", { ...HumanModel.DEFAULTS, ...HumanModel.START });
  model("Food (farm.html)", "food-model.js", "farm.html", FoodModel.DEFAULTS, FoodModel.LIMITS, ["riceYear"]);   // riceYear follows from the rest
  model("Map (map.html)", "map-model.js", "map.html", MapModel.DEFAULTS, MapModel.LIMITS, ["tiles"]);
  // The weather: a column a season
  const W = WeatherModel.defaultSets(), wl = modelLabels("weather-model.js"), ids = WeatherModel.SEASONS.map((s) => s.id);
  parts.push("### Weather (weather.html)\n\n| Setting | " + WeatherModel.SEASONS.map((s) => s.en).join(" | ") + " | Range | What it is |\n|---|" + ids.map(() => "---|").join("") + "---|---|\n" +
    Object.keys(WeatherModel.LIMITS).map((k) => `| \`${k}\` | ${ids.map((s) => fmt(W[s][k])).join(" | ")} | ${rangeOf(WeatherModel.LIMITS[k])} | ${cell(wl[k] || "")} |`).join("\n") + "\n\n" +
    table([["rampDays", W.rampDays, rangeOf(WeatherModel.RAMP_LIMITS), "Season ramp, days"], ...Object.entries(W.water).map(([k, v]) => [`water.${k}`, v, rangeOf(WeatherModel.WATER_LIMITS[k]), setLabel("weather", k)])]));
  // The village pages' settings tables
  const LABELS = { strategy: "Strategy (1 Most people, 2 Best all-rounder, 3 Sustainable, 4 A UR craft)" };
  for (const [page, spec] of Object.entries(VillagePage.SPECS)) {
    const lab = pageLabels(`${page}.html`);
    parts.push(`### ${page[0].toUpperCase() + page.slice(1)} (${page}.html)\n\n` + table(Object.entries(spec.fields).map(([k, [v, lo, hi]]) => [k, v, `${fmt(lo)} to ${fmt(hi)}`, LABELS[k] || lab[k] || setLabel(page, k)])));
  }
  return parts.join("\n\n");
}

// ---------- The default map and Jobs table ----------
function mapSection() {
  const t = MapModel.DEFAULTS.tiles, rows = [];
  for (let y = 0; y < MapModel.H; y++) rows.push(t.slice(y * MapModel.W, (y + 1) * MapModel.W));
  const d = MapModel.distances(t);
  return "Row 0 is the top, column 0 the left; north is up, and the clouds blow from the west (left) edge.\n\n```\n" + rows.join("\n") + "\n```\n\n" +
    MapModel.TYPES.map((x) => `\`${x.id}\` ${x.name}`).join(", ") + ", `.` empty.\n\nSteps from the nearest house to the nearest tile of each place: " +
    MapModel.PLACES.map((c) => `${MapModel.TYPES.find((x) => x.id === c).name.toLowerCase()} ${fmt(d[c])}`).join(", ") + ".";
}
function jobsSection() {
  const J = RolesModel.JOBS, R = RolesModel.ROLES, D = RolesModel.DEFAULTS;
  return "Who may do which job (✓). Grown-ups' rows apply by sex and stage; the scholars' rows to whoever is a scholar that day.\n\n| | " + J.map((j) => `${j.zh} ${j.en}`).join(" | ") + " |\n|---|" + J.map(() => "---|").join("") + "\n" +
    R.map((r) => `| ${r.zh} ${r.en} | ` + J.map((j) => (D[r.id][j.id] ? "✓" : "")).join(" | ") + " |").join("\n");
}

const text = `# Magic Scroll Ecology: the simulation

Made by \`node tools/spec.js\` from rules.js and the models; edit those, not this file.

A village over 100 years of 360 days: a herd of cows (and from the Resources page on, sheep), and people who are born, pair up, work for their food on a small map, eat, learn, collect, craft, dress for the weather and die. Each page of the site adds a part; this file has them all, as the Strategy page runs them, at the default settings.

How to read it:
- **Rules** are in the order a day needs them. Numbers that are settings are written at their defaults; Settings below lists each one with its range. Every other number is fixed.
- "Settings: the X page" under a heading, or "the X page's …" in a rule, names the page of the site where those settings live. They're listed under X in Settings; the Weather page's rules are under Weather, and the Jobs table is at the end.
- **Micro mode** is the game's rules: the day played out person by person, event by event. **Macro mode** is a faster approximation of it, which the pages run by default; it's described, but not to the letter.
- Randomness: each kind has its own dice (mulberry32, seeded). A rebuild that follows these rules should match the site's results in distribution, not draw for draw.

## Rules

${groupsOf("strategy")}
## Weather

${groupsOf("weather")}
## Settings

${settingsSection()}

## The default map

${mapSection()}

## The default Jobs table

${jobsSection()}
`;

if (process.argv.includes("--check")) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";   // as git may have checked it out
  if (now !== text) { console.log("SPEC.md is out of date: run node tools/spec.js"); process.exit(1); }
  console.log("SPEC.md is up to date");
} else {
  fs.writeFileSync(OUT, text);
  console.log(`SPEC.md: ${text.length.toLocaleString()} characters`);
}
