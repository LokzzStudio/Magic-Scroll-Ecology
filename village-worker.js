// The village pages' extra runs (the Strategy page's other players), off the page's own thread: the same
// models and the same VillageModel.run, posted back as the page's summary of a run (village-page.js,
// runQueued). A run takes everything from its cfg; the map's day comes as the map itself (cfg.travel
// holds functions, which can't be posted) and is worked out here.
self.window = self;
self.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };   // the models' saved-settings lookups, unused by a run
importScripts("herd-model.js", "human-model.js", "food-model.js", "map-model.js", "roles-model.js", "weather-model.js", "day-model.js", "strategy-model.js", "village-model.js", "micro-model.js");
self.onmessage = (e) => {
  const { cfg, map } = e.data;
  if (map) cfg.travel = MapModel.travelOf(map);
  const r = VillageModel.run(cfg);
  self.postMessage({ survived: r.survived, extinctDay: r.extinctDay, last: r.last, end: r.counts[r.last] || 0, counts: r.counts, tally: r.tally }, [r.counts.buffer]);
};
