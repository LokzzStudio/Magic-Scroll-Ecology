// Micro mode's day viewer: one village day from MicroModel's record (a run's cfg.trace), drawn on the map
// minute by minute, with everyone's job, energy and fullness. village-page.js mounts it:
//   const view = MicroView.mount(element); view.show(trace, { day, k }); view.stop()
(function () {
  const GLYPH = { milk: "奶", field: "田", wood: "木", wool: "毛", stone: "石", weave: "織", forge: "鍛", class: "學", teach: "教", poetry: "詩" };
  const PLACE = { H: "the house", F: "the farm", P: "the pasture", T: "the forest", M: "the mine" };
  const CARRY = { milk: "milk", field: "rice", wood: "timber", wool: "wool", stone: "stone" };
  const JOB = { milk: "Milking", field: "Working the fields", wood: "Cutting wood", wool: "Shearing", stone: "Quarrying", weave: "Weaving", forge: "Forging", class: "In class", teach: "Teaching", poetry: "Writing poetry" };
  // Tile colours and how strongly they show: [colour, fill opacity]
  const TILE = { H: ["--ink", 0.9], F: ["--allee", 0.55], P: ["--herd", 0.22], T: ["--herd", 0.65], M: ["--muted", 0.6], W: ["--cows", 0.85], R: ["--cows", 0.3] };
  // Speeds, in game hours per real second: real time is 5 minutes of play for 2 hours of the game
  const REAL = MapModel.GAME_MIN_PER_REAL_SEC / 60;
  const SPEEDS = [[1, "Real time"], [10, "×10"], [60, "×60"], [240, "×240"]];
  const fmt = (v, d = 0) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  const clock = (h) => { const m = Math.floor(h * 60 + 1e-6); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Skills above level 0, by the map's glyphs (the Skill page)
  const SKILL_GLYPH = { milk: "奶", farm: "田", wood: "木", weave: "織", forge: "鍛", wool: "毛", stone: "石", teach: "教", poetry: "詩" };
  const skillText = (a) => {
    const up = a.levels ? Object.keys(SKILL_GLYPH).filter((id) => a.levels[id] > 0) : [];
    return up.length ? ` · level ${up.map((id) => SKILL_GLYPH[id] + a.levels[id]).join(" ")}` : "";
  };

  function mount(root) {
    root.innerHTML = `<div class="mv-bar">
        <button type="button" class="btn primary" data-act="play">Play</button>
        <span class="mv-clock" aria-live="off">—</span>
        <input type="range" class="mv-time" min="0" max="24" step="0.01" aria-label="Time of day">
        <div class="speed"><span>Speed</span><div class="seg" role="group" aria-label="Day speed">${SPEEDS.map(([x, label]) => `<button type="button" data-mspeed="${x}" aria-pressed="${x === 60}">${label}</button>`).join("")}</div></div>
      </div>
      <div class="mv-main">
        <div class="mv-map"><canvas aria-label="The village map with everyone on it"></canvas></div>
        <div class="mv-side"><div class="mv-scroll"><table class="mv-people"><thead><tr><th>Who</th><th>Doing</th><th>Energy</th><th>Full</th></tr></thead><tbody></tbody></table></div></div>
      </div>
      <p class="hint mv-summary"></p>`;
    const $ = (sel) => root.querySelector(sel);
    const canvas = $("canvas"), body = $(".mv-people tbody"), slider = $(".mv-time");
    let tr = null, info = null, t = 0, t0 = 0, t1 = 24, speed = 60, playing = false, raf = 0, last = null, rows = [], selected = null;
    try { const v = Number(localStorage.getItem("micro-speed")); if (SPEEDS.some(([x]) => x === v)) speed = v; } catch (e) {}
    const syncSpeed = () => { for (const b of root.querySelectorAll("[data-mspeed]")) b.setAttribute("aria-pressed", Number(b.dataset.mspeed) === speed); };
    syncSpeed();

    // ---------- Where someone is and what they're doing at time t ----------
    const segAt = (a, time) => { let s = null; for (const x of a.tr) { if (x.t > time + 1e-9) break; s = x; } return s; };
    const spotOf = (place, a) => {
      if (place === "H") { const hs = tr.S.houses; return hs.length ? hs[a.id % hs.length] : [0, 0]; }
      const sp = tr.S.spots[place];
      // Spread people over the place's tiles
      const tiles = tilesOf(place);
      if (tiles.length) return tiles[(a.id * 7) % tiles.length];
      return sp && isFinite(sp.d) ? [sp.x, sp.y] : [0, 0];
    };
    let tileCache = {};
    const tilesOf = (c) => {
      if (tileCache[c]) return tileCache[c];
      const out = [], W = MapModel.W;
      for (let i = 0; i < tr.S.tiles.length; i++) if (tr.S.tiles[i] === c) out.push([i % W, Math.floor(i / W)]);
      // the tiles nearest the houses first, so a few people stand by the near edge
      const sp = tr.S.spots[c];
      if (sp && isFinite(sp.d)) out.sort((p, q) => Math.abs(p[0] - sp.x) + Math.abs(p[1] - sp.y) - (Math.abs(q[0] - sp.x) + Math.abs(q[1] - sp.y)));
      return (tileCache[c] = out.slice(0, 6));
    };
    function stateAt(a, time) {
      const s = segAt(a, time);
      if (!s) return { s: "asleep", pos: spotOf("H", a), inside: true, e: a.e0 };
      // Hungry with no energy left: gone in early (worked out from the day's share)
      if (a.plan.early !== null && time >= a.w + a.plan.early) return { s: "early", pos: spotOf("H", a), inside: true, e: 0 };
      if (s.s === "walk") {
        const from = spotOf(s.at, a), to = spotOf(s.to, a), f = s.t1 > s.t ? Math.min(1, (time - s.t) / (s.t1 - s.t)) : 1;
        return { s: "walk", to: s.to, job: s.job, why: s.why, pos: [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f], e: s.e };
      }
      const e = s.s === "work" || s.s === "teach" || s.s === "poetry" ? Math.max(0, s.e - (time - s.t) * a.r) : s.e;
      return { s: s.s, job: s.job, meal: s.meal, at: s.at, pos: spotOf(s.at, a), inside: s.s === "inside", e };
    }
    // Fullness (share of a full day's food still in them), whether they're out, and the day's hunger toll
    // so far: the hours out with nothing in them, until they eat or go in (DayModel.dayOut)
    function fullAt(a, time) {
      const S = tr.S, g = a.g, B = (g * S.active) / 2, u = S.active / a.need;
      if (time < a.w) return { full: 0, lost: 0 };
      const lunch = a.plan.Lh !== null ? a.w + a.plan.Lh : Infinity, night = a.w + a.plan.E;
      const end1 = a.w + B, end2 = lunch < Infinity ? Math.max(end1, lunch) + B : end1;
      const until = time < lunch ? end1 : end2;
      // The day's hungry hours so far (they add up over the day), and what they've cost
      const hours = (from, to) => Math.max(0, Math.min(time, to) - from);
      const h = lunch < Infinity ? hours(end1, lunch) + (time > lunch ? hours(end2, night) : 0) : hours(end1, night);
      const lost = (info.k * h * h) / (u * u);
      return { full: Math.max(0, until - time) / S.active, lost };
    }
    // Hunger status: at HUNGRY_AT or less, out of the house; empty: losing life
    const statusOf = (a, st, fl) => (st.inside || t < a.w ? "" : fl.full <= 1e-9 ? "empty" : fl.full <= DayModel.HUNGRY_AT + 1e-9 ? "hungry" : "");
    const nameOf = (a) => {
      const sex = a.sex === HumanModel.MALE;
      if (a.kind === "scholar") return `Scholar (${sex ? "man" : "woman"})`;
      if (a.stage === "child") return sex ? "Boy" : "Girl";
      if (a.stage === "elder") return `Elder (${sex ? "man" : "woman"})`;
      return sex ? "Man" : "Woman";
    };
    const doing = (st, a) => {
      switch (st.s) {
        case "asleep": return "Asleep";
        case "inside": return "Home for the night";
        case "early": return "Gone in early: hungry, no energy left";
        case "eat": return st.meal === "breakfast" ? "Breakfast by the house" : "Lunch by the house";
        case "idle": return a.e0 > 0 && st.e > 0.01 ? "Waiting by the house" : "Done for the day, by the house";
        case "walk": return st.why === "lunch" ? "Walking home for lunch" : st.why === "night" ? "Walking home for the night" : st.why === "idle" ? "Walking back to the house" : st.why === "carry" ? `Carrying ${CARRY[st.job] || "it"} home` : `Walking to ${PLACE[st.to]}${st.job ? ` (${(JOB[st.job] || st.job).toLowerCase()})` : ""}`;
        case "class": return "In class";
        default: return `${JOB[st.job] || st.job}${st.at !== "H" ? ` at ${PLACE[st.at]}` : ""}`;
      }
    };

    // ---------- Drawing ----------
    function drawMap() {
      const w = canvas.clientWidth, dpr = window.devicePixelRatio || 1, W = MapModel.W, H = MapModel.H;
      const size = w, tile = size / W;
      if (canvas.width !== Math.round(size * dpr)) { canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr); }
      canvas.style.height = size + "px";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const col = { ground: cssVar("--ground"), line: cssVar("--line"), surface: cssVar("--surface"), ink: cssVar("--ink"), men: cssVar("--men"), women: cssVar("--women"), crash: cssVar("--crash"), muted: cssVar("--muted"), allee: cssVar("--allee") };
      for (let i = 0; i < W * H; i++) {
        const c = tr.S.tiles[i], x = (i % W) * tile, y = Math.floor(i / W) * tile;
        if (c === ".") { ctx.globalAlpha = 1; ctx.fillStyle = col.ground; ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2); continue; }
        const [name, alpha] = TILE[c];
        ctx.fillStyle = ctx.strokeStyle = cssVar(name);
        ctx.globalAlpha = alpha; ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        ctx.globalAlpha = 0.8; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, tile - 3, tile - 3);
      }
      ctx.globalAlpha = 1;
      // Everyone outside, grouped by the tile they're on
      const groups = new Map();
      const states = tr.people.map((a) => stateAt(a, t));
      tr.people.forEach((a, k) => {
        const st = states[k];
        if (st.inside) return;
        const key = st.s === "walk" ? `w${k}` : `${Math.round(st.pos[0])},${Math.round(st.pos[1])}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(k);
      });
      const r = Math.max(4, tile * 0.22);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const list of groups.values()) {
        const n = list.length, per = Math.ceil(Math.sqrt(n)), cell = tile / per;
        list.forEach((k, j) => {
          const a = tr.people[k], st = states[k];
          const cx = n === 1 ? (st.pos[0] + 0.5) * tile : Math.round(st.pos[0]) * tile + ((j % per) + 0.5) * cell;
          const cy = n === 1 ? (st.pos[1] + 0.5) * tile : Math.round(st.pos[1]) * tile + (Math.floor(j / per) + 0.5) * cell;
          const rr = Math.min(r, cell * 0.45) * (a.stage === "child" ? 0.8 : 1);
          const status = statusOf(a, st, fullAt(a, t));
          ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx.fillStyle = a.sex === HumanModel.MALE ? col.men : col.women; ctx.fill();
          ctx.lineWidth = status ? 2.4 : 1; ctx.strokeStyle = status === "empty" ? col.crash : status === "hungry" ? col.allee : col.ink; ctx.stroke();
          if (k === selected) { ctx.beginPath(); ctx.arc(cx, cy, rr + 3, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = col.ink; ctx.stroke(); }
          const g = st.s === "work" || st.s === "class" || st.s === "teach" || st.s === "poetry" ? GLYPH[st.job] : st.s === "eat" ? "食" : "";
          if (g && rr >= 6) { ctx.fillStyle = col.surface; ctx.font = `${Math.round(rr * 1.15)}px sans-serif`; ctx.fillText(g, cx, cy + 0.5); }
        });
      }
      return states;
    }
    function buildRows() {
      body.innerHTML = tr.people.map((a, k) => `<tr data-k="${k}"><td><span class="mv-dot ${a.sex === HumanModel.MALE ? "m" : "f"}${a.stage === "child" ? " kid" : ""}"></span><b>${nameOf(a)}</b> #${a.id}<small>${a.power !== undefined ? `${fmt(a.power)}/${fmt(a.intel)}` : `${fmt(a.e0)} energy`} · up ${clock(a.w)}${a.happy !== null && a.happy !== undefined ? ` · happiness ${fmt(a.happy)}` : ""}${skillText(a)}</small></td>` +
        `<td><span class="mv-doing"></span> <span class="mv-tag" hidden></span></td><td><span class="mv-bar-o"><span class="mv-bar-i e"></span></span></td><td><span class="mv-bar-o"><span class="mv-bar-i f"></span></span><small class="mv-lost"></small></td></tr>`).join("");
      rows = [...body.children].map((row) => ({ row, doing: row.querySelector(".mv-doing"), tag: row.querySelector(".mv-tag"), e: row.querySelector(".mv-bar-i.e"), f: row.querySelector(".mv-bar-i.f"), lost: row.querySelector(".mv-lost") }));
    }
    function draw() {
      if (!tr) return;
      const states = drawMap();
      $(".mv-clock").textContent = `Day ${fmt(info.day)} · ${clock(t)}`;
      slider.value = t;
      tr.people.forEach((a, k) => {
        const st = states[k], R = rows[k], fl = fullAt(a, t);
        R.doing.textContent = doing(st, a);
        R.e.style.width = `${a.e0 > 0 ? (100 * st.e) / a.e0 : 0}%`;
        R.f.style.width = `${Math.min(100, 100 * fl.full)}%`;
        const status = statusOf(a, st, fl);
        R.f.classList.toggle("empty", status === "empty");
        R.tag.hidden = !status; R.tag.textContent = status === "empty" ? "Starving" : "Hungry"; R.tag.className = `mv-tag ${status}`;
        R.lost.textContent = fl.lost > 0.005 ? `−${fmt(fl.lost, 2)} d` : "";
        R.row.classList.toggle("sel", k === selected);
      });
    }

    // ---------- Playback ----------
    function stop() { playing = false; cancelAnimationFrame(raf); $("[data-act=play]").textContent = "Play"; }
    function tick(now) {
      if (!playing) return;
      if (last !== null) t = Math.min(t1, t + ((now - last) / 1000) * speed * REAL);
      last = now;
      draw();
      if (t >= t1) stop(); else raf = requestAnimationFrame(tick);
    }
    $("[data-act=play]").addEventListener("click", () => {
      if (!tr) return;
      if (playing) { stop(); return; }
      if (t >= t1 - 1e-6) t = t0;
      playing = true; last = null; $("[data-act=play]").textContent = "Pause";
      raf = requestAnimationFrame(tick);
    });
    slider.addEventListener("input", () => { stop(); t = Number(slider.value); draw(); });
    for (const b of root.querySelectorAll("[data-mspeed]")) b.addEventListener("click", () => { speed = Number(b.dataset.mspeed); try { localStorage.setItem("micro-speed", String(speed)); } catch (e) {} syncSpeed(); });
    body.addEventListener("click", (e) => { const row = e.target.closest("tr[data-k]"); if (!row) return; const k = Number(row.dataset.k); selected = selected === k ? null : k; draw(); });
    new ResizeObserver(() => draw()).observe(canvas);

    return {
      // Show a day's record; keeps the time of day when the same day is shown again
      show(trace, opts) {
        const same = tr && info && info.day === opts.day;
        tr = trace; info = opts; tileCache = {};
        if (!tr || !tr.people) { body.innerHTML = ""; $(".mv-summary").textContent = ""; return; }
        // Each person's share of their need today: the grown-ups', or the children's
        for (const a of tr.people) { a.g = (a.kind === "kid" ? tr.shareKids : tr.share) ?? 1; a.plan = DayModel.dayOut(a.g, a.tl, tr.S); }
        t0 = Math.floor(Math.min(...tr.people.map((a) => a.w)) * 4) / 4;
        t1 = Math.ceil(Math.max(...tr.people.map((a) => a.w + a.plan.E)) * 4) / 4;
        slider.min = t0; slider.max = t1;
        if (!same) { t = t0; selected = null; const at = Number(new URLSearchParams(location.search).get("at")); if (at > 0) t = at; }   // ?at=10.5 opens at 10:30
        t = Math.min(t1, Math.max(t0, t));
        buildRows();
        const sum = (k) => tr.people.reduce((s, a) => s + (a.spent[k] || 0), 0);
        const lost = tr.people.reduce((s, a) => s + fullAt(a, 99).lost, 0);
        const parts = [["milk", "milking"], ["field", "the fields"], ["wood", "timber"], ["wool", "shearing"], ["stone", "quarrying"], ["weave", "weaving"], ["forge", "forging"], ["teach", "teaching"], ["poetry", "poetry"], ["class", "class"]]
          .filter(([k]) => sum(k) > 0.05).map(([k, label]) => `${label} ${fmt(sum(k), 1)}`);
        const walked = tr.people.reduce((s, a) => s + a.tr.filter((x) => x.s === "walk").reduce((q, x) => q + (x.t1 - x.t), 0), 0);
        $(".mv-summary").innerHTML = `<b>${fmt(tr.people.length)}</b> people, fed <b>${fmt((tr.share ?? 1) * 100)}%</b> today (children <b>${fmt((tr.shareKids ?? 1) * 100)}%</b>). Energy spent: ${parts.join(" · ") || "none"}. Walking: ${fmt(walked, 1)} h in all. Hunger toll: <b>${fmt(lost, 1)}</b> days of life, everyone together. An amber ring is someone hungry (fullness ${fmt(DayModel.HUNGRY_AT * 100)}% or less), who keeps working but goes in early once their energy is spent; a red ring is someone out of food, losing life.`;
        draw();
      },
      stop,
    };
  }

  window.MicroView = { mount };
})();
