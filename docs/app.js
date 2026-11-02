const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REPLAY = document.documentElement.dataset.mode === 'replay';
const RANK = { critical: 0, warning: 1, info: 2 };
// Within a severity, lead with what fires by itself the moment you install or run.
const KIND_RANK = ['lifecycle', 'shell-pipe', 'exfiltration', 'obfuscation', 'secret', 'env-file', 'prompt-injection'];
const byRisk = (a, b) => RANK[a.severity] - RANK[b.severity] || KIND_RANK.indexOf(a.kind) - KIND_RANK.indexOf(b.kind);
const TRAP_ATTACKS = [['lifecycle', 'INSTALL TRAP'], ['shell-pipe', 'DOWNLOAD-AND-RUN'], ['exfiltration', 'DATA THEFT'], ['obfuscation', 'HIDDEN CODE'], ['secret', 'LEAKED KEYS'], ['prompt-injection', 'AI TRICK']];
// What each kind of finding is, in words anyone can follow.
const KIND_LABEL = { lifecycle: 'runs when you install', 'shell-pipe': 'downloads and runs code', exfiltration: 'sends your data out', obfuscation: 'hidden code', secret: 'leaked key', 'env-file': 'private settings file', 'prompt-injection': 'message to AI tools' };
const PLAN_LABEL = { 'basic plan': 'FROM THE PROJECT’S FILES', 'AI plan': 'AI-ASSISTED' };
// The bundled test repo gets a name people can read; its address stays in the URL.
const repoName = repo => repo.startsWith('local:demo/trap-repo') ? 'our planted trap repo' : repo;
const STEP_REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const PAGE_SIZE = 6;

const form = $('#scan-form'), input = $('#repo'), formError = $('#form-error'), area = $('#scan-area');
const feed = $('#feed'), verdict = $('#verdict'), evidence = $('#evidence'), side = $('#side');
const callout = $('#callout'), flow = $('#flow'), plan = $('#plan'), signals = $('#signals'), legend = $('#crate-legend'), pulse = $('#pulse');

createCrate($('#hero-crate'), { blocks: 48, demo: true });
const crate = createCrate($('#scan-crate'), { blocks: 64 });

let active = null;   // the running stream; only one scan may be live at a time
let caseId = 0;       // bumped per scan, so a stale scan can't touch the board
let firstAt = 0, lastAt = 0;
const EVENT_GAP = 420;   // the room reads one update at a time, however fast the scanner is

/* ---------- input ---------- */

