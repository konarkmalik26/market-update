/* Dashboard behaviour: sortable/filterable tables, tabs, charts, persisted preferences. */
(function () {
  "use strict";

  function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; } }
  // with scripts running, tab panels are hidden until chosen; without them (blocked scripts) every section stays visible
  document.documentElement.classList.add("js");

  // ---------------------------------------------------------------- sidebar
  var btn = document.querySelector(".menu-btn");
  if (btn) btn.addEventListener("click", function () { document.querySelector(".sidebar").classList.toggle("open"); });

  // ---------------------------------------------------------------- theme toggle
  var saved = store("mbi-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  var tbtn = document.getElementById("theme-toggle");
  if (tbtn) tbtn.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var dark = cur ? cur === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    store("mbi-theme", next);
    location.reload();
  });

  // ---------------------------------------------------------------- sortable tables
  function cellValue(td) {
    var v = td.getAttribute("data-v");
    if (v === null) v = td.textContent.trim();
    var cleaned = String(v).replace(/[,%+\s▲▼]/g, "");
    var n = Number(cleaned);
    return cleaned !== "" && !isNaN(n) ? n : String(v).toLowerCase();
  }
  document.querySelectorAll("table.sortable").forEach(function (table) {
    table.querySelectorAll("th").forEach(function (th, idx) {
      if (th.classList.contains("nosort")) return;
      th.classList.add("sortable");
      th.addEventListener("click", function () {
        var tbody = table.tBodies[0];
        var rows = Array.prototype.slice.call(tbody.rows);
        var asc = !th.classList.contains("sort-asc");
        table.querySelectorAll("th").forEach(function (h) { h.classList.remove("sort-asc", "sort-desc"); });
        th.classList.add(asc ? "sort-asc" : "sort-desc");
        rows.sort(function (a, b) {
          var x = cellValue(a.cells[idx]), y = cellValue(b.cells[idx]);
          if (x === "" || x === "n/a") return 1;
          if (y === "" || y === "n/a") return -1;
          if (x < y) return asc ? -1 : 1;
          if (x > y) return asc ? 1 : -1;
          return 0;
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  });

  // ---------------------------------------------------------------- table filters
  document.querySelectorAll("[data-filter-for]").forEach(function (input) {
    var table = document.getElementById(input.getAttribute("data-filter-for"));
    if (!table) return;
    var apply = function () {
      var text = (document.querySelector("[data-filter-for='" + table.id + "'][type=search]") || {}).value || "";
      text = text.toLowerCase();
      var selects = document.querySelectorAll("select[data-filter-for='" + table.id + "']");
      Array.prototype.forEach.call(table.tBodies[0].rows, function (row) {
        var ok = !text || row.textContent.toLowerCase().indexOf(text) >= 0;
        selects.forEach(function (sel) {
          var col = sel.getAttribute("data-col");
          if (sel.value && ok) ok = (row.getAttribute("data-" + col) || "").split(" ").indexOf(sel.value) >= 0;
        });
        row.style.display = ok ? "" : "none";
      });
    };
    input.addEventListener("input", apply);
    input.addEventListener("change", apply);
  });

  // ---------------------------------------------------------------- linked items clear the sticky top bar
  var topbar = document.querySelector(".topbar");
  function padTop() { if (topbar) document.documentElement.style.scrollPaddingTop = (topbar.offsetHeight + 8) + "px"; }
  padTop();
  window.addEventListener("resize", padTop);

  // ---------------------------------------------------------------- tabs (hash-addressable, remembered per page)
  document.querySelectorAll(".tabs").forEach(function (tabs) {
    if (tabs.classList.contains("tabs-css")) return;   // exported pages: radio-button tabs driven by CSS alone
    var key = "mbi-tab-" + location.pathname;
    function show(id) {
      tabs.querySelectorAll("a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + id); });
      document.querySelectorAll(".tabpanel").forEach(function (p) { p.classList.toggle("active", p.id === id); });
      store(key, id);
      window.dispatchEvent(new Event("resize"));
    }
    tabs.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        show(a.getAttribute("href").slice(1));
        try { history.replaceState(null, "", a.getAttribute("href")); } catch (err) { /* sandboxed viewers refuse history changes */ }
      });
    });
    var initial = (location.hash || "").slice(1) || store(key);
    var first = tabs.querySelector("a");
    // a hash may name an element inside a panel (methodology#glossary-nifty50): open its panel, then scroll to it
    var target = initial ? document.getElementById(initial) : null, inner = null;
    if (target && !target.classList.contains("tabpanel")) {
      var panel = target.closest ? target.closest(".tabpanel") : null;
      inner = panel ? target : null;
      initial = panel ? panel.id : null;
    }
    if (!initial || !document.getElementById(initial)) initial = first ? first.getAttribute("href").slice(1) : null;
    if (initial) show(initial);
    if (inner) setTimeout(function () { inner.scrollIntoView(); }, 0);
  });

  // ---------------------------------------------------------------- date picker persistence
  var datePick = document.getElementById("as-of-date");
  if (datePick) datePick.addEventListener("change", function () { store("mbi-date", datePick.value); });

  // ---------------------------------------------------------------- charts
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function baseChart(el, height) {
    return LightweightCharts.createChart(el, {
      height: height || el.clientHeight || 360,
      layout: { background: { type: "solid", color: "transparent" }, textColor: css("--text-2"), fontSize: 11 },
      grid: { vertLines: { color: css("--border") }, horzLines: { color: css("--border") } },
      rightPriceScale: { borderColor: css("--border") },
      timeScale: { borderColor: css("--border") },
      crosshair: { mode: 0 },
      autoSize: true,
    });
  }
  function seq(dates, values) {
    var out = [];
    for (var i = 0; i < dates.length; i++) if (values[i] !== null && values[i] !== undefined) out.push({ time: dates[i], value: values[i] });
    return out;
  }

  window.MBI = {
    candles: function (el, data, opts) {
      opts = opts || {};
      if (!window.LightweightCharts || !data || data.status !== "ok") { el.innerHTML = '<div class="empty"><strong>Chart unavailable</strong>' + (data && data.status ? "No verified price history." : "") + "</div>"; return; }
      var chart = baseChart(el);
      var s = chart.addCandlestickSeries({ upColor: css("--pos"), downColor: css("--neg"), borderVisible: false, wickUpColor: css("--pos"), wickDownColor: css("--neg") });
      s.setData(data.dates.map(function (d, i) { var o = data.ohlc[i]; return { time: d, open: o[0], high: o[1], low: o[2], close: o[3] }; }));
      var colors = { sma20: "#c084fc", sma50: "#f59e0b", sma200: "#2563eb" };
      ["sma20", "sma50", "sma200"].forEach(function (k) { if (data[k]) chart.addLineSeries({ color: colors[k], lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(seq(data.dates, data[k])); });
      if (data.bb_upper && opts.bands !== false) {
        [data.bb_upper, data.bb_lower].forEach(function (arr) { chart.addLineSeries({ color: css("--text-3"), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false }).setData(seq(data.dates, arr)); });
      }
      var vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, color: css("--border") });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(seq(data.dates, data.volume).map(function (p) { return { time: p.time, value: p.value, color: css("--text-3") + "55" }; }));
      (opts.zones || []).forEach(function (z) {
        var col = z.kind === "support" ? css("--pos") : css("--neg");
        s.createPriceLine({ price: z.high, color: col, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: z.kind + " zone" });
        s.createPriceLine({ price: z.low, color: col, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: "" });
      });
      (opts.levels || []).forEach(function (lv) { if (lv.price) s.createPriceLine({ price: lv.price, color: lv.color || css("--accent"), lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: lv.title }); });
      chart.timeScale().fitContent();
      return chart;
    },
    line: function (el, series, opts) {
      opts = opts || {};
      if (!window.LightweightCharts || !series || !series.length || !series.some(function (s) { return s.data && s.data.length; })) { el.innerHTML = '<div class="empty"><strong>No data</strong>' + (opts.empty || "No verified observations stored for this series.") + "</div>"; return; }
      var chart = baseChart(el);
      var palette = [css("--accent"), "#f59e0b", css("--pos"), css("--unverified"), css("--neg")];
      series.forEach(function (s, i) {
        var ls = chart.addLineSeries({ color: s.color || palette[i % palette.length], lineWidth: 2, lineStyle: s.dashed ? 2 : 0, title: s.name || "", priceLineVisible: false });
        ls.setData(s.data);
      });
      chart.timeScale().fitContent();
      return chart;
    },
    rsi: function (el, data) {
      if (!window.LightweightCharts || !data || data.status !== "ok") return;
      var chart = baseChart(el);
      var s = chart.addLineSeries({ color: css("--unverified"), lineWidth: 1, priceLineVisible: false });
      s.setData(seq(data.dates, data.rsi));
      [30, 70].forEach(function (v) { s.createPriceLine({ price: v, color: css("--text-3"), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" }); });
      chart.timeScale().fitContent();
      return chart;
    },
  };
})();

/* Generic data-driven charts: <div class="chart" data-chart='[{"kind":"series","id":"US_TSY_10Y","name":"US 10Y"}]'></div>
   kinds: series (macro_observations), index (index_bars close), spread (a minus b in bps), portfolio (model portfolio NAV,
   rebased indices and estimate paths in INR). Range buttons: .range-btns button[data-range]. */
(function () {
  var cache = {};
  function url(spec) {
    if (spec.kind === "index") return "/api/index/" + encodeURIComponent(spec.id);
    if (spec.kind === "spread") return "/api/spread?a=" + encodeURIComponent(spec.a) + "&b=" + encodeURIComponent(spec.b);
    if (spec.kind === "portfolio") return "/api/portfolio/series/" + encodeURIComponent(spec.id);
    return "/api/series/" + encodeURIComponent(spec.id);
  }
  function get(spec) {
    var u = url(spec);
    if (window.MBI_DATA) { var d = window.MBI_DATA[u]; return Promise.resolve(d ? (d.data || []) : []); }
    if (window.MBI_DATA_MAP) { if (!window.MBI_DATA_MAP[u]) return Promise.resolve([]); u = window.MBI_DATA_MAP[u]; }
    if (!cache[u]) cache[u] = fetch(u).then(function (r) { return r.json(); }).then(function (j) { return j.data || []; }).catch(function () { return []; });
    return cache[u];
  }
  function cutoff(range) {
    if (!range || range === "all") return null;
    var d = new Date(); var m = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, "2y": 24 }[range] || 12;
    d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10);
  }
  function draw(el, range) {
    var specs; try { specs = JSON.parse(el.getAttribute("data-chart")); } catch (e) { return; }
    Promise.all(specs.map(get)).then(function (all) {
      var c = cutoff(range);
      var series = specs.map(function (s, i) {
        var data = all[i].filter(function (p) { return p.value !== null && (!c || p.time >= c); });
        if (s.rebase && data.length) { var b = data[0].value; data = data.map(function (p) { return { time: p.time, value: +(p.value / b * 100).toFixed(3) }; }); }
        return { name: s.name || s.id || (s.a + " - " + s.b), data: data, dashed: !!s.dashed, color: s.color };
      });
      el.innerHTML = "";
      if (window.MBI) window.MBI.line(el, series, { empty: el.getAttribute("data-empty") || "History builds up with each daily refresh." });
      var last = el.parentNode.querySelector(".chart-last");
      if (last) {
        last.textContent = series.filter(function (s) { return s.data.length; }).map(function (s) {
          var p = s.data[s.data.length - 1]; return s.name + ": " + p.value + " (" + p.time + ")";
        }).join("  |  ");
      }
    });
  }
  function init() {
    document.querySelectorAll("[data-chart]").forEach(function (el) {
      var card = el.closest(".card") || el.parentNode;
      var range = el.getAttribute("data-range") || "1y";
      var btns = card.querySelectorAll(".range-btns button");
      btns.forEach(function (b) {
        if (b.getAttribute("data-range") === range) b.classList.add("active");
        b.addEventListener("click", function () {
          btns.forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active");
          draw(el, b.getAttribute("data-range"));
        });
      });
      // draw when visible (tab panels hidden at load have zero width)
      if (el.offsetParent !== null) draw(el, range);
      else el.setAttribute("data-pending", range);
    });
    function drawPending() {
      setTimeout(function () {
        document.querySelectorAll("[data-pending]").forEach(function (el) {
          if (el.offsetParent !== null) { var r = el.getAttribute("data-pending"); el.removeAttribute("data-pending"); draw(el, r); }
        });
      }, 30);
    }
    document.querySelectorAll(".tabs a").forEach(function (a) { a.addEventListener("click", drawPending); });
    document.querySelectorAll("input.tabradio").forEach(function (r) { r.addEventListener("change", drawPending); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
