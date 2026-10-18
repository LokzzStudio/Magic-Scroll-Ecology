// Shared map and day for the Magic Scroll ecology pages: a grid of tiles (house, farm, pasture, forest,
// mine, well, river), how far each kind of place is from the nearest house, and the shape of everyone's day. The Map
// page (map.html) is where they're set; the Attribute page and every page after it read them from here.
(function () {
  const W = 16, H = 16;
  // Tile letters: "." empty, H house, F farm, P pasture, T forest, M mine, W well, R river (the well and
  // the river have no use yet)
  const TYPES = [
    { id: "H", name: "House" }, { id: "F", name: "Farm" }, { id: "P", name: "Pasture" },
    { id: "T", name: "Forest" }, { id: "M", name: "Mine" }, { id: "W", name: "Well" }, { id: "R", name: "River" },
  ];
  const PLACES = ["F", "P", "T", "M"];

  // The starting map: two houses, farm 2 steps away, pasture 4, forest 7, mine 18 (at 1 minute a tile), a
  // well and a river
  function defaultTiles() {
    const t = new Array(W * H).fill(".");
    const fill = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t[y * W + x] = c; };
    fill(5, 6, 4, 4, "H");
    fill(5, 6, 6, 7, "F");
    fill(1, 3, 6, 9, "P");
    fill(10, 14, 0, 1, "T");
    fill(14, 15, 14, 15, "M");
    fill(3, 3, 4, 4, "W");
    fill(7, 8, 0, 0, "R");
    return t.join("");
  }

  // Map and day settings. Change these to change the defaults on every page.
  const DEFAULTS = {
    tiles: defaultTiles(),
    minPerTile: 1,     // minutes to walk one tile
    activeHours: 12,   // hours a day everyone is out of the house, from waking
    lunchAfter: 5.5,   // hours after waking from which everyone heads home for lunch, once the energy they're on is done
    mealMin: 24,       // minutes to eat breakfast or lunch, by the house
    load: 10,          // energy of collecting a worker does before carrying it home (搬運)
    wakeFrom: 4,       // everyone wakes between these hours (o'clock)
    wakeTo: 8,
  };
  const LIMITS = { minPerTile: [0, 60], activeHours: [6, 18], lunchAfter: [1, 12], mealMin: [0, 120], load: [10, 200], wakeFrom: [0, 12], wakeTo: [0, 12] };

  // Real time in the game: 5 minutes is 2 hours of game time (for Micro mode's clock)
  const GAME_MIN_PER_REAL_SEC = 0.4;

  // Older saves keep what the defaults since haven't changed: the map, the day's hours, meals, waking and
  // carrying (at 10 energy a day before v6: carrying ×10)
  const STORE_KEY = "map-v6", OLD_KEYS = [["map-v5", ["tiles", "minPerTile", "activeHours", "lunchAfter", "mealMin", "load", "wakeFrom", "wakeTo"]], ["map-v4", ["tiles", "activeHours", "mealMin", "load", "wakeFrom", "wakeTo"]], ["map-v3", ["tiles", "activeHours", "mealMin", "wakeFrom", "wakeTo"]], ["map-v2", ["tiles"]]];

  // Steps (no diagonals) from each kind of place to the nearest house: the nearest such tile to any
  // house. Infinity if there's no house or none of that place. With spots: also where, as
  // { x, y, hx, hy } (the tile and the house it's nearest).
  function nearest(tiles) {
    const houses = [], out = {};
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === "H") houses.push([i % W, Math.floor(i / W)]);
    for (const c of PLACES) {
      let best = { d: Infinity };
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] !== c) continue;
        const x = i % W, y = Math.floor(i / W);
        for (const [hx, hy] of houses) { const d = Math.abs(x - hx) + Math.abs(y - hy); if (d < best.d) best = { d, x, y, hx, hy }; }
      }
      out[c] = best;
    }
    return { houses, spots: out };
  }
  function distances(tiles) {
    const { spots } = nearest(tiles), out = {};
    for (const c of PLACES) out[c] = spots[c].d;
    return out;
  }

  // Hours for one round trip to a place `d` steps from the house
  const tripHours = (d, m) => (2 * d * m.minPerTile) / 60;

  // What the village model needs: the day (in hours since waking) and the walking between places.
  // between(a, b): hours from place a to place b, "H" the house; to or from the house it's that place's
  // distance, and between two places it's the steps between their nearest tiles.
  function travelOf(m) {
    const { houses, spots } = nearest(m.tiles), perTile = m.minPerTile / 60;
    const home = { H: 0 };
    for (const c of PLACES) home[c] = spots[c].d * perTile;
    const between = (a, b) => {
      if (a === b) return 0;
      if (a === "H") return home[b];
      if (b === "H") return home[a];
      const p = spots[a], q = spots[b];
      return isFinite(p.d) && isFinite(q.d) ? (Math.abs(p.x - q.x) + Math.abs(p.y - q.y)) * perTile : Infinity;
    };
    const wake0 = Math.min(m.wakeFrom, m.wakeTo), wake1 = Math.max(m.wakeFrom, m.wakeTo);
    return {
      home, between, spots, houses, tiles: m.tiles, minPerTile: m.minPerTile,
      active: m.activeHours, lunch: Math.min(m.lunchAfter, m.activeHours), meal: m.mealMin / 60, load: m.load, wake0, wake1,
      // the old names: one-way hours to the pasture, farm, forest and mine
      pasture: home.P, farm: home.F, forest: home.T, mine: home.M,
    };
  }

  // The map the Map page last saved, or null if it hasn't saved one
  function savedParams() {
    try {
      let saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      for (const [key, keep] of OLD_KEYS) {
        if (saved && typeof saved === "object") break;
        const old = JSON.parse(localStorage.getItem(key) || "null");
        if (old && typeof old === "object") saved = Object.fromEntries(keep.filter((k) => k in old).map((k) => [k, k === "load" ? Number(old[k]) * 10 : old[k]]));
      }
      if (!saved || typeof saved !== "object") return null;
      const m = { ...DEFAULTS };
      if (typeof saved.tiles === "string" && saved.tiles.length === W * H && /^[.HFPTMWR]+$/.test(saved.tiles)) m.tiles = saved.tiles;
      for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
        const v = Number(saved[k]);
        if (k in saved && isFinite(v)) m[k] = Math.min(hi, Math.max(lo, v));
      }
      return m;
    } catch (e) {
      return null;
    }
  }

  window.MapModel = { W, H, TYPES, PLACES, DEFAULTS, LIMITS, STORE_KEY, GAME_MIN_PER_REAL_SEC, defaultTiles, nearest, distances, tripHours, travelOf, savedParams };
})();