// Accepts anything people paste: full URLs, SSH remotes, deep links. Returns
// owner/repo[/tree/ref], local:…, or null when it can't be a GitHub repository.
function normalize(raw) {
  const v = raw.trim();
  if (v.startsWith('local:')) return v;
  const path = v.replace(/^git@github\.com:/, '').replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '').replace(/[?#].*$/, '');
  const m = path.match(/^([\w-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([\w.-]+))?(?:\/.*)?$/);
  return m ? m[1] + '/' + m[2] + (m[3] ? '/tree/' + m[3] : '') : null;
}

function formFail(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

/* ---------- streams ---------- */

function liveStream(repo, onEvent) {
  const source = new EventSource('api/scan-stream?repo=' + encodeURIComponent(repo));
  source.onmessage = ({ data }) => onEvent(JSON.parse(data));
  // EventSource reconnects by itself, which would silently re-run the whole scan.
  // A dropped connection ends this scan instead; the user can retry.
  source.onerror = () => {
    source.close();
    onEvent({ type: 'error', error: 'We lost the connection to the scanner. Please try again.' });
  };
  return { close: () => source.close() };
}

function replayStream(repo, onEvent) {
  const timers = [];
  fetch('scans.json').then(r => r.json()).then(scans => {
    const events = scans[repo];
    if (!events) {
      onEvent({ type: 'error', error: 'This demo page can only replay the example scans. To check ' + repo + ', run ShipCheck on your computer with one command: npx github:aryan597/ship-check' });
      return;
    }
    events.forEach((e, i) => timers.push(setTimeout(() => onEvent(e), 300 + i * 420)));
  }).catch(() => onEvent({ type: 'error', error: 'We couldn’t load the example scans. Please refresh the page.' }));
  return { close: () => timers.forEach(clearTimeout) };
}

/* ---------- scan lifecycle ---------- */

// Timestamps are the scanner's own clock, so the pacing below never inflates how long a scan took.
function row(message, detail, cls = '', at = 0) {
  const e = document.createElement('div');
  e.className = 'feed-row ' + cls;
  if (at) {
    firstAt = firstAt || at;
    lastAt = at;
  }
  const t = ((lastAt - firstAt) / 1000).toFixed(1);
  e.innerHTML = '<span>+' + t + 's</span><strong>' + esc(message) + '</strong><small>' + esc(detail || '') + '</small>';
  feed.append(e);
  feed.scrollTop = feed.scrollHeight;
}

// Hands events over one at a time. Reduced motion gets them as they arrive.
function paced(handle) {
  if (STEP_REDUCED.matches) return { push: handle };
  const queue = [];
  let timer = 0, last = 0;
  const run = () => {
    timer = 0;
    last = performance.now();
    handle(queue.shift());
    if (queue.length) timer = setTimeout(run, EVENT_GAP);
  };
  return {
    push(e) {
      queue.push(e);
      if (!timer) timer = setTimeout(run, Math.max(0, last + EVENT_GAP - performance.now()));
    },
  };
}

function scan(raw, { push = true, scroll = true } = {}) {
  const repo = normalize(raw);
  if (!repo) return formFail('That doesn’t look like a GitHub project. Try github.com/owner/repo.');
  formFail('');
  active?.close();

  if (push) {
    const u = new URL(location);
    if (u.searchParams.get('repo') !== repo) {
      u.searchParams.set('repo', repo);
      history.pushState({}, '', u);
    }
  }

  const me = ++caseId;
  $('.tile-crate').classList.remove('is-sealed');
  firstAt = lastAt = 0;
  area.hidden = false;
  evidence.hidden = side.hidden = callout.hidden = flow.hidden = true;
  feed.innerHTML = '';
  pulse.hidden = false;
  $('#scan-repo').textContent = repoName(repo);
  legend.textContent = 'READING THE CODE…';
  verdict.className = 'tile tile-verdict is-scanning';
  verdict.innerHTML = caseHead('PENDING', repoName(repo)) + '<div class="verdict-label">SCANNING</div><p class="gumshoe" id="gumshoe" aria-hidden="true"></p><p class="verdict-note">Just reading. Nothing gets run.</p>';
  crate.scanning();
  Investigation.start(repo);
  if (scroll) area.scrollIntoView({ block: 'start', behavior: STEP_REDUCED.matches ? 'instant' : 'smooth' });

  row(repo.startsWith('local:') ? 'Opening the case' : 'Connecting to GitHub');
  const open = REPLAY ? replayStream : liveStream;
  const pace = paced(e => {
    if (me !== caseId) return;
    if (e.type === 'progress') {
      row(e.message, e.detail, '', e.at);
      Investigation.step(e.message);
    }
    if (e.type === 'complete') {
      row('SCAN COMPLETE', e.cached ? 'cached result' : REPLAY ? 'recorded result' : 'live result', 'row-done');
      finish(e.result, me);
    }
    if (e.type === 'error') e.code === 'sealed' ? sealed(repo) : fail(repo, e.error);
  });
  const stream = open(repo, e => {
    // Close on receipt: the server ending the response must not read as a dropped connection.
    if (e.type === 'complete' || e.type === 'error') stream.close();
    pace.push(e);
  });
  active = stream;
}

// GitHub answers "not found" for private and misspelled projects alike, so this never claims to know which.
function sealed(repo) {
  pulse.hidden = true;
  crate.stop();
  Investigation.abort();
  $('.tile-crate').classList.add('is-sealed');
  legend.textContent = 'NO FILES READ';
  row('FILE SEALED', 'nothing was read', 'row-fail');
  verdict.className = 'tile tile-verdict is-sealed slam';
  verdict.innerHTML = caseHead('SEALED', repoName(repo))
    + '<div class="verdict-label">' + stampLabel('CASE SEALED') + '</div>'
    + '<p class="gumshoe gumshoe-after" aria-hidden="true">can’t open this one.</p>'
    + '<div class="redacted" aria-hidden="true"><i></i><i></i><i></i></div>'
    + '<p class="verdict-note"><b>This project is private, or its name is misspelled.</b> GitHub gives the same answer for both, so we can’t tell which.</p>'
    + '<ul class="sealed-next"><li><b>Check the spelling</b> of the owner and project name.</li><li><b>If it’s private,</b> ShipCheck can’t read it. It only works on public projects for now.</li></ul>'
    + '<div class="verdict-actions"><button class="btn" id="try-another" type="button">TRY ANOTHER PROJECT</button> <button class="btn" id="retry" type="button">TRY AGAIN</button></div>';
  $('#retry').onclick = () => scan(repo, { scroll: false });
  $('#try-another').onclick = () => {
    scrollTo({ top: 0, behavior: STEP_REDUCED.matches ? 'instant' : 'smooth' });
    input.value = '';
    input.focus({ preventScroll: true });
  };
}

function fail(repo, message) {
  pulse.hidden = true;
  crate.stop();
  Investigation.abort();
  legend.textContent = 'NO FILES READ';
  row('SCAN FAILED', '', 'row-fail');
  verdict.className = 'tile tile-verdict is-failed';
  verdict.innerHTML = caseHead('NOT OPENED', repoName(repo)) + '<div class="verdict-label">' + stampLabel('NO VERDICT') + '</div><p class="verdict-note">' + esc(message) + '</p><div class="verdict-actions"><button class="btn" id="retry" type="button">RETRY</button></div>';
  $('#retry').onclick = () => scan(repo, { scroll: false });
}

// Closing the case: the rings go on one at a time, then the stamp comes down and the lights go up.
function finish(r, me) {
  pulse.hidden = true;
  const ringTime = renderCrate(r);
  const closeCase = () => {
    if (me !== caseId) return;
    renderVerdict(r);
    Investigation.lightsOn();
    renderCallout(r);
    renderEvidence(r);
    renderPlan(r);
    renderSignals(r);
    evidence.hidden = side.hidden = false;
    evidence.classList.add('fresh');
    setTimeout(() => evidence.classList.remove('fresh'), 1800);
    renderFlow(flow, r, { rescan: () => scan(r.repo, { push: false }), copy: bindCopy });
  };
  if (STEP_REDUCED.matches) return closeCase();
  const exhibits = r.findings.filter(f => f.severity !== 'info').length;
  Investigation.note(exhibits ? exhibits + ' exhibit' + (exhibits === 1 ? '' : 's') + ' on the board' : 'no exhibits turned up');
  Investigation.aimAt($('.tile-crate'));
  setTimeout(() => {
    if (me !== caseId) return;
    Investigation.aimAt(verdict);
    setTimeout(closeCase, 420);
  }, ringTime);
}

/* ---------- rendering ---------- */

// The folder's tab and the suspect line. The case number is only ever the scan's own counts:
// files, critical, warning.
function stampLabel(label) {
  const words = label.split(' ');
  const cut = words.length > 1 ? Math.max(1, words.length - 1) : 1;
  return '<span>' + esc(words.slice(0, cut).join(' ')) + '</span>' + (words.length > 1 ? ' <span>' + esc(words.slice(cut).join(' ')) + '</span>' : '');
}

function caseHead(number, repo) {
  return '<div class="folder-tab"><span>CASE FILE</span><b>NO. ' + esc(number) + '</b></div><i class="pin pin-verdict" data-pin="case" data-order="1" data-size="big"></i>'
    + '<div class="tile-head"><span>01 // VERDICT</span></div>'
    + '<div class="suspect"><span>the suspect:</span><b>' + esc(repo) + '</b></div>';
}

function renderVerdict(r) {
  const v = r.verdict;
  const tone = v.label === 'DO NOT RUN' ? 'is-danger' : v.label === 'RUN WITH CARE' ? 'is-care' : 'is-safe';
  const files = r.sampled ? r.fileCount + ' / ' + r.totalFileCount : r.fileCount;
  const note = v.critical
    ? ([...r.findings].sort(byRisk)[0]?.why || 'We found something serious.')
    : v.warning
      ? 'Nothing serious, but have a quick read of the warnings first.'
      : 'No red flags in the files we read. That’s a good sign, not a guarantee.';
  verdict.className = 'tile tile-verdict ' + tone + ' slam';
  const caseNo = 'SC-' + String(r.fileCount).padStart(4, '0') + '-' + v.critical + 'C-' + v.warning + 'W';
  verdict.innerHTML = caseHead(caseNo, repoName(r.repo))
    + '<div class="verdict-label">' + stampLabel(v.label) + '</div>'
    + '<p class="gumshoe gumshoe-after" aria-hidden="true">' + (v.critical ? 'keep your hands off this one.' : v.warning ? 'clean enough. read the notes.' : 'nothing turned up.') + '</p>'
    + '<div class="verdict-row"><div class="verdict-score"><svg viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M60 12c44-11 104-8 126 18 19 24-6 66-60 78-44 10-98 3-114-25C-4 56 26 22 74 10c30-7 62-6 86 2"/></svg><b id="score">' + v.score + '</b><small>/100</small></div>'
    + '<div class="metrics"><div><b>' + v.critical + '</b>CRITICAL</div><div><b>' + v.warning + '</b>WARNING</div><div><b>' + files + '</b>FILES READ' + (r.sampled ? ' (BIG PROJECT, SO NOT ALL)' : '') + '</div></div></div>'
    + '<p class="verdict-note">' + esc(note) + '</p>'
    + '<div class="verdict-actions"><button class="btn" id="share" type="button">COPY SHARE LINK</button></div>';
  bindCopy($('#share'), () => location.href, 'LINK COPIED');
  countUp($('#score'), v.score);
  if (v.critical && !STEP_REDUCED.matches) {
    area.classList.remove('shake');
    void area.offsetWidth;
    area.classList.add('shake');
  }
}

function countUp(el, to) {
  if (STEP_REDUCED.matches || to === 0) return;
  let n = 0;
  el.textContent = '0';
  const step = Math.max(1, Math.ceil(to / 12));
  const t = setInterval(() => {
    n = Math.min(to, n + step);
    el.textContent = n;
    if (n >= to) clearInterval(t);
  }, 40);
}

function renderCrate(r) {
  const worst = new Map();
  for (const f of r.findings) {
    if (f.severity === 'info') continue;
    if (!worst.has(f.file) || RANK[f.severity] < RANK[worst.get(f.file)]) worst.set(f.file, f.severity);
  }
  const flagged = [...worst].map(([file, severity]) => ({ file, severity }))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const { shown, ringTime } = crate.show({ total: r.fileCount, flagged, clean: true });
  const scale = r.fileCount > shown ? ' · EACH PHOTO ≈ ' + Math.round(r.fileCount / shown) + ' FILES' : '';
  legend.innerHTML = '<b>' + flagged.length + '</b> OF <b>' + r.fileCount + '</b> FILES FLAGGED' + esc(scale) + '<br><b>0</b> LINES RUN';
  return ringTime;
}

// Zero-width characters are invisible in a snippet, which is exactly the problem: show them.
const snippet = s => esc(s).replace(/[​-‍﻿]/g, c => '<mark>U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + '</mark>');

function renderCallout(r) {
  const parts = [];
  if (r.repo.startsWith('local:demo/trap-repo')) {
    const kinds = new Set(r.findings.map(f => f.kind));
    const caught = TRAP_ATTACKS.filter(([k]) => kinds.has(k)).length;
    parts.push('<div class="callout-part"><i class="pin pin-call-1" data-pin="case" data-order="5"></i><div class="tile-head"><span>PLANTED ATTACKS</span></div><div class="callout-big callout-count">' + caught + ' OF ' + TRAP_ATTACKS.length + ' CAUGHT</div><div class="attack-row">'
      + TRAP_ATTACKS.map(([k, label]) => '<span class="' + (kinds.has(k) ? 'yes' : 'no') + '"><i>' + (kinds.has(k) ? '✓' : '×') + '</i>' + label + '</span>').join('') + '</div></div>');
  }
  const pitch = r.findings.find(f => f.kind === 'prompt-injection' && /mark this (?:repository|repo|project) as safe/i.test(f.snippet));
  if (pitch) {
    parts.push('<div class="callout-part"><i class="pin pin-call-2" data-pin="case" data-order="4" data-c="amber"></i><div class="tile-head"><span>IT TRIED TO TALK ITS WAY OUT</span><code>' + esc(pitch.file) + ':' + pitch.line + '</code></div><div class="callout-big">THIS REPO TELLS AI TOOLS TO CALL IT SAFE.</div><pre>' + snippet(pitch.snippet) + '</pre><p>Our verdict comes from fixed rules, not an AI, so it can’t be talked out of it.</p></div>');
  }
  callout.hidden = !parts.length;
  callout.innerHTML = parts.join('');
}

function renderEvidence(r) {
  const all = [...r.findings].sort(byRisk);
  let filter = 'all', expanded = false;
  const count = sev => all.filter(f => f.severity === sev).length;

  function draw() {
    const list = filter === 'all' ? all : all.filter(f => f.severity === filter);
    const visible = expanded ? list : list.slice(0, PAGE_SIZE);
    const chips = [['all', 'ALL', all.length], ['critical', 'CRITICAL', count('critical')], ['warning', 'WARNING', count('warning')], ['info', 'IN TEST FILES', count('info')]]
      .filter(([k, , n]) => k === 'all' || n)
      .map(([k, label, n]) => '<button class="chip" type="button" data-filter="' + k + '" aria-pressed="' + (filter === k) + '">' + label + ' ' + n + '</button>').join('');
    evidence.innerHTML = '<div class="board-head"><h2 class="board-title"><small>04 // EVERY WARNING SHOWS THE EXACT FILE AND LINE</small>no evidence, no finding</h2><div class="filters">' + (all.length ? chips : '') + '</div></div>'
      + (all.length
        ? '<div class="exhibits">' + visible.map(f => {
          const i = all.indexOf(f);
          const pin = f.severity === 'info' ? 'data-pin="solo" data-c="bone"' : 'data-pin="case" data-order="' + (6 + i) + '" data-c="' + (f.severity === 'critical' ? 'red' : 'amber') + '"';
          return '<div class="finding sev-' + esc(f.severity) + '" data-i="' + i + '"><i class="pin" ' + pin + '></i><div class="finding-top"><span class="exhibit">EXHIBIT ' + String(i + 1).padStart(2, '0') + '</span><span class="sev">' + esc(f.severity === 'info' ? 'JUST A NOTE' : f.severity.toUpperCase()) + '</span><code>' + esc(f.file) + ':' + f.line + '</code></div><p>' + esc(f.why) + '</p><figure class="snap"><pre>' + snippet(f.snippet) + '</pre><figcaption>' + esc(KIND_LABEL[f.kind] || f.kind) + '</figcaption></figure></div>';
        }).join('') + '</div>'
        + (list.length > visible.length ? '<button class="btn btn-small" id="more" type="button">SHOW ALL ' + list.length + '</button>' : '')
        : '<p class="all-clear">NO RED FLAGS IN THE ' + r.fileCount + ' FILES WE READ.</p>');
    evidence.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; expanded = false; draw(); });
    const more = evidence.querySelector('#more');
    if (more) more.onclick = () => { expanded = true; draw(); };
    evidence.querySelectorAll('.finding').forEach(el => {
      el.onmouseenter = () => crate.focus(all[+el.dataset.i].file);
      el.onmouseleave = () => crate.focus(null);
    });
  }
  draw();
}

function renderPlan(r) {
  const p = r.runPlan || { label: 'basic plan', commands: [], prerequisites: [] };
  const blocked = r.verdict.label === 'DO NOT RUN';
  const top = [...r.findings].sort(byRisk)[0];
  const cmds = p.commands || [];
  plan.innerHTML = '<div class="tile-head"><span>05 // EXACTLY HOW TO RUN IT</span><b>' + esc(PLAN_LABEL[p.label] || p.label) + '</b></div>'
    + (p.summary ? '<p class="plan-summary">' + esc(p.summary) + '</p>' : '')
    + (blocked ? '<div class="plan-block"><b>NOT RECOMMENDED.</b> ' + esc(top?.why || 'We found something serious.') + '<button class="btn btn-small" id="show-anyway" type="button">SHOW COMMANDS ANYWAY</button></div>' : '')
    + '<div id="run-commands"' + (blocked ? ' hidden' : '') + '>'
    + (p.prerequisites?.length ? '<p class="plan-prereq">NEEDS: ' + esc(p.prerequisites.join(', ')) + '</p>' : '')
    + (cmds.length
      ? cmds.map((c, i) => '<div class="cmd"><pre>' + esc(c.command) + '</pre><button class="btn btn-small" type="button" data-copy="' + i + '">COPY</button><p>' + esc(c.why) + ' <code>' + esc(c.file) + '</code></p></div>').join('')
        + '<button class="btn btn-small" id="copy-all" type="button">COPY ALL</button>'
      : '<p class="plan-summary">We couldn’t work out how to run this one from its files.</p>')
    + '</div>';
  const anyway = plan.querySelector('#show-anyway');
  if (anyway) anyway.onclick = () => { plan.querySelector('#run-commands').hidden = false; anyway.hidden = true; };
  plan.querySelectorAll('[data-copy]').forEach(b => bindCopy(b, () => cmds[+b.dataset.copy].command, 'COPIED'));
  const all = plan.querySelector('#copy-all');
  if (all) bindCopy(all, () => cmds.map(c => c.command).join('\n'), 'COPIED');
}

function renderSignals(r) {
  const sig = [['LOCKED VERSIONS', r.signals.lockfile], ['TESTS', r.signals.tests], ['AUTO-CHECKS', r.signals.ci]];
  signals.innerHTML = '<div class="tile-head"><span>06 // GOOD HABITS</span></div>'
    + '<div class="signal-row">' + sig.map(([k, ok]) => '<div class="signal ' + (ok ? 'yes' : 'no') + '"><b>' + (ok ? '✓' : '×') + '</b>' + k + '</div>').join('') + '</div>'
    + (r.envVars.length
      ? '<div class="env-list"><h3>SETTINGS IT WILL ASK FOR</h3>' + r.envVars.map(e => '<div class="env"><code>' + esc(e.name) + '</code><span class="' + (e.documented ? 'doc' : 'undoc') + '">' + (e.documented ? 'EXPLAINED IN THE DOCS' : 'NOT EXPLAINED') + '</span><small>' + esc(e.usedIn) + '</small></div>').join('') + '</div>'
      : '');
}

function bindCopy(button, text, done) {
  const label = button.textContent;
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text());
      button.textContent = done;
    } catch {
      button.textContent = 'COPY BLOCKED';
    }
    setTimeout(() => { button.textContent = label; }, 1300);
  };
}

