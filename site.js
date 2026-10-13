// The sidebar on every page, from one list. Load it right after <nav class="sidenav" data-page="...">,
// where data-page is the page's file name.
(function () {
  const PAGES = [
    ["index.html", "Herd", "Set the parameters"],
    ["humans.html", "Humans", "Couples &amp; children"],
    ["farm.html", "Food", "Harvest, stores &amp; spoiling"],
    ["advisor.html", "Advisor", "Food advisor &amp; rations"],
    ["production.html", "Production", "Food needs workers"],
    ["attribute.html", "Attribute", "Power &amp; intelligence"],
    ["inheritance.html", "Inheritance", "Children take after parents"],
    ["education.html", "Education", "A scholar teaches children"],
  ];
  const nav = document.querySelector("nav.sidenav");
  const here = nav.dataset.page;
  nav.innerHTML = `<a class="brand" href="index.html"><span class="mark" aria-hidden="true">牧</span><span class="name">Magic Scroll Ecology</span></a>` +
    `<div class="tabs">${PAGES.map(([href, name, sub]) => `<a href="${href}"${href === here ? ' aria-current="page"' : ""}>${name}<small>${sub}</small></a>`).join("")}</div>`;
})();
