// The site's checks: node tests/run.js [--quick | --full]
//
// 1. Opens every page in a headless browser (Edge or Chrome; BROWSER=path to choose) at its default
//    settings and takes the village config each page runs.
// 2. Plays those villages (tests/village-checks.js), checking day by day what must always hold: food in
//    store adds up, nobody below the attribute floors or past their lifespan, couples and pregnancies
//    sound, hunger's toll exact, couples held off never conceive, 發呆 spends nothing, lots, crafts and
//    the flock add up, no more people at a place than it has, the wool off the sheep is the wool taken,
//    the well and the fields' water in range, no NaN in the records, no crash. Every page in Macro for
//    100 years (2 villages) and Micro for 3, and the Strategy page with each strategy.
// 3. Opens every page again with every slider at its lowest, then its highest (the Humans and Food
//    pages' too), and reports errors, a page that stops answering, and NaN / undefined / Infinity in
//    its text.
// 4. Checks SPEC.md is what tools/spec.js makes from rules.js and the models now.
// --quick: 20 years, 1 village, Micro for 1 year, and the pages at their defaults only (a few minutes; some
//    slips only show over a long run, so run it in full before pushing).
// --full: also each number in the Strategy page's config at 0 and at 3× (2 years), and Macro against
//    Micro (3 years, 6 villages): anything more than 30% apart is a warning, worth a look but not a failure
//    (the two modes differ in how a day unfolds, most in the little collecting there is).
// Exits 1 if anything was found. Needs Node 18 or later; nothing to install.
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { spawn, fork } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), QUICK = process.argv.includes("--quick"), FULL = process.argv.includes("--full");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORKERS = Math.max(1, Math.min(7, os.cpus().length - 1));
// A job running longer than this is taken to hang: 2 minutes, and 6 s a year a village in Macro, a minute in Micro
const limitOf = (job) => 120000 + (job.days / 360) * job.seeds * (job.compare ? 66000 : job.mode === "micro" ? 60000 : 6000);
const problems = [], warnings = [];   // [section, text]
const report = (section, text) => { problems.push([section, text]); console.log(`  ✗ ${text}`); };

// ---------- The site, served ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
function serve() {
  const server = http.createServer((q, r) => {
    const p = path.resolve(ROOT, "." + decodeURIComponent(q.url.split("?")[0]));
    if (p !== ROOT && !p.startsWith(ROOT + path.sep)) { r.writeHead(403); return r.end(); }
    fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" }); r.end(b); });
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res({ server, base: `http://127.0.0.1:${server.address().port}/` })));
}

// ---------- A headless browser, driven over the DevTools protocol ----------
function browserPath() {
  if (process.env.BROWSER) return process.env.BROWSER;
  const c = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
  const found = c.find((p) => fs.existsSync(p));
  if (!found) throw new Error("No Edge or Chrome found: set BROWSER to one");
  return found;
}
async function openBrowser() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ecology-test-"));
  const proc = spawn(browserPath(), ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "about:blank"], { stdio: "ignore" });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) { await sleep(200); try { port = fs.readFileSync(path.join(dir, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch (e) {} }
  if (!port) throw new Error("The browser didn't start");
  let tab = null;
  for (let i = 0; i < 50 && !tab; i++) { try { tab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch (e) {} if (!tab) await sleep(200); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}, ms = 20000) => new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); r({ timeout: true }); } }, ms);
  });
  // An expression's value; TIMEOUT when the page doesn't answer in ms
  const ev = async (expr, ms) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, ms); return r.timeout ? TIMEOUT : r.result && r.result.result ? r.result.result.value : undefined; };
  await send("Page.enable");   // without it the script below never runs
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PAGE_HOOKS });
  const close = () => { try { ws.close(); } catch (e) {} proc.kill(); setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 1500); };
  return { send, ev, close };
}
const TIMEOUT = "__timeout__";
// In every page: its errors, and the config of its first village run (window.__cfg, as JSON: the herds
// left out, typed arrays as { __ta, v }, functions as { __fn })
const PAGE_HOOKS = `
  window.__errs = [];
  addEventListener("error", (e) => __errs.push(e.message + " @" + String(e.filename || "").split("/").pop() + ":" + e.lineno));
  addEventListener("unhandledrejection", (e) => __errs.push(String(e.reason)));
  let __vm;
  Object.defineProperty(window, "VillageModel", { configurable: true, get: () => __vm, set: (v) => {
    __vm = v;
    const run = v.run;
    v.run = (cfg) => {
      if (!window.__cfg) window.__cfg = JSON.stringify(cfg, (k, x) => (["cowAdults", "cowTiers", "sheepAdults", "sheepTiers"].includes(k) ? undefined : ArrayBuffer.isView(x) ? { __ta: x.constructor.name, v: Array.from(x) } : typeof x === "function" ? { __fn: true } : x));
      return run(cfg);
    };
  } });`;

