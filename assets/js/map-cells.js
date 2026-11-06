/* Background for the Philadelphia to Baltimore map: a night sky of stars, with
 * the US outline filled by rows of gene names ("GENE · GENE · ..."). The genes
 * follow the place chosen under the map. Nothing moves; the area under the
 * cursor comes into focus, as if a microscope were looking there. */
(function () {
  "use strict";

  var field = document.querySelector(".jm-field");
  var canvas = field && field.querySelector(".jm-cells");
  var svg = field && field.querySelector(".jm-svg");
  if (!canvas || !svg || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  // Johns Hopkins: immune checkpoint genes alternating with commonly studied genes.
  var CHECKPOINTS = ["PDCD1", "CD274", "CTLA4", "LAG3", "HAVCR2", "TIGIT", "PDCD1LG2", "IDO1", "VSIR", "CD276", "BTLA", "SIGLEC15"];
  var COMMON = ["TP53", "TNF", "EGFR", "IL6", "VEGFA", "APOE", "TGFB1", "ESR1", "MTHFR", "AKT1", "PTGS2", "CDKN2A",
                "BRCA1", "HIF1A", "ACE", "MYC", "KRAS", "ERBB2", "STAT3", "BCL2"];
  var JHU = [];
  for (var i = 0; i < Math.max(CHECKPOINTS.length, COMMON.length); i++) {
    if (COMMON[i]) JHU.push(COMMON[i]);
    if (CHECKPOINTS[i]) JHU.push(CHECKPOINTS[i]);
  }
  // Penn and CHOP: pediatric neurodevelopmental and epilepsy genes.
  var PENN = ["STXBP1", "SYNGAP1", "SCN1A", "SCN2A", "SCN8A", "KCNQ2", "CDKL5", "MECP2", "FOXG1", "GRIN2A",
              "GRIN2B", "PCDH19", "SLC2A1", "DEPDC5", "TSC1", "TSC2", "KCNT1", "GABRA1", "GABRB3", "CHD2",
              "ARX", "DNM1", "HNRNPU", "SLC6A1", "KCNB1", "CACNA1A", "GNAO1", "ARID1B", "DYRK1A", "SHANK3"];
  var GENES = { "place-jhu": JHU, "place-penn": PENN };

  var FOCUS_RADIUS = 100, FONT_PX = 6.5, LINE_H = 8.5, SEP = " · ";
  var LABEL_FONT = "italic " + FONT_PX + "px Karla, 'Helvetica Neue', Arial, sans-serif";
  var W = 0, H = 0, stars = [], shapes = null, colors = {};
  var focus = null, pending = false;

  // Seeded random numbers so the layout is the same on every visit.
  var seed;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  function readColors() {
    var cs = getComputedStyle(document.body);
    colors.red = cs.getPropertyValue("--bs-link-color").trim() || "#a82a2a";
    colors.mute = cs.getPropertyValue("--site-mute").trim() || "#5f6866";
    colors.star = cs.getPropertyValue("--bs-body-color").trim() || "#1e2322";
  }

  function genes() { return GENES[field.getAttribute("data-active")] || JHU; }

  // The map's shapes, read from the SVG and converted to canvas pixels.
  function mapShapes(box) {
    var s = svg.getBoundingClientRect(), k = s.width / 600, ox = s.left - box.left, oy = s.top - box.top;
    function pt(x, y) { return [ox + x * k, oy + y * k]; }
    var outline = svg.querySelector(".jm-outline").getAttribute("points").trim().split(/\s+/).map(function (p) {
      var xy = p.split(","); return pt(+xy[0], +xy[1]);
    });
    var homes = Array.prototype.map.call(svg.querySelectorAll(".jm-home"), function (c) {
      return pt(+c.getAttribute("cx"), +c.getAttribute("cy"));
    });
    var ys = outline.map(function (p) { return p[1]; }), xs = outline.map(function (p) { return p[0]; });
    return {
      outline: outline, homes: homes,
      top: Math.min.apply(null, ys), bottom: Math.max.apply(null, ys),
      left: Math.min.apply(null, xs), right: Math.max.apply(null, xs)
    };
  }

  function build() {
    var box = field.getBoundingClientRect();
    W = box.width; H = box.height;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    shapes = mapShapes(box);
    seed = 11; stars = [];

    // The night sky: many faint stars, a few bright ones, none inside the outline.
    var count = Math.round(W * H / 4000);
    for (var st = 0; st < count; st++) {
      var bright = rand() < 0.04;
      var star = { x: rand() * W, y: rand() * H, r: bright ? 1.1 + rand() * 0.6 : 0.3 + rand() * 0.6,
                   a: bright ? 0.75 : 0.15 + rand() * 0.45, spikes: bright };
      if (!insideOutline(star.x, star.y, shapes.outline)) stars.push(star);
    }
  }

  function insideOutline(x, y, o) {
    var inside = false;
    for (var i = 0, j = o.length - 1; i < o.length; j = i++) {
      if ((o[i][1] > y) !== (o[j][1] > y) && x < (o[j][0] - o[i][0]) * (y - o[i][1]) / (o[j][1] - o[i][1]) + o[i][0]) inside = !inside;
    }
    return inside;
  }

  // 0 outside the focus circle, rising smoothly to 1 at its centre.
  function focusAt(x, y) {
    if (!focus) return 0;
    var t = 1 - Math.hypot(x - focus.x, y - focus.y) / FOCUS_RADIUS;
    return t <= 0 ? 0 : t * t * (3 - 2 * t);
  }

  // Rows of gene names, clipped to the outline and kept clear of the two city dots.
  function drawGeneFill(names) {
    var m = shapes;
    ctx.save();
    ctx.beginPath();
    m.outline.forEach(function (p, i) { ctx[i ? "lineTo" : "moveTo"](p[0], p[1]); });
    ctx.closePath();
    m.homes.forEach(function (h) { ctx.moveTo(h[0] + 5, h[1]); ctx.arc(h[0], h[1], 5, 0, Math.PI * 2, true); });
    ctx.clip("evenodd");

    ctx.font = LABEL_FONT;
    ctx.textBaseline = "middle";
    ctx.fillStyle = colors.mute;
    var sepW = ctx.measureText(SEP).width, g = 0;
    for (var row = 0, y = m.top + LINE_H * 0.6; y < m.bottom; row++, y += LINE_H) {
      // Each row starts a little left of the outline, staggered so names don't line up in columns.
      var x = m.left - ((row * 37) % 60);
      while (x < m.right) {
        var name = names[g++ % names.length], w = ctx.measureText(name).width;
        ctx.globalAlpha = 0.42 + 0.53 * focusAt(x + w / 2, y);
        ctx.fillText(name, x, y);
        x += w;
        ctx.fillStyle = colors.red;
        ctx.globalAlpha = 0.45 + 0.45 * focusAt(x + sepW / 2, y);
        ctx.fillText(SEP, x, y);
        ctx.fillStyle = colors.mute;
        x += sepW;
      }
    }
    ctx.restore();
  }

  function draw() {
    pending = false;
    if (!shapes) return;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = colors.star; ctx.strokeStyle = colors.star;
    for (var t = 0; t < stars.length; t++) {
      var st = stars[t], sf = focusAt(st.x, st.y);
      ctx.globalAlpha = Math.min(1, st.a + 0.4 * sf);
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
      if (st.spikes) {
        ctx.globalAlpha *= 0.5; ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(st.x - 4, st.y); ctx.lineTo(st.x + 4, st.y);
        ctx.moveTo(st.x, st.y - 4); ctx.lineTo(st.x, st.y + 4);
        ctx.stroke();
      }
    }

    drawGeneFill(genes());

    // Round field of view: clearest in the middle (or under the cursor), dimmer toward the edges.
    var fx = focus ? focus.x : W / 2, fy = focus ? focus.y : H / 2;
    var view = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(W, H) * 0.65);
    view.addColorStop(0, "rgba(0,0,0,1)");
    view.addColorStop(0.5, "rgba(0,0,0,0.8)");
    view.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = view; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  function redraw() {
    if (!pending) { pending = true; requestAnimationFrame(draw); }
  }

  field.addEventListener("pointermove", function (e) {
    var box = field.getBoundingClientRect();
    focus = { x: e.clientX - box.left, y: e.clientY - box.top };
    redraw();
  });
  field.addEventListener("pointerleave", function () { focus = null; redraw(); });

  if ("ResizeObserver" in window) {
    var lastW = 0;
    new ResizeObserver(function () {
      var w = field.getBoundingClientRect().width;
      if (Math.abs(w - lastW) < 1) return;
      lastW = w; build(); draw();
    }).observe(field);
  }
  // Swap gene names when a place is chosen.
  new MutationObserver(redraw).observe(field, { attributes: true, attributeFilter: ["data-active"] });
  // Redraw in the new colors when the light/dark toggle changes the body class.
  new MutationObserver(function () { readColors(); draw(); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  readColors(); build(); draw();
  // Names are measured in the site font, so lay out again once it has loaded.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { build(); draw(); });
})();
