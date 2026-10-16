// Who can do which job, for the Magic Scroll ecology pages. The Jobs button (site.js) edits it; the
// Production page and every page after it follow it.
(function () {
  // Jobs, in the table's order. `used`: the simulation has this job yet.
  const JOBS = [
    { id: "milk", zh: "採牛奶", en: "Milking", used: true },
    { id: "wood", zh: "伐木", en: "Woodcutting" },
    { id: "wool", zh: "採羊毛", en: "Shearing" },
    { id: "stone", zh: "採石", en: "Quarrying" },
    { id: "tend", zh: "耕田", en: "Tending", used: true },
    { id: "harvest", zh: "收割", en: "Harvest", used: true },
    { id: "weave", zh: "紡織", en: "Weaving" },
    { id: "forge", zh: "鍛造", en: "Forging" },
    { id: "fire", zh: "生火", en: "Fire-making" },
    { id: "read", zh: "吟詩", en: "Poetry", used: true },
    { id: "teach", zh: "教育", en: "Education", used: true },
  ];
  const ROLES = [
    { id: "child", zh: "孩子", en: "Child" },
    { id: "man", zh: "男人", en: "Man" },
    { id: "woman", zh: "女人", en: "Woman" },
    { id: "scholarM", zh: "文人 (男)", en: "Scholar, man" },
    { id: "scholarF", zh: "文人 (女)", en: "Scholar, woman" },
    { id: "elder", zh: "老人", en: "Elder" },
  ];
  // Which cells the simulation follows: food work for children, men, women and elders; poetry and
  // teaching for scholars; education (going to class) for children; woodcutting, shearing and
  // quarrying for grown-ups (Resources page), and weaving and forging (Craft page)
  const SIMULATED = {
    child: ["milk", "tend", "harvest", "teach"], man: ["milk", "wood", "wool", "stone", "tend", "harvest", "weave", "forge"], woman: ["milk", "wood", "wool", "stone", "tend", "harvest", "weave", "forge"],
    scholarM: ["read", "teach"], scholarF: ["read", "teach"], elder: ["milk", "wood", "wool", "stone", "tend", "harvest", "weave", "forge"],
  };

  const row = (...ids) => Object.fromEntries(JOBS.map((j) => [j.id, ids.includes(j.id)]));
  const DEFAULTS = {
    child: row("milk", "teach"),
    man: row("milk", "wood", "stone", "tend", "harvest", "forge", "fire"),
    woman: row("milk", "wood", "wool", "tend", "harvest", "weave", "fire"),
    scholarM: row("read", "teach"),
    scholarF: row("read", "teach"),
    elder: row("milk"),
  };

  const STORE_KEY = "roles-v1";

  // The table the Jobs button last saved, or null
  function savedParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return null;
      const out = {};
      for (const r of ROLES) {
        out[r.id] = {};
        for (const j of JOBS) out[r.id][j.id] = saved[r.id] && j.id in saved[r.id] ? !!saved[r.id][j.id] : DEFAULTS[r.id][j.id];
      }
      return out;
    } catch (e) {
      return null;
    }
  }
  const current = () => savedParams() || JSON.parse(JSON.stringify(DEFAULTS));
  function save(table) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(table)); } catch (e) {}
    window.dispatchEvent(new CustomEvent("roles-change"));
  }
  function reset() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    window.dispatchEvent(new CustomEvent("roles-change"));
  }

  // The order of the day's jobs (the Priority button), from the Attribute page on
  const TIERS = [
    { id: "milk", zh: "採牛奶", en: "Milking" },
    { id: "field", zh: "耕田 · 收割", en: "Fields: tending, or the harvest" },
    { id: "wood", zh: "伐木", en: "Woodcutting, while timber is under its target", page: "Resources" },
    { id: "craft", zh: "紡織 · 鍛造", en: "Crafts, when the materials are in store (one weaver, one smith)", page: "Craft" },
    { id: "collect", zh: "採羊毛 · 採石", en: "Shearing or quarrying: women shear first, men quarry first", page: "Resources" },
  ];
  const PRIORITY_DEFAULT = TIERS.map((t) => t.id);
  const PRIORITY_KEY = "priority-v1";
  function currentPriority() {
    try {
      const saved = JSON.parse(localStorage.getItem(PRIORITY_KEY) || "null");
      if (Array.isArray(saved) && saved.length === PRIORITY_DEFAULT.length && PRIORITY_DEFAULT.every((id) => saved.includes(id))) return saved;
    } catch (e) {}
    return PRIORITY_DEFAULT.slice();
  }
  function savePriority(order) {
    try { localStorage.setItem(PRIORITY_KEY, JSON.stringify(order)); } catch (e) {}
    window.dispatchEvent(new CustomEvent("roles-change"));
  }
  function resetPriority() {
    try { localStorage.removeItem(PRIORITY_KEY); } catch (e) {}
    window.dispatchEvent(new CustomEvent("roles-change"));
  }

  window.RolesModel = { JOBS, ROLES, SIMULATED, DEFAULTS, STORE_KEY, savedParams, current, save, reset, TIERS, PRIORITY_DEFAULT, PRIORITY_KEY, currentPriority, savePriority, resetPriority };
})();