// Opens a page; null, or why it didn't load
async function open(b, url) {
  const r = await b.send("Page.navigate", { url }, 15000);
  if (r.timeout) return "it didn't start loading in 15 s";
  return r.result && r.result.errorText ? "it didn't load: " + r.result.errorText : null;
}
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

// ---------- 1. Each page's village ----------
async function captureConfigs(b, base) {
  const cfgs = {};
  for (const pg of PAGES) {
    await b.ev("localStorage.clear(); 1");
    const failed = await open(b, base + pg);
    if (failed) { report("pages", `${pg}: ${failed}`); continue; }
    let s = null;
    for (let i = 0; i < 40 && !s; i++) { await sleep(250); s = await b.ev("window.__cfg || null", 10000); if (s === TIMEOUT) s = null; }
    if (s) cfgs[pg] = JSON.parse(s);
  }
  return cfgs;
}

// ---------- 2. Villages, checked (in WORKERS processes) ----------
function runJobs(jobs, onDone) {
  return new Promise((resolve) => {
    let next = 0, live = 0;
    if (!jobs.length) return resolve();
    const start = () => {
      while (live < WORKERS && next < jobs.length) {
        const job = jobs[next++], child = fork(path.join(__dirname, "village-checks.js"), [], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
        live++;
        let done = false;
        const finish = (msg) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          child.kill();
          onDone(job, msg);
          live--;
          if (next >= jobs.length && !live) resolve(); else start();
        };
        const timer = setTimeout(() => finish({ label: job.label, found: [{ kind: `HANG: still running after ${Math.round(limitOf(job) / 60000)} minutes`, n: 1, example: [] }] }), limitOf(job));
        child.on("message", finish);
        child.on("exit", (code) => finish({ label: job.label, found: [{ kind: `the test process died (exit ${code})`, n: 1, example: [] }] }));
        child.send(job);
      }
    };
    start();
  });
}
const show = (f) => `${f.kind} ×${f.n}${f.example && f.example.length ? `  (e.g. ${JSON.stringify(f.example).slice(0, 120)})` : ""}`;

// ---------- 3. The pages at their sliders' ends ----------
// Every settings page's saved settings at their sliders' lowest or highest (VillagePage.SPECS), and the
// Humans page's (its sliders' ranges) and the Food page's (FoodModel.LIMITS)
async function extremeSettings(b, base) {
  await b.send("Page.navigate", { url: base + "humans.html" }, 10000);
  await sleep(1500);
  const humans = await b.ev(`JSON.stringify({ key: HumanModel.STORE_KEY, ranges: [...document.querySelectorAll('input[type=range][id$="-range"]')].map((r) => [r.id.replace(/-range$/, ""), Number(r.min), Number(r.max)]) })`);
  await b.send("Page.navigate", { url: base + "strategy.html" }, 10000);
  await sleep(1500);
  const v = JSON.parse(await b.ev("JSON.stringify({ specs: VillagePage.SPECS, food: { key: FoodModel.STORE_KEY, limits: FoodModel.LIMITS } })"));
  const h = JSON.parse(humans), at = { min: {}, max: {} };
  for (const end of ["min", "max"]) {
    const pick = (lo, hi) => (end === "min" ? lo : hi);
    for (const k in v.specs) { const o = {}; for (const f in v.specs[k].fields) { const [, lo, hi] = v.specs[k].fields[f]; o[f] = pick(lo, hi); } at[end][v.specs[k].key] = o; }
    const hu = {}; for (const [k, lo, hi] of h.ranges) hu[k] = pick(lo, hi); at[end][h.key] = hu;
    const fo = {}; for (const k in v.food.limits) fo[k] = pick(v.food.limits[k][0], v.food.limits[k][1]); at[end][v.food.key] = fo;
  }
  return at;
}
// A page opened with these saved settings: its errors, whether it still answers, its text's NaN etc.
async function pageCheck(b, base, pg, saved, wait) {
  await b.ev(`localStorage.clear(); const o = ${JSON.stringify(saved)}; for (const k in o) localStorage.setItem(k, JSON.stringify(o[k])); 1`);
  const failed = await open(b, base + pg);
  if (failed) return [failed];
  await sleep(wait);
  const errs = await b.ev("JSON.stringify(window.__errs || [])", 60000);
  if (errs === TIMEOUT) return ["the page stopped answering (60 s)"];
  const at = await b.ev("location.href", 10000);
  if (!String(at).startsWith(base)) return ["it ended up at " + at];
  const out = JSON.parse(errs || "[]").map((e) => "error: " + e);
  const text = await b.ev("document.body ? document.body.innerText : ''", 20000);
  const bad = (String(text).match(/[^\n]{0,30}\b(NaN|undefined|Infinity)\b[^\n]{0,20}/g) || []).slice(0, 3);
  if (bad.length) out.push("in its text: " + bad.map((s) => JSON.stringify(s.trim())).join(", "));
  return out;
}

