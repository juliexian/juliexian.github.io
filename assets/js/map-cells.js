/* Background for the Philadelphia to Baltimore map: a night sky of stars, with
 * a constellation of cells scattered in the sky around the US outline. Each cell holds RNA
 * dots, and one red dot per cell is labeled with a gene. The genes follow the
 * place chosen under the map. Nothing moves; the area under the cursor comes
 * into focus, as if a microscope were looking there. */
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

  var FOCUS_RADIUS = 100, LABEL_FONT = "italic 7px Karla, 'Helvetica Neue', Arial, sans-serif";
  var W = 0, H = 0, cells = [], links = [], stars = [], colors = {};
  var focus = null, pending = false;

  // Seeded random numbers so the layout is the same on every visit.
  var seed;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  function readColors() {
    var cs = getComputedStyle(document.body);
    colors.red = cs.getPropertyValue("--bs-link-color").trim() || "#f0776e";
    colors.mute = cs.getPropertyValue("--site-mute").trim() || "#a2aaa7";
    colors.star = cs.getPropertyValue("--bs-body-color").trim() || "#e0e4e2";
  }

  function genes() { return GENES[field.getAttribute("data-active")] || JHU; }

  // The map's shapes, read from the SVG and converted to canvas pixels.
  function mapShapes(box) {
    var s = svg.getBoundingClientRect(), k = s.width / 600, ox = s.left - box.left, oy = s.top - box.top;
    function pt(x, y) { return [ox + x * k, oy + y * k]; }
    var outline = svg.querySelector(".jm-outline").getAttribute("points").trim().split(/\s+/).map(function (p) {
      var xy = p.split(","); return pt(+xy[0], +xy[1]);
    });
    var lens = svg.querySelector(".jm-lens"), lc = pt(+lens.getAttribute("cx"), +lens.getAttribute("cy"));
    var line = svg.querySelector(".jm-leader");
    var homes = Array.prototype.map.call(svg.querySelectorAll(".jm-home"), function (c) {
      return pt(+c.getAttribute("cx"), +c.getAttribute("cy"));
    });
    return {
      homes: homes,
      outline: outline,
      lens: { x: lc[0], y: lc[1], r: +lens.getAttribute("r") * k },
      leader: [pt(+line.getAttribute("x1"), +line.getAttribute("y1")), pt(+line.getAttribute("x2"), +line.getAttribute("y2"))]
    };
  }

  function segDist(x, y, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], t = ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  }

  function insideOutline(x, y, o) {
    var inside = false;
    for (var i = 0, j = o.length - 1; i < o.length; j = i++) {
      if ((o[i][1] > y) !== (o[j][1] > y) && x < (o[j][0] - o[i][0]) * (y - o[i][1]) / (o[j][1] - o[i][1]) + o[i][0]) inside = !inside;
    }
    return inside;
  }

  // True where a cell may go: in the sky outside the outline, off its border, and clear of the cities, leader line, and lens.
  function open(x, y, m) {
    if (x < 2 || y < 2 || x > W - 2 || y > H - 2) return false;
    if (insideOutline(x, y, m.outline)) return false;
    for (var i = 0, j = m.outline.length - 1; i < m.outline.length; j = i++) {
      if (segDist(x, y, m.outline[i], m.outline[j]) < 6) return false;
    }
    for (var h = 0; h < m.homes.length; h++) {
      if (Math.hypot(x - m.homes[h][0], y - m.homes[h][1]) < 12) return false;
    }
    return Math.hypot(x - m.lens.x, y - m.lens.y) > m.lens.r + 6 && segDist(x, y, m.leader[0], m.leader[1]) > 6;
  }

  function build() {
    var box = field.getBoundingClientRect();
    W = box.width; H = box.height;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = LABEL_FONT;

    var m = mapShapes(box), boxes = [];
    seed = 11; cells = []; links = []; stars = [];

    // The night sky: many faint stars, a few bright ones.
    var count = Math.round(W * H / 4000);
    for (var st = 0; st < count; st++) {
      var bright = rand() < 0.04;
      stars.push({ x: rand() * W, y: rand() * H, r: bright ? 1.1 + rand() * 0.6 : 0.3 + rand() * 0.6,
                   a: bright ? 0.75 : 0.15 + rand() * 0.45, spikes: bright });
    }

    for (var tries = 0; tries < 4000 && cells.length < 45; tries++) {
      var r = 4 + rand() * 2.5, cx = rand() * W, cy = rand() * H;
      // Room for the longest name either place could put on this cell.
      var n = cells.length;
      var labelW = Math.max(ctx.measureText(JHU[n % JHU.length]).width, ctx.measureText(PENN[n % PENN.length]).width);
      var b = [cx - r - 1, cy - r - 1, cx + r * 1.2 + 4 + labelW, cy + r + 1];
      var clash = false;
      for (var q = 0; q < boxes.length && !clash; q++) {
        var o = boxes[q];
        clash = b[0] < o[2] + 4 && b[2] > o[0] - 4 && b[1] < o[3] + 4 && b[3] > o[1] - 4;
      }
      for (var gx = 0; gx <= 3 && !clash; gx++) {
        for (var gy = 0; gy <= 2 && !clash; gy++) {
          clash = !open(b[0] + (b[2] - b[0]) * gx / 3, b[1] + (b[3] - b[1]) * gy / 2, m);
        }
      }
      if (clash) continue;
      boxes.push(b);
      cells.push(makeCell(cx, cy, r, n));
    }

    // Constellation lines: join each cell to its two nearest neighbours, staying off the map.
    for (var a = 0; a < cells.length; a++) {
      var near = cells
        .map(function (c, j) { return { j: j, d: Math.hypot(c.x - cells[a].x, c.y - cells[a].y) }; })
        .filter(function (o) { return o.j !== a && o.d < 80; })
        .sort(function (p, q) { return p.d - q.d; })
        .slice(0, 2);
      for (var k = 0; k < near.length; k++) {
        var lo = Math.min(a, near[k].j), hi = Math.max(a, near[k].j), p = cells[lo], s = cells[hi];
        var crosses = false;
        for (var f = 0.25; f < 1 && !crosses; f += 0.25) crosses = !open(p.x + (s.x - p.x) * f, p.y + (s.y - p.y) * f, m);
        if (crosses) continue;
        if (!links.some(function (l) { return l[0] === lo && l[1] === hi; })) links.push([lo, hi]);
      }
    }
  }

  function makeCell(cx, cy, r, index) {
    var rot = rand() * Math.PI, stretch = 0.85 + rand() * 0.25, wobble = [], outline = [], dots = [];
    for (var k = 0; k < 3; k++) wobble.push({ a: rand() * 0.12, p: rand() * Math.PI * 2, f: k + 2 });
    for (var i = 0; i < 32; i++) {
      var t = (i / 32) * Math.PI * 2, rr = 1;
      for (k = 0; k < wobble.length; k++) rr += wobble[k].a * Math.sin(wobble[k].f * t + wobble[k].p) / wobble[k].f;
      var px = Math.cos(t) * r * rr * stretch, py = Math.sin(t) * r * rr;
      outline.push([cx + px * Math.cos(rot) - py * Math.sin(rot), cy + px * Math.sin(rot) + py * Math.cos(rot)]);
    }
    var count = 2 + Math.floor(rand() * 3);
    for (var d = 0; d < count; d++) {
      var a = rand() * Math.PI * 2, s = Math.sqrt(rand()) * r * 0.6;
      dots.push([cx + Math.cos(a) * s, cy + Math.sin(a) * s]);
    }
    // The red dot sits toward the right edge so its label clears the outline.
    var ra = (rand() - 0.5) * 0.9;
    return {
      x: cx, y: cy, outline: outline, dots: dots, index: index,
      red: [cx + Math.cos(ra) * r * 0.55, cy + Math.sin(ra) * r * 0.55], labelX: cx + r * 1.2 + 3
    };
  }

  // 0 outside the focus circle, rising smoothly to 1 at its centre.
  function focusAt(x, y) {
    if (!focus) return 0;
    var t = 1 - Math.hypot(x - focus.x, y - focus.y) / FOCUS_RADIUS;
    return t <= 0 ? 0 : t * t * (3 - 2 * t);
  }

  function draw() {
    pending = false;
    ctx.clearRect(0, 0, W, H);
    var names = genes();

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

    ctx.strokeStyle = colors.mute; ctx.lineWidth = 0.6;
    for (var l = 0; l < links.length; l++) {
      var p = cells[links[l][0]], q = cells[links[l][1]];
      ctx.globalAlpha = 0.2 + 0.25 * focusAt((p.x + q.x) / 2, (p.y + q.y) / 2);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }

    ctx.font = LABEL_FONT;
    ctx.textBaseline = "middle";
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], f = focusAt(c.x, c.y);

      ctx.beginPath();
      for (var k = 0; k < c.outline.length; k++) ctx[k ? "lineTo" : "moveTo"](c.outline[k][0], c.outline[k][1]);
      ctx.closePath();
      ctx.strokeStyle = colors.mute; ctx.globalAlpha = 0.2 + 0.5 * f; ctx.lineWidth = 0.7 + 0.4 * f; ctx.stroke();

      ctx.fillStyle = colors.mute; ctx.globalAlpha = 0.28 + 0.55 * f;
      for (var d = 0; d < c.dots.length; d++) {
        ctx.beginPath(); ctx.arc(c.dots[d][0], c.dots[d][1], 0.7 + 0.3 * f, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = colors.red; ctx.globalAlpha = 0.55 + 0.45 * f;
      ctx.beginPath(); ctx.arc(c.red[0], c.red[1], 1.1 + 0.5 * f, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colors.mute; ctx.globalAlpha = 0.4 + 0.55 * f;
      ctx.fillText(names[c.index % names.length], c.labelX, c.red[1]);
    }

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
  // Labels are measured in the site font, so lay out again once it has loaded.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { build(); draw(); });
})();
