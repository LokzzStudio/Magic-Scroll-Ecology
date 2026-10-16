// Shared map for the Magic Scroll ecology pages: a grid of tiles (house, farm, pasture, forest, mine)
// and how far each kind of place is from the nearest house. The Map page (map.html) is where it's drawn;
// the Production page and every page after it read it from here to work out the walking.
(function () {
  const W = 16, H = 16;
  // Tile letters: "." empty, H house, F farm, P pasture, T forest, M mine
  const TYPES = [
    { id: "H", name: "House" }, { id: "F", name: "Farm" }, { id: "P", name: "Pasture" },
    { id: "T", name: "Forest" }, { id: "M", name: "Mine" },
  ];
  const PLACES = ["F", "P", "T", "M"];

  // The starting map: two houses, farm 2 steps away, pasture 4, forest 7, mine 18
  function defaultTiles() {
    const t = new Array(W * H).fill(".");
    const fill = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t[y * W + x] = c; };
    fill(5, 6, 4, 4, "H");
    fill(5, 6, 6, 7, "F");
    fill(1, 3, 6, 9, "P");
    fill(10, 14, 0, 1, "T");
    fill(14, 15, 14, 15, "M");
    return t.join("");
  }

  // Map settings. Change these to change the defaults on every page.
  const DEFAULTS = {
    tiles: defaultTiles(),
    minPerTile: 2,   // minutes to walk one tile
    load: 2,         // energy of collecting a worker does before carrying it home
    dayHours: 16,    // hours a day for work and walking together (work itself is at most 10)
  };
  const LIMITS = { minPerTile: [0, 60], load: [1, 20], dayHours: [10, 24] };

  const STORE_KEY = "map-v2";

  // Steps (no diagonals) from each kind of place to the nearest house: the nearest such tile to any
  // house. Infinity if there's no house or none of that place.
  function distances(tiles) {
    const houses = [], out = {};
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === "H") houses.push([i % W, Math.floor(i / W)]);
    for (const c of PLACES) {
      let best = Infinity;
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] !== c) continue;
        const x = i % W, y = Math.floor(i / W);
        for (const [hx, hy] of houses) best = Math.min(best, Math.abs(x - hx) + Math.abs(y - hy));
      }
      out[c] = best;
    }
    return out;
  }

  // Hours for one round trip to a place `d` steps from the house
  const tripHours = (d, m) => (2 * d * m.minPerTile) / 60;

  // What the village model needs: round-trip hours to the pasture, farm, forest and mine, the load and the day
  function travelOf(m) {
    const d = distances(m.tiles);
    return { pasture: tripHours(d.P, m), farm: tripHours(d.F, m), forest: tripHours(d.T, m), mine: tripHours(d.M, m), load: m.load, dayHours: m.dayHours };
  }

  // The map the Map page last saved, or null if it hasn't saved one
  function savedParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return null;
      const m = { ...DEFAULTS };
      if (typeof saved.tiles === "string" && saved.tiles.length === W * H && /^[.HFPTM]+$/.test(saved.tiles)) m.tiles = saved.tiles;
      for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
        const v = Number(saved[k]);
        if (k in saved && isFinite(v)) m[k] = Math.min(hi, Math.max(lo, v));
      }
      return m;
    } catch (e) {
      return null;
    }
  }

  window.MapModel = { W, H, TYPES, PLACES, DEFAULTS, LIMITS, STORE_KEY, defaultTiles, distances, tripHours, travelOf, savedParams };
})();