/* ---------- wiring ---------- */

form.onsubmit = e => { e.preventDefault(); scan(input.value); };
input.oninput = () => formFail('');
document.querySelectorAll('[data-repo]').forEach(b => b.onclick = () => { input.value = b.dataset.repo; scan(b.dataset.repo); });

bindCopy($('#try-copy'), () => $('#try-command').textContent, 'COPIED');

const clear = $('#clear-cache');
if (REPLAY) {
  clear.hidden = true;
  $('#mode-tag').textContent = 'RECORDED DEMO';
} else {
  clear.onclick = async () => {
    try {
      const d = await (await fetch('api/cache', { method: 'DELETE' })).json();
      clear.textContent = 'FORGOT ' + d.cleared;
    } catch {
      clear.textContent = 'COULDN’T CLEAR';
    }
    setTimeout(() => { clear.textContent = 'FORGET PAST SCANS'; }, 1300);
  };
}

function fromUrl() {
  const repo = new URL(location).searchParams.get('repo');
  if (repo) {
    input.value = repo;
    scan(repo, { push: false });
  } else {
    active?.close();
    active = null;
    caseId++;
    Investigation.abort();
    input.value = '';
    area.hidden = true;
    flow.hidden = true;
  }
}
addEventListener('popstate', fromUrl);
fromUrl();
