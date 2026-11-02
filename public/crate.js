// Two pieces of the evidence board.
//
// createCrate: a photographic contact sheet, one frame per file. Frames "develop" from
// dark to pale as they are read, and flagged files get ringed in red grease pencil.
//
// The string layer: one SVG over <main> that finds every [data-pin] element, draws its
// pin head, and runs red string between pins that share a group. It measures the real
// elements, so it survives resize and re-render, and it pays itself out as you scroll.

window.createCrate = function createCrate(canvas, { blocks = 48, demo = false } = {}) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const MARK = { critical: '#ff3347', warning: '#ff9a1f' };

  let frames = [], cols = 1, rows = 1, W = 0, H = 0;
  let cursor = -1, sweeping = demo, focus = -1, showing = false, hold = 0;
  let raf = 0, visible = true, last = 0, lensX = -1, lensY = -1;

  const rng = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  function makeFrame(i) {
    const r = rng(i * 7919 + 13);
    const lines = [];
    let indent = 0;
    for (let k = 0; k < 6; k++) {
      indent = Math.max(0, Math.min(3, indent + ((r() * 3) | 0) - 1));
      lines.push({ indent, len: 0.25 + r() * 0.6 });
    }
    return { i, lines, dev: 0, devTo: 0, mark: 0, markTo: 0, severity: null, wob: Array.from({ length: 34 }, () => r() - 0.5) };
  }

  function layout(n) {
    n = Math.max(1, n);
    frames = Array.from({ length: n }, (_, i) => makeFrame(i));
    fit();
  }

  // Picks the column count that gives the biggest frames of a fixed aspect in the space.
  function fit() {
    const n = frames.length;
    if (!W || !H) return;
    let best = 1, bestW = 0;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const w = Math.min(W / c, (H / r) * 1.22);
      if (w > bestW) { bestW = w; best = c; }
    }
    cols = best;
    rows = Math.ceil(n / cols);
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (!r.width || !r.height) return;
    W = r.width; H = r.height;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fit();
  }

  function draw() {
    if (!W || !H) return;
    ctx.fillStyle = '#100d0a';
    ctx.fillRect(0, 0, W, H);
    const cw = W / cols, ch = H / rows;
    const holes = ch > 30, numbered = cw > 44;
    const stripH = holes ? Math.min(7, ch * 0.13) : 1;

    for (let r = 0; r < rows; r++) {
      const y = r * ch;
      ctx.fillStyle = '#1b1612';
      ctx.fillRect(0, y + 1, W, ch - 2);
      if (holes) {
        ctx.fillStyle = '#0a0806';
        const step = Math.max(10, cw / 4);
        for (let x = 3; x < W; x += step) {
          ctx.fillRect(x, y + 3, step * 0.42, stripH - 2);
          ctx.fillRect(x, y + ch - stripH - 1, step * 0.42, stripH - 2);
        }
      }
    }

    for (const f of frames) {
      const col = f.i % cols, row = (f.i / cols) | 0;
      const pad = Math.max(1, cw * 0.05);
      const x = col * cw + pad, y = row * ch + stripH + 1, w = cw - pad * 2, h = ch - stripH * 2 - 2;
      f.box = { x, y, w, h };
      const d = f.dev, flagged = f.severity && f.mark > 0;
      // Developing: dark negative to pale print. Clean prints settle a little dimmer so rings read.
      const dim = showing && !f.severity ? 0.72 : 1;
      const tone = v => Math.round(v * dim);
      const a = [36, 30, 25], b = flagged ? [250, 240, 220] : [226, 216, 194];
      ctx.fillStyle = 'rgb(' + a.map((v, k) => tone(v + (b[k] - v) * d)).join(',') + ')';
      ctx.globalAlpha = focus >= 0 && focus !== f.i ? 0.35 : 1;
      ctx.fillRect(x, y, w, h);
      // Tiny abstract "lines of code": a shape of a file, not its contents.
      const lh = h / 7.5, lp = w * 0.09;
      if (lh >= 1.6) {
        ctx.fillStyle = d > 0.5 ? (flagged ? '#8c1420' : '#4c4436') : '#5e5647';
        for (let k = 0; k < f.lines.length; k++) {
          const l = f.lines[k], ix = l.indent * w * 0.07;
          ctx.fillRect(x + lp + ix, y + lh * (k + 0.9), Math.max(1, (w - lp * 2 - ix) * l.len), Math.max(1, lh * 0.42));
        }
      }
      if (numbered) {
        ctx.fillStyle = '#d9a441';
        ctx.font = '700 8px "JetBrains Mono",monospace';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(f.i + 1).padStart(2, '0') + 'A', col * cw + pad + 1, row * ch + ch - 1.5);
      }
      ctx.globalAlpha = 1;
    }

    const at = frames[Math.floor(cursor)];
    if (at?.box) {
      const b = at.box;
      ctx.strokeStyle = '#ffe9b8';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    }

    // Grease pencil goes on last so rings can overlap the neighbouring frames.
    for (const f of frames) if (f.mark > 0.001 && f.box) ring(f, cw);
    if (at?.box) lens(at);

    if (focus >= 0 && frames[focus]?.box) {
      const b = frames[focus].box;
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    }
  }

  // The magnifying glass: it glides to the frame being read and enlarges its lines.
  function lens(f) {
    const b = f.box, R = Math.max(22, Math.min(64, Math.min(W, H) * 0.2));
    const gx = b.x + b.w / 2, gy = b.y + b.h / 2;
    if (lensX < 0) { lensX = gx; lensY = gy; }
    lensX += (gx - lensX) * 0.16;
    lensY += (gy - lensY) * 0.16;
    const x = lensX, y = lensY;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2a1c0c';
    ctx.lineWidth = R * 0.24;
    ctx.beginPath();
    ctx.moveTo(x + R * 0.74, y + R * 0.74);
    ctx.lineTo(x + R * 1.5, y + R * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 6.283);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#f7ecd2';
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
    ctx.fillStyle = f.severity ? '#a4162a' : '#4c4436';
    const lh = (R * 2) / 7, left = x - R * 0.72, width = R * 1.44;
    f.lines.forEach((l, k) => ctx.fillRect(left + l.indent * R * 0.14, y - R + lh * (k + 0.7), Math.max(4, (width - l.indent * R * 0.14) * l.len), Math.max(2, lh * 0.44)));
    ctx.restore();
    ctx.strokeStyle = '#c99a3f';
    ctx.lineWidth = Math.max(3, R * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 6.283);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.76, 3.5, 4.5);
    ctx.stroke();
    ctx.restore();
  }

  function ring(f, cw) {
    const { x, y, w, h } = f.box, cx = x + w / 2, cy = y + h / 2;
    const rx = Math.max(Math.min(w * 0.6, w / 2 + 7), 9), ry = Math.max(Math.min(h * 0.62, h / 2 + 7), 9), n = f.wob.length;
    const end = Math.max(2, Math.floor(n * f.mark));
    ctx.strokeStyle = MARK[f.severity] || MARK.critical;
    ctx.lineWidth = Math.max(2, Math.min(4, cw * 0.075));
    ctx.lineJoin = ctx.lineCap = 'round';
    const pt = k => {
      const t = -2.2 + (k / (n - 1)) * 7.1, grow = 1 + (k / n) * 0.07;
      // Slow wobble: a hand going round, not noise on every point.
      const wob = 1 + Math.sin(k * 0.55 + f.wob[0] * 9) * 0.035 + f.wob[1] * 0.04;
      return [cx + Math.cos(t) * rx * grow * wob, cy + Math.sin(t) * ry * grow * wob];
    };
    ctx.beginPath();
    let prev = pt(0);
    ctx.moveTo(prev[0], prev[1]);
    for (let k = 1; k < end; k++) {
      const p = pt(k);
      ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2);
      prev = p;
    }
    ctx.stroke();
  }

  function settle() {
    let moving = false;
    for (const f of frames) if (f.markDelay > 0 || Math.abs(f.dev - f.devTo) > 0.004 || Math.abs(f.mark - f.markTo) > 0.004) moving = true;
    return moving;
  }

  function tick(now) {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(now - last, 50) / 1000 || 0;
    last = now;
    if (sweeping) {
      if (hold > 0) {
        hold -= dt;
        if (hold <= 0) seedDemo();
      } else {
        const speed = frames.length / (demo ? 2.6 : 2.4);
        const prev = Math.floor(cursor);
        cursor = cursor + dt * speed;
        for (let k = Math.max(0, prev); k <= Math.floor(cursor) && k < frames.length; k++) {
          const f = frames[k];
          f.devTo = 1;
          if (f.severity) f.markTo = 1;
        }
        if (cursor >= frames.length) {
          if (demo) { hold = 3.2; cursor = -1; } else cursor = 0;
        }
      }
    }
    for (const f of frames) {
      if (f.markDelay > 0 && (f.markDelay -= dt) <= 0) f.markTo = 1;
      f.dev += (f.devTo - f.dev) * Math.min(1, dt * 7);
      f.mark += (f.markTo - f.mark) * Math.min(1, dt * 6);
    }
    draw();
    if (sweeping || settle()) schedule();
  }

  function schedule() {
    if (reduced.matches) {
      if (sweeping && demo) for (const f of frames) { f.devTo = 1; if (f.severity) f.markTo = 1; }
      for (const f of frames) {
        if (f.markDelay > 0) { f.markDelay = 0; f.markTo = 1; }
        f.dev = f.devTo;
        f.mark = f.markTo;
      }
      cursor = -1;
      draw();
      return;
    }
    if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }

  // Hero only: a decorative run where a few frames get ringed.
  function seedDemo() {
    const n = frames.length;
    for (const f of frames) { f.dev = f.devTo = 0; f.mark = f.markTo = 0; f.severity = null; }
    const r = Math.random;
    const zones = 4;
    for (let z = 0; z < zones; z++) {
      const k = Math.floor(((z + 0.15 + r() * 0.7) / zones) * n);
      frames[Math.min(n - 1, k)].severity = z === 2 ? 'warning' : 'critical';
    }
    cursor = Math.floor(n * 0.36);
    for (const f of frames.slice(0, cursor)) { f.dev = f.devTo = 1; if (f.severity) f.mark = f.markTo = 1; }
  }

  layout(blocks);
  if (demo) seedDemo();
  resize();
  new ResizeObserver(() => { resize(); draw(); }).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    schedule();
  }).observe(canvas);
  schedule();

  return {
    // Back to the unknown-contents state while a scan is running.
    scanning() {
      showing = false;
      layout(blocks);
      sweeping = true; cursor = 0; focus = -1; lensX = -1;
      schedule();
    },
    stop() { sweeping = false; cursor = -1; schedule(); },
    // Real result: one frame per file (capped), flagged files first in a scattered spread.
    // Returns a mapping so callers can point at a file's frame.
    show({ total, flagged, clean }) {
      const n = Math.min(Math.max(total, flagged.length, 1), 216);
      showing = true;
      layout(n);
      sweeping = false; cursor = -1; focus = -1;
      const slots = frames.map((_, i) => i).sort((a, b) => ((a * 7919) % n) - ((b * 7919) % n));
      const index = new Map();
      // Circled one at a time, in order of how bad they are.
      const gap = Math.min(0.26, 1.3 / Math.max(1, flagged.length));
      flagged.slice(0, n).forEach((f, k) => {
        const fr = frames[slots[k]];
        fr.severity = f.severity;
        fr.devTo = 1;
        fr.markDelay = 0.12 + k * gap;
        index.set(f.file, slots[k]);
      });
      if (clean) for (const f of frames) f.devTo = 1;
      this.index = index;
      schedule();
      return { shown: n, flaggedShown: index.size, ringTime: flagged.length ? (0.3 + flagged.length * gap) * 1000 : 450 };
    },
    focus(file) {
      focus = this.index?.has(file) ? this.index.get(file) : -1;
      if (reduced.matches) schedule();
      else { draw(); }
    },
  };
};

