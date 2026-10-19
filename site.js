// The sidebar on every page, from one list, and the Jobs button next to Reset. Load roles-model.js,
// then this, right after <nav class="sidenav" data-page="...">, where data-page is the page's file name.
(function () {
  const PAGES = [
    ["index.html", "Herd", "Set the parameters"],
    ["humans.html", "Humans", "Couples &amp; children"],
    ["farm.html", "Food", "Harvest, stores &amp; rations"],
    ["map.html", "Map", "Where things are"],
    ["attribute.html", "Attribute", "Power &amp; intelligence"],
    ["inheritance.html", "Inheritance", "Children take after parents"],
    ["education.html", "Education", "A scholar teaches children"],
    ["happiness.html", "Happiness", "Happy couples have children"],
    ["resources.html", "Resources", "Sheep, timber, stone &amp; skills"],
    ["craft.html", "Craft", "Weaving &amp; forging"],
    ["weather.html", "Weather", "Clouds &amp; wind"],
  ];
  const nav = document.querySelector("nav.sidenav");
  const here = nav.dataset.page;
  nav.innerHTML = `<a class="brand" href="index.html"><span class="mark" aria-hidden="true">牧</span><span class="name">Magic Scroll Ecology</span></a>` +
    `<div class="tabs">${PAGES.map(([href, name, sub]) => `<a href="${href}"${href === here ? ' aria-current="page"' : ""}>${name}<small>${sub}</small></a>`).join("")}</div>`;

  // ---------- Jobs: who can do what ----------
  // A button before "Reset to defaults" opens a table of roles × jobs; changes save at once and the
  // village pages rerun (RolesModel sends "roles-change").
  function jobsDialog() {
    const { JOBS, ROLES, SIMULATED } = RolesModel;
    const dlg = document.createElement("dialog");
    dlg.className = "jobs-dialog";
    dlg.setAttribute("aria-label", "Who can do which job");
    document.body.appendChild(dlg);
    const draw = () => {
      const t = RolesModel.current();
      dlg.innerHTML = `<div class="jobs-head"><h2>Jobs</h2><p>Who can do which job. Used from the Attribute page on; changes apply at once.</p></div>
        <div class="jobs-scroll"><table class="jobs-table"><thead><tr><th></th>${JOBS.map((j) =>
          `<th class="${j.used ? "" : "unused"}"><span class="zh">${j.zh}</span><small>${j.en}</small></th>`).join("")}</tr></thead><tbody>${ROLES.map((r) =>
          `<tr><th scope="row"><span class="zh">${r.zh}</span><small>${r.en}</small></th>${JOBS.map((j) => {
            const sim = SIMULATED[r.id].includes(j.id);
            return `<td class="${sim ? "" : "unused"}"><input type="checkbox" data-role="${r.id}" data-job="${j.id}"${t[r.id][j.id] ? " checked" : ""} aria-label="${r.en}: ${j.en}"></td>`;
          }).join("")}</tr>`).join("")}</tbody></table></div>
        <p class="hint">Shaded cells aren't simulated yet (no fire so far, and scholars only write poetry and teach). Old men and old women work with the elder penalty and eat less. Woodcutting, shearing and quarrying happen from the Resources page on, weaving and forging from the Craft page on. Children's 教育 is going to class; a scholar's is teaching.</p>
        <div class="btn-row"><button type="button" class="btn" data-act="defaults">Back to the default table</button><button type="button" class="btn primary" data-act="close">Done</button></div>`;
    };
    dlg.addEventListener("change", (e) => {
      const box = e.target.closest("input[data-role]");
      if (!box) return;
      const t = RolesModel.current();
      t[box.dataset.role][box.dataset.job] = box.checked;
      RolesModel.save(t);
    });
    dlg.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "close" || e.target === dlg) dlg.close();
      if (act === "defaults") { RolesModel.reset(); draw(); }
    });
    return { open: () => { draw(); dlg.showModal(); } };
  }
  // ---------- Priority: the order of the day's jobs ----------
  function priorityDialog() {
    const dlg = document.createElement("dialog");
    dlg.className = "jobs-dialog prio-dialog";
    dlg.setAttribute("aria-label", "The order of the day's jobs");
    document.body.appendChild(dlg);
    const draw = () => {
      const order = RolesModel.currentPriority(), tier = (id) => RolesModel.TIERS.find((t) => t.id === id);
      dlg.innerHTML = `<div class="jobs-head"><h2>Priority</h2><p>The order in which the day's jobs take people's energy, from the Attribute page on. Changes apply at once.</p></div>
        <ol class="prio-list">${order.map((id, k) => {
          const t = tier(id);
          return `<li><span class="prio-n">${k + 1}</span><span class="prio-name"><span class="zh">${t.zh}</span><small>${t.en}${t.page ? ` · ${t.page} page on` : ""}</small></span>
            <span class="prio-move"><button type="button" class="btn" data-up="${k}"${k === 0 ? " disabled" : ""} aria-label="Move ${t.en} up">↑</button><button type="button" class="btn" data-down="${k}"${k === order.length - 1 ? " disabled" : ""} aria-label="Move ${t.en} down">↓</button></span></li>`;
        }).join("")}</ol>
        <p class="hint">Each person goes down the list and takes the first job they may do (see Jobs) that has work for them. Children only fill food work the grown-ups can't cover; with Education above it, they go to class first while class is on. The scholar teaches when Education comes before Poetry, and only writes poetry otherwise.</p>
        <div class="btn-row"><button type="button" class="btn" data-act="defaults">Back to the default order</button><button type="button" class="btn primary" data-act="close">Done</button></div>`;
    };
    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (e.target === dlg) { dlg.close(); return; }
      if (!b) return;
      const order = RolesModel.currentPriority();
      if (b.dataset.up !== undefined || b.dataset.down !== undefined) {
        const k = Number(b.dataset.up ?? b.dataset.down), j = b.dataset.up !== undefined ? k - 1 : k + 1;
        [order[k], order[j]] = [order[j], order[k]];
        RolesModel.savePriority(order); draw();
      }
      if (b.dataset.act === "defaults") { RolesModel.resetPriority(); draw(); }
      if (b.dataset.act === "close") dlg.close();
    });
    return { open: () => { draw(); dlg.showModal(); } };
  }

  document.addEventListener("DOMContentLoaded", () => {
    const actions = document.querySelector(".top-actions"), reset = document.getElementById("reset");
    if (!actions || !window.RolesModel) return;
    const add = (label, title, make) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "btn reset"; btn.textContent = label; btn.title = title;
      let dlg = null;
      btn.addEventListener("click", () => { (dlg = dlg || make()).open(); });
      actions.insertBefore(btn, reset || null);
      return btn;
    };
    add("Jobs", "Who can do which job", jobsDialog).classList.add("jobs");
    add("Priority", "The order of the day's jobs", priorityDialog).classList.add("prio");
  });
})();