(async () => {
  const t0 = Date.now();
  const { server, base } = await serve();
  const b = await openBrowser();
  try {
    console.log(`1. The pages' villages`);
    const cfgs = await captureConfigs(b, base);
    console.log(`  ${Object.keys(cfgs).length} pages run a village: ${Object.keys(cfgs).map((p) => p.replace(".html", "")).join(", ")}`);

    console.log(`2. Villages, checked day by day (${WORKERS} at a time)`);
    const years = QUICK ? 20 : 100, seeds = QUICK ? 1 : 2, microDays = QUICK ? 360 : 1080, jobs = [];
    for (const pg in cfgs) {
      const cfg = { ...cfgs[pg], player: null }, energy = cfg.work === "energy";
      jobs.push({ label: `${pg} Macro, ${years} years`, cfg, mode: "macro", days: years * 360, seeds });
      if (energy) jobs.push({ label: `${pg} Micro, ${microDays / 360} years`, cfg, mode: "micro", days: microDays, seeds: 1 });
    }
    const strat = cfgs["strategy.html"];
    if (strat) for (const id of ["population", "sum", "sustain", "ur"]) {
      jobs.push({ label: `strategy.html, ${id}, Macro, ${years} years`, cfg: strat, mode: "macro", days: years * 360, seeds, player: id });
      jobs.push({ label: `strategy.html, ${id}, Micro, ${microDays / 360} years`, cfg: strat, mode: "micro", days: microDays, seeds: 1, player: id });
    }
    if (FULL && strat) {
      const leaves = [], walk = (o, p) => { for (const k in o) { const x = o[k], q = p ? p + "." + k : k; if (typeof x === "number" && isFinite(x)) leaves.push([q, x]); else if (x && typeof x === "object" && !x.__fn && !x.__ta) walk(x, q); } };
      for (const k in strat) if (!["travel", "seed", "roles", "priority", "player", "mode", "detailed"].includes(k)) walk(strat[k], k);
      for (const [p, x] of leaves) for (const v of x ? [0, x * 3] : [0]) jobs.push({ label: `strategy.html with ${p} = ${v}, 2 years`, cfg: { ...strat, player: null }, mode: "macro", days: 720, seeds: 1, set: `${p}=${v}`, quiet: true });
      console.log(`  (with ${leaves.length} numbers at 0 and 3×)`);
    }
    let n = 0;
    await runJobs(jobs, (job, msg) => {
      n++;
      if (msg.found.length) { console.log(`  ${job.label}:`); for (const f of msg.found) report("villages", `${job.label}: ${show(f)}`); }
      else if (!job.quiet) console.log(`  ✓ ${job.label} (${Math.round(msg.ms / 1000)} s)`);
    });
    console.log(`  ${n} runs`);
    if (FULL && strat) {
      console.log("  Macro against Micro, 3 years, 6 villages (per person-day):");
      await runJobs([{ label: "compare", cfg: { ...strat, player: null }, days: 1080, seeds: 6, compare: true }], (job, msg) => {
        for (const f of msg.found) {
          const gap = f.macro ? (f.micro - f.macro) / f.macro : 0, line = `${f.kind}: Macro ${f.macro.toFixed(3)}, Micro ${f.micro.toFixed(3)} (${gap >= 0 ? "+" : ""}${(100 * gap).toFixed(0)}%)`;
          if (Math.abs(gap) > 0.3) { warnings.push(line); console.log("  ! " + line); } else console.log("    " + line);
        }
      });
    }

    console.log("3. The pages, opened");
    const at = QUICK ? null : await extremeSettings(b, base);
    for (const [name, saved] of [["default settings", {}], ...(QUICK ? [] : [["every slider at its lowest", at.min], ["every slider at its highest", at.max]])]) {
      console.log(`  ${name}:`);
      for (const pg of PAGES) {
        const found = await pageCheck(b, base, pg, saved, cfgs[pg] ? 8000 : 3000);
        if (found.length) for (const f of found) report("pages", `${pg}, ${name}: ${f}`);
        else console.log(`  ✓ ${pg}`);
        if (found.some((f) => f.startsWith("the page stopped"))) { b.close(); Object.assign(b, await openBrowser()); }
      }
    }
  } finally {
    b.close();
    server.close();
  }
  console.log("4. SPEC.md");
  const spec = require("child_process").spawnSync(process.execPath, [path.join(ROOT, "tools", "spec.js"), "--check"], { encoding: "utf8" });
  if (spec.status === 0) console.log("  ✓ up to date with rules.js and the models");
  else report("spec", (spec.stdout + spec.stderr).trim() || "tools/spec.js failed");
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  if (warnings.length) { console.log(`
Worth a look (Macro against Micro):`); for (const w of warnings) console.log(`  ${w}`); }
  if (!problems.length) { console.log(`\nAll clear (${mins} min).`); process.exit(0); }
  console.log(`\n${problems.length} found (${mins} min):`);
  for (const [s, t] of problems) console.log(`  [${s}] ${t}`);
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(2); });
