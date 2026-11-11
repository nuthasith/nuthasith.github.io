/* Small, offline-friendly reading helpers for all three guides. */
(function () {
  "use strict";
  var toc = document.querySelector("nav.toc details");
  var compact = window.matchMedia("(max-width: 900px)");
  function syncContents() { if (toc) toc.open = !compact.matches; }
  syncContents();
  compact.addEventListener("change", syncContents);

  var announcer = document.createElement("div");
  announcer.className = "sr-only";
  announcer.setAttribute("role", "status");
  document.body.appendChild(announcer);
  document.querySelectorAll(".code").forEach(function (box) {
    var pre = box.querySelector("pre");
    if (!pre) return;
    var tools = document.createElement("div");
    tools.className = "code-tools";
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy this example");
    button.addEventListener("click", function () {
      function copied() {
        button.textContent = "Copied";
        announcer.textContent = "Example copied to clipboard.";
        setTimeout(function () { button.textContent = "Copy"; }, 1600);
      }
      function selectExample() {
        var range = document.createRange();
        range.selectNodeContents(pre);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = "Selected";
        announcer.textContent = "Example selected. Press Control+C or Command+C to copy.";
        setTimeout(function () { button.textContent = "Copy"; }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pre.innerText).then(copied, selectExample);
      } else { selectExample(); }
    });
    tools.appendChild(button);
    box.insertBefore(tools, pre);
  });

  document.querySelectorAll(".table").forEach(function (table) {
    table.tabIndex = 0;
    table.setAttribute("role", "region");
    var heading = table.previousElementSibling;
    table.setAttribute("aria-label", heading && /^H[2-4]$/.test(heading.tagName) ? heading.textContent.trim() : "Data table; scroll horizontally if needed");
  });

  function targetFor(hash) {
    if (!hash || hash === "#") return null;
    try { return document.getElementById(decodeURIComponent(hash.slice(1))); }
    catch (_) { return null; }
  }
  function reveal(target) {
    if (!target) return false;
    var opened = false;
    for (var parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS" && !parent.open) { parent.open = true; opened = true; }
    }
    return opened;
  }
  function revealHash() {
    var target = targetFor(window.location.hash);
    if (reveal(target)) requestAnimationFrame(function () { target.scrollIntoView(); });
  }
  document.addEventListener("click", function (event) {
    var link = event.target.closest("a[href^='#']");
    if (link) reveal(targetFor(link.getAttribute("href")));
  });
  window.addEventListener("hashchange", revealHash);
  revealHash();

  var details = Array.from(document.querySelectorAll("details.technical-detail"));
  var rail = document.querySelector("nav.toc .inner");
  if (rail) {
    var readingTools = document.createElement("div");
    readingTools.className = "reading-tools";
    if (details.length) {
      var expand = document.createElement("button");
      expand.type = "button";
      function syncExpand() {
        var allOpen = details.every(function (detail) { return detail.open; });
        expand.textContent = allOpen ? "Collapse details" : "Show all details";
        expand.setAttribute("aria-expanded", String(allOpen));
      }
      expand.addEventListener("click", function () {
        var open = !details.every(function (detail) { return detail.open; });
        details.forEach(function (detail) { detail.open = open; });
        syncExpand();
      });
      details.forEach(function (detail) { detail.addEventListener("toggle", syncExpand); });
      syncExpand();
      readingTools.appendChild(expand);
    }
    var top = document.createElement("a");
    top.href = "#top";
    top.textContent = "Back to top";
    readingTools.appendChild(top);
    (toc || rail).appendChild(readingTools);
  }

  var sections = Array.from(document.querySelectorAll("main > section[id]"));
  var links = Array.from(document.querySelectorAll("nav.toc ol a"));
  var queued = false;
  function markSection() {
    queued = false;
    var active = null;
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top <= window.innerHeight * 0.3) active = section.id;
    });
    links.forEach(function (link) {
      if (link.getAttribute("href") === "#" + active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", function () {
    if (!queued) { queued = true; requestAnimationFrame(markSection); }
  }, {passive: true});
  markSection();

  var printState;
  window.addEventListener("beforeprint", function () {
    printState = details.map(function (detail) { return detail.open; });
    details.forEach(function (detail) { detail.open = true; });
  });
  window.addEventListener("afterprint", function () {
    if (printState) details.forEach(function (detail, index) { detail.open = printState[index]; });
  });
})();
