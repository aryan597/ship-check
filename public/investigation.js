// The room around the evidence board: depth as you scroll, and a torch-lit investigation
// while a scan runs. Everything here is atmosphere. Facts on the page come from the scan,
// the notes below only narrate which real step the scanner has reached.
window.Investigation = (function () {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover:hover) and (pointer:fine)');
  const body = document.body;
  const cork = document.querySelector('.depth-cork');
  const scraps = [...document.querySelectorAll('.scrap')];
  const dust = document.querySelector('.dust');
  const torch = document.querySelector('.torch i');
  const CORK_TILE = 520;

  // Which detective's note goes with which real scanner step.
  const NOTES = [
    [/^Connecting|^Finding/, repo => 'pulling the file on ' + repo],
    [/^Opening/, () => 'pulling the file from the archive'],
    [/^Downloading|^Code downloaded/, () => 'bringing the code in'],
    [/^Files to read/, () => 'laying everything out on the table'],
    [/^Looking for/, () => 'checking what it would do to you'],
    [/^Working out/, () => 'working out how you’d run it'],
    [/^Finished/, () => 'the evidence is in'],
  ];

  /* ---------- the typed note ---------- */
  let typing = 0, currentRepo = '';
  function note(text) {
    const el = document.querySelector('#gumshoe');
    if (!el) return;
    clearInterval(typing);
    if (reduced.matches) { el.textContent = text; return; }
    let i = 0;
    el.textContent = '';
    typing = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(typing);
    }, 24);
  }

  /* ---------- one loop drives every layer, and only while there's something to move ---------- */
  let px = 0, py = 0, tx = 0, ty = 0, sy = scrollY, lastPointer = 0;
  let tcx = 0, tcy = 0, aim = null, raf = 0, lastT = 0, motes = [], dctx = null;
  const motion = () => !reduced.matches && finePointer.matches;

  function seedDust() {
    if (!dust) return;
    dctx = dust.getContext('2d');
    const size = () => { dust.width = innerWidth; dust.height = innerHeight; };
    size();
    addEventListener('resize', size);
    motes = Array.from({ length: 34 }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.6 + Math.random() * 1.5, z: 0.2 + Math.random() * 0.8,
      vx: (Math.random() - 0.5) * 0.006, vy: -0.002 - Math.random() * 0.006,
      p: Math.random() * 6.28,
    }));
  }

  function frame(now) {
    raf = 0;
    if (document.hidden) return;
    const dt = Math.min(now - lastT, 50) / 1000 || 0;
    lastT = now;
    sy += (scrollY - sy) * Math.min(1, dt * 8);
    px += (tx - px) * Math.min(1, dt * 4);
    py += (ty - py) * Math.min(1, dt * 4);

    if (motion()) {
      // The cork is the far wall, scraps sit between it and the paper, dust is nearest.
      const drift = (sy * 0.14) % CORK_TILE;
      if (cork) cork.style.transform = 'translate3d(' + (px * -10).toFixed(2) + 'px,' + (py * -10 - drift).toFixed(2) + 'px,0)';
      for (const s of scraps) {
        const d = +s.dataset.depth || 0.2;
        s.style.transform = 'translate3d(' + (px * d * -46).toFixed(2) + 'px,' + (py * d * -46 + sy * d).toFixed(2) + 'px,0) rotate(' + (s.dataset.r || 0) + 'deg)';
      }
      if (dctx) {
        const W = dust.width, H = dust.height;
        dctx.clearRect(0, 0, W, H);
        for (const m of motes) {
          m.x = (m.x + m.vx * dt + 1) % 1;
          m.y = (m.y + m.vy * dt + 1) % 1;
          const x = ((m.x * W + px * m.z * 34) % W + W) % W;
          const y = ((m.y * H - sy * m.z * 0.34 + py * m.z * 34) % H + H) % H;
          dctx.globalAlpha = 0.1 + 0.26 * m.z * (0.6 + 0.4 * Math.sin(now / 1400 + m.p));
          dctx.fillStyle = '#ffe2b0';
          dctx.beginPath();
          dctx.arc(x, y, m.r, 0, 6.283);
          dctx.fill();
        }
      }
    }

    if (body.classList.contains('is-investigating') && torch) {
      // The beam searches by itself, until you take the torch with your pointer.
      const t = now / 1000, W = innerWidth, H = innerHeight;
      let gx = W * (0.5 + Math.sin(t * 0.8) * 0.33), gy = H * (0.46 + Math.sin(t * 1.27 + 1) * 0.26);
      if (aim) { gx = aim.x; gy = aim.y; }
      else if (motion() && now - lastPointer < 2400) { gx = (tx + 1) * W / 2; gy = (ty + 1) * H / 2; }
      tcx += (gx - tcx) * Math.min(1, dt * 3.4);
      tcy += (gy - tcy) * Math.min(1, dt * 3.4);
      torch.style.transform = 'translate3d(' + (tcx - W / 2).toFixed(1) + 'px,' + (tcy - H / 2).toFixed(1) + 'px,0)';
    }
    schedule();
  }

  function schedule() {
    if (raf || reduced.matches) return;
    if (motion() || body.classList.contains('is-investigating')) raf = requestAnimationFrame(frame);
  }

  addEventListener('pointermove', e => {
    tx = (e.clientX / innerWidth) * 2 - 1;
    ty = (e.clientY / innerHeight) * 2 - 1;
    lastPointer = performance.now();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastT = performance.now(); schedule(); } });

  /* ---------- paper gets pinned up as you reach it ---------- */
  if ('IntersectionObserver' in window && !reduced.matches) {
    const papers = [...document.querySelectorAll('.why-lead,.why-card,.why-close,.receipt,.catch,.try-it')];
    const seen = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        e.target.classList.remove('await-pin');
        e.target.classList.add('pinned');
        seen.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -6% 0px' });
    papers.forEach((p, i) => {
      if (p.getBoundingClientRect().top < innerHeight) return;
      p.classList.add('await-pin');
      p.style.setProperty('--wait', (i % 3) * 70 + 'ms');
      seen.observe(p);
    });
  }

  seedDust();
  lastT = performance.now();
  schedule();

  /* ---------- the case ---------- */
  function clearRoom() {
    body.classList.remove('is-investigating', 'lights-on');
    aim = null;
    clearInterval(typing);
  }

  let lightsTimer = 0;
  return {
    start(repo) {
      clearTimeout(lightsTimer);
      currentRepo = repo;
      body.classList.remove('lights-on');
      if (reduced.matches) return;
      tcx = innerWidth / 2;
      tcy = innerHeight / 2;
      aim = null;
      body.classList.add('is-investigating');
      lastT = performance.now();
      schedule();
    },
    // A real progress message arrived from the scanner.
    step(message) {
      const match = NOTES.find(([re]) => re.test(message));
      if (match) note(match[1](currentRepo));
    },
    note,
    // Swing the beam onto something while the evidence comes together.
    aimAt(el) {
      if (!el) return;
      const r = el.getBoundingClientRect();
      aim = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    // Stamp's down: the overhead lights flicker on.
    lightsOn() {
      if (!body.classList.contains('is-investigating')) return;
      body.classList.add('lights-on');
      clearTimeout(lightsTimer);
      lightsTimer = setTimeout(clearRoom, 800);
    },
    abort() {
      clearTimeout(lightsTimer);
      clearRoom();
    },
  };
})();