/* ---------- the string layer ---------- */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const main = document.querySelector('main');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'strings');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<defs>'
    + head('red', '#ff5a63', '#c4122a', '#6d0614')
    + head('amber', '#ffc75e', '#d98a12', '#7a4700')
    + head('bone', '#fffaf0', '#cfc6b1', '#6f6757')
    + head('black', '#6a6a6a', '#262320', '#050403')
    + '</defs><g class="s-shadow"></g><g class="s-red"></g><g class="s-lite"></g><g class="s-pins"></g>';
  main.append(svg);
  const layers = { shadow: svg.querySelector('.s-shadow'), red: svg.querySelector('.s-red'), lite: svg.querySelector('.s-lite'), pins: svg.querySelector('.s-pins') };

  function head(name, a, b, c) {
    return '<radialGradient id="pin-' + name + '" cx=".36" cy=".32" r=".78"><stop offset="0" stop-color="' + a + '"/><stop offset=".55" stop-color="' + b + '"/><stop offset="1" stop-color="' + c + '"/></radialGradient>';
  }

  // group name -> { segs: [{d,y1,y2}], drawn, target, paths }
  const groups = new Map();
  let queued = 0, raf = 0, last = 0, started = false;

  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  function measure() {
    queued = 0;
    const box = main.getBoundingClientRect();
    const all = [...main.querySelectorAll('[data-pin]')].filter(p => p.getClientRects().length);
    const byGroup = new Map();
    let pinsSvg = '';
    for (const p of all) {
      const r = p.getBoundingClientRect();
      const x = r.left + r.width / 2 - box.left, y = r.top + r.height / 2 - box.top;
      const c = p.dataset.c || 'red', big = p.dataset.size === 'big' ? 1.25 : 1;
      pinsSvg += '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') scale(' + big + ')">'
        + '<ellipse cx="4" cy="6" rx="7.5" ry="6.5" fill="#000" opacity=".42"/>'
        + '<circle r="7.5" fill="url(#pin-' + c + ')"/>'
        + '<circle cx="-2.4" cy="-2.8" r="1.7" fill="#fff" opacity=".75"/></g>';
      const g = p.dataset.pin;
      if (g && g !== 'solo') {
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push({ x, y, order: +(p.dataset.order || 0) });
      }
    }
    layers.pins.innerHTML = pinsSvg;

    for (const [name, pts] of byGroup) {
      pts.sort((a, b) => a.order - b.order);
      const segs = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dist = Math.hypot(b.x - a.x, b.y - a.y), sag = Math.min(dist * 0.05, 22);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
        segs.push({ d: 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1), y1: a.y, y2: b.y });
      }
      let g = groups.get(name);
      if (!g) { g = { segs: [], drawn: 0, paths: [] }; groups.set(name, g); }
      g.segs = segs;
      g.drawn = Math.min(g.drawn, segs.length);
      syncPaths(g);
    }
    // Groups with no pins left on the board lose their string.
    for (const [name, g] of groups) if (!byGroup.has(name)) { g.segs = []; g.drawn = 0; syncPaths(g); }
    advance();
  }

  function syncPaths(g) {
    while (g.paths.length > g.segs.length) g.paths.pop().forEach(p => p.remove());
    while (g.paths.length < g.segs.length) {
      const trio = [
        el('path', { class: 'str-shadow', pathLength: 1, transform: 'translate(3 5)' }),
        el('path', { class: 'str-red', pathLength: 1 }),
        el('path', { class: 'str-lite', pathLength: 1 }),
      ];
      layers.shadow.append(trio[0]); layers.red.append(trio[1]); layers.lite.append(trio[2]);
      g.paths.push(trio);
    }
    g.segs.forEach((s, i) => g.paths[i].forEach(p => p.setAttribute('d', s.d)));
    paint(g);
  }

  function paint(g) {
    g.paths.forEach((trio, i) => {
      const frac = Math.max(0, Math.min(1, g.drawn - i));
      trio.forEach(p => {
        if (frac >= 1) p.removeAttribute('stroke-dasharray'); else p.setAttribute('stroke-dasharray', frac + ' 1');
        p.style.visibility = frac > 0 ? 'visible' : 'hidden';
      });
    });
  }

  // How far the string should have got, in segments, for the current scroll position.
  function targetFor(g) {
    if (!started) return 0;
    if (reduced.matches) return g.segs.length;
    const line = scrollY + innerHeight * 0.92 - (main.getBoundingClientRect().top + scrollY);
    let t = 0;
    for (const s of g.segs) {
      if (line >= Math.max(s.y1, s.y2)) { t += 1; continue; }
      const lo = Math.min(s.y1, s.y2), span = Math.max(1, Math.abs(s.y2 - s.y1));
      if (line > lo) t += (line - lo) / span;
      break;
    }
    return t;
  }

  function advance() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
  }

  function step(now) {
    raf = 0;
    const dt = Math.min(now - last, 50) / 1000;
    last = now;
    let moving = false;
    for (const g of groups.values()) {
      const t = targetFor(g);
      if (t <= g.drawn + 0.001) continue;   // String never un-spools while the pins stay put.
      if (reduced.matches) g.drawn = t;
      else g.drawn = Math.min(t, g.drawn + dt * Math.max(2.6, (t - g.drawn) * 5));
      paint(g);
      if (g.drawn < t - 0.001) moving = true;
    }
    if (moving) raf = requestAnimationFrame(step);
  }

  const remeasure = () => { if (!queued) queued = requestAnimationFrame(measure); };
  new ResizeObserver(remeasure).observe(main);
  new MutationObserver(remeasure).observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', remeasure);
  addEventListener('scroll', advance, { passive: true });
  document.addEventListener('animationend', remeasure);
  document.fonts?.ready.then(remeasure);
  addEventListener('load', remeasure);
  // Let the lamp come up first, then pay out the string.
  setTimeout(() => { started = true; remeasure(); }, reduced.matches ? 0 : 260);
  remeasure();

  /* ---------- the lamp follows the pointer, lazily ---------- */
  const lamp = document.querySelector('.lamp i');
  if (lamp && !reduced.matches && matchMedia('(hover:hover) and (pointer:fine)').matches) {
    let tx = 0, ty = 0, x = 0, y = 0, lampRaf = 0;
    const move = () => {
      lampRaf = 0;
      x += (tx - x) * 0.09; y += (ty - y) * 0.09;
      lamp.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.5) lampRaf = requestAnimationFrame(move);
    };
    addEventListener('pointermove', e => {
      // Only part of the way to the cursor: a lamp nudged, not a torch in the hand.
      tx = (e.clientX - innerWidth * 0.5) * 0.55;
      ty = (e.clientY - innerHeight * 0.42) * 0.55;
      if (!lampRaf) lampRaf = requestAnimationFrame(move);
    }, { passive: true });
  }

  /* ---------- the tape stops when it isn't on screen ---------- */
  const tape = document.querySelector('.ticker');
  if (tape) new IntersectionObserver(([e]) => tape.classList.toggle('is-off', !e.isIntersecting)).observe(tape);
})();
