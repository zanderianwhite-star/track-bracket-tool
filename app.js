/* =============================================================
   Track & Field Madness — Tournament bracket teaching tool
   -------------------------------------------------------------
   This file contains all of the app's logic:
     1. Sample data and time parsing
     2. Seeding algorithm (sort by PB, then snake-distribute to groups)
     3. Probability calculation from time differences
     4. Bracket construction + simulation / prediction
     5. Rendering (vanilla DOM) + path-to-victory summary
   The code is intentionally commented heavily so students can
   read along and see how seeding and probability fit together.
   ============================================================= */

/* ------------------------------------------------------------
   CONFIG
   ------------------------------------------------------------ */

// If true, we use the classic "snake/serpentine" distribution
// (1-8-9-16, 2-7-10-15, ...). This maximizes fairness because each
// group ends up with a balanced mix of strong and weak athletes.
// If false, groups are formed sequentially (1-2-3-4, 5-6-7-8, ...),
// which matches the prompt example (Group A = seeds 1,4,5,8) but is
// less competitive because all top seeds cluster together.
const USE_SNAKE_SEEDING = true;

const GROUPS = ["A", "B", "C", "D"];

// 16 athletes per event. PBs stored in seconds (float).
const SAMPLE_DATA = {
  "100m": [
    { name: "Marcus Reed",       pb: 9.89  },
    { name: "Jamal Carter",      pb: 9.96  },
    { name: "Devin Okafor",      pb: 10.02 },
    { name: "Hiro Tanaka",       pb: 10.08 },
    { name: "Andre Santos",      pb: 10.14 },
    { name: "Eli Washington",    pb: 10.19 },
    { name: "Kwame Boateng",     pb: 10.24 },
    { name: "Luca Rossi",        pb: 10.31 },
    { name: "Trey Anderson",     pb: 10.38 },
    { name: "Noah Chen",         pb: 10.44 },
    { name: "Ravi Patel",        pb: 10.52 },
    { name: "Diego Morales",     pb: 10.61 },
    { name: "Brandon Lee",       pb: 10.72 },
    { name: "Omar Hassan",       pb: 10.85 },
    { name: "Tyler Nguyen",      pb: 10.98 },
    { name: "Chris Walker",      pb: 11.22 },
  ],
  "1mile": [
    { name: "Liam O'Brien",      pb: 3*60 + 52.10 },
    { name: "Finn Aldridge",     pb: 3*60 + 56.40 },
    { name: "Teo Martinez",      pb: 4*60 +  0.15 },
    { name: "Samir Khan",        pb: 4*60 +  3.80 },
    { name: "Jonas Weber",       pb: 4*60 +  7.25 },
    { name: "Alex Kim",          pb: 4*60 + 10.60 },
    { name: "Mateus Silva",      pb: 4*60 + 14.00 },
    { name: "Ethan Park",        pb: 4*60 + 17.55 },
    { name: "Ronan Kelly",       pb: 4*60 + 21.10 },
    { name: "Ismail Sadiq",      pb: 4*60 + 24.70 },
    { name: "Jack Donovan",      pb: 4*60 + 28.90 },
    { name: "Max Fischer",       pb: 4*60 + 32.40 },
    { name: "Oscar Nilsen",      pb: 4*60 + 36.00 },
    { name: "Henry Zhou",        pb: 4*60 + 40.80 },
    { name: "Caleb Brooks",      pb: 4*60 + 46.20 },
    { name: "Miles Dupont",      pb: 4*60 + 52.90 },
  ],
};

/* ------------------------------------------------------------
   TIME HELPERS
   ------------------------------------------------------------ */

/**
 * Parse a user-typed time into seconds.
 *   "10.42"       -> 10.42  (sprint style)
 *   "4:12.30"     -> 252.30 (mile style)
 *   "4:12"        -> 252.00
 * Returns NaN if unparseable.
 */
function parseTime(str) {
  if (str == null) return NaN;
  str = String(str).trim();
  if (!str) return NaN;
  if (str.includes(":")) {
    const [mm, ss] = str.split(":");
    const m = parseFloat(mm);
    const s = parseFloat(ss);
    if (isNaN(m) || isNaN(s)) return NaN;
    return m * 60 + s;
  }
  return parseFloat(str);
}

/** Format seconds back to human readable for display. */
function formatTime(seconds, event) {
  if (event === "1mile") {
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, "0")}`;
  }
  return seconds.toFixed(2);
}

/* ------------------------------------------------------------
   SEEDING ALGORITHM
   ------------------------------------------------------------
   Step 1: Sort athletes ascending by PB — fastest time = seed #1.
   Step 2: Distribute into 4 groups.
      - Snake mode (default): each group receives the 1st, 8th,
        9th, and 16th ranked athletes of its column. This gives
        each group a balanced difficulty curve.
      - Sequential mode: groups are seeds 1-4, 5-8, 9-12, 13-16
        (matches the prompt wording but clusters top seeds).
   Step 3: Within each group, order slots so that the top seed
      plays the bottom seed in round 1 (classic 1v4 / 2v3).
   ------------------------------------------------------------ */
function seedAthletes(athletes) {
  // Defensive copy so we don't mutate the input.
  const sorted = [...athletes].sort((a, b) => a.pb - b.pb);

  // Assign seed numbers 1..16
  sorted.forEach((a, i) => { a.seed = i + 1; });

  // Build the 4 groups according to chosen rule
  const groups = { A: [], B: [], C: [], D: [] };

  if (USE_SNAKE_SEEDING) {
    // Snake: seed 1 -> A, 2 -> B, 3 -> C, 4 -> D, 5 -> D, 6 -> C, 7 -> B, 8 -> A, ...
    // Equivalent closed form: see the 4 "columns" below.
    // Column 1 (seeds 1-4) : A, B, C, D
    // Column 2 (seeds 5-8) : D, C, B, A
    // Column 3 (seeds 9-12): A, B, C, D
    // Column 4 (seeds 13-16): D, C, B, A
    const pattern = [
      ["A","B","C","D"],
      ["D","C","B","A"],
      ["A","B","C","D"],
      ["D","C","B","A"],
    ];
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        const seedIndex = col * 4 + row;
        const groupKey = pattern[col][row];
        groups[groupKey].push(sorted[seedIndex]);
      }
    }
  } else {
    // Sequential: A=1-4, B=5-8, C=9-12, D=13-16
    for (let i = 0; i < 16; i++) {
      const key = GROUPS[Math.floor(i / 4)];
      groups[key].push(sorted[i]);
    }
  }

  // Inside each group, re-order so slots are [top, bottom, 2nd, 3rd]
  // which gives semifinal matchups of (slot0 vs slot1) and (slot2 vs slot3)
  // — i.e. the best seed of the group vs the weakest, middle two play each other.
  for (const key of GROUPS) {
    const g = groups[key].sort((a, b) => a.seed - b.seed); // best..worst within group
    // g = [top, 2nd, 3rd, bottom]
    // Re-arrange to [top, bottom, 2nd, 3rd]
    groups[key] = [g[0], g[3], g[1], g[2]];
  }

  return groups;
}

/* ------------------------------------------------------------
   PROBABILITY
   ------------------------------------------------------------
   Given two athletes, compute the probability the favorite wins.
   Rules:
     - Faster time (lower number) = favorite.
     - "pctFaster" = (slower - faster) / slower * 100
     - favoriteProb = 0.5 + pctFaster/100, clamped to [0.50, 0.99].
   This is a teaching-grade model — real racing has more variance.
   ------------------------------------------------------------ */
function matchupProbabilities(a, b) {
  if (!a || !b) return null;
  const favorite = a.pb <= b.pb ? a : b;
  const underdog = a.pb <= b.pb ? b : a;
  const pctFaster = ((underdog.pb - favorite.pb) / underdog.pb) * 100;
  // 1% faster -> 51% win prob; 10% faster -> 60%; cap at 99%.
  const favProb = Math.min(0.99, Math.max(0.50, 0.5 + pctFaster / 100));
  const out = new Map();
  out.set(favorite, favProb);
  out.set(underdog, 1 - favProb);
  return out;
}

/* ------------------------------------------------------------
   BRACKET MODEL
   ------------------------------------------------------------
   Each event has its own bracket object:
   {
     groups: { A: [a0,a1,a2,a3], ... },
     results: {
       A: { semi1: winner|null, semi2: winner|null, final: winner|null },
       ...
       ff1: winner|null, ff2: winner|null, champ: winner|null
     }
   }
   Where "winner" is the athlete object that advanced from that match.
   Matchup pairs in a group:
      semi1 = slot0 vs slot1
      semi2 = slot2 vs slot3
      final = semi1 winner vs semi2 winner
   Final Four:
      ff1 = winner(A) vs winner(B)
      ff2 = winner(C) vs winner(D)
      champ = ff1 winner vs ff2 winner
   ------------------------------------------------------------ */
function emptyResults() {
  const r = {};
  for (const g of GROUPS) r[g] = { semi1: null, semi2: null, final: null };
  r.ff1 = null;
  r.ff2 = null;
  r.champ = null;
  return r;
}

function simulateBracket(groups, rng = Math.random) {
  const results = emptyResults();
  const pickWinner = (a, b) => {
    const probs = matchupProbabilities(a, b);
    const pA = probs.get(a);
    return rng() < pA ? a : b;
  };
  for (const g of GROUPS) {
    const [s0, s1, s2, s3] = groups[g];
    results[g].semi1 = pickWinner(s0, s1);
    results[g].semi2 = pickWinner(s2, s3);
    results[g].final = pickWinner(results[g].semi1, results[g].semi2);
  }
  results.ff1 = pickWinner(results.A.final, results.B.final);
  results.ff2 = pickWinner(results.C.final, results.D.final);
  results.champ = pickWinner(results.ff1, results.ff2);
  return results;
}

/* ------------------------------------------------------------
   PATH TO VICTORY
   ------------------------------------------------------------
   For each athlete, compute the probability they win the entire
   tournament. We take the *expected* path — at every round we
   sum over possible opponents weighted by the probability those
   opponents reach that round.
   ------------------------------------------------------------ */
function computeTitleOdds(groups) {
  // For every athlete we compute: P(win group) and conditional path after that.
  const allAthletes = GROUPS.flatMap(g => groups[g]);
  const winProbPairwise = (x, y) => matchupProbabilities(x, y).get(x);

  // P(athlete wins their group)
  const groupWinProb = new Map(); // athlete -> number
  for (const g of GROUPS) {
    const [s0, s1, s2, s3] = groups[g];
    // s0 beats s1 then beats whoever emerges from (s2 vs s3)
    const pS0Semi = winProbPairwise(s0, s1);
    const pS1Semi = 1 - pS0Semi;
    const pS2Semi = winProbPairwise(s2, s3);
    const pS3Semi = 1 - pS2Semi;

    const probWinGroup = (me, semiProb, oppA, oppAProb, oppB, oppBProb) => {
      const pMeVsA = winProbPairwise(me, oppA);
      const pMeVsB = winProbPairwise(me, oppB);
      return semiProb * (oppAProb * pMeVsA + oppBProb * pMeVsB);
    };
    groupWinProb.set(s0, probWinGroup(s0, pS0Semi, s2, pS2Semi, s3, pS3Semi));
    groupWinProb.set(s1, probWinGroup(s1, pS1Semi, s2, pS2Semi, s3, pS3Semi));
    groupWinProb.set(s2, probWinGroup(s2, pS2Semi, s0, pS0Semi, s1, pS1Semi));
    groupWinProb.set(s3, probWinGroup(s3, pS3Semi, s0, pS0Semi, s1, pS1Semi));
  }

  // Final Four: A winner vs B winner, C vs D.
  // P(athlete wins FF round) = P(winGroup) * sum over opposing-group athletes of
  //   P(they win opposing group) * P(me beats them)
  const pairings = [
    ["A", "B"], ["B", "A"], // athletes in A face someone from B
    ["C", "D"], ["D", "C"],
  ];
  const oppGroupMap = { A: "B", B: "A", C: "D", D: "C" };
  const ffSideMap   = { A: 0,  B: 0,  C: 1,  D: 1  }; // A/B are one semi, C/D the other

  const ffProb = new Map(); // P(athlete reaches final)
  for (const g of GROUPS) {
    const opp = oppGroupMap[g];
    for (const me of groups[g]) {
      let p = 0;
      for (const oppAth of groups[opp]) {
        p += groupWinProb.get(oppAth) * winProbPairwise(me, oppAth);
      }
      ffProb.set(me, groupWinProb.get(me) * p);
    }
  }

  // Final: A/B winner vs C/D winner.
  const titleProb = new Map();
  for (const me of allAthletes) {
    const mySide = ffSideMap[findGroup(me, groups)];
    const otherSideAthletes = allAthletes.filter(
      a => ffSideMap[findGroup(a, groups)] !== mySide
    );
    let p = 0;
    for (const oppAth of otherSideAthletes) {
      p += ffProb.get(oppAth) * winProbPairwise(me, oppAth);
    }
    titleProb.set(me, ffProb.get(me) * p);
  }

  return { groupWinProb, ffProb, titleProb };
}

function findGroup(athlete, groups) {
  for (const g of GROUPS) {
    if (groups[g].includes(athlete)) return g;
  }
  return null;
}

/* =============================================================
   UI STATE
   ============================================================= */

const state = {
  event: "100m",
  // per-event state so switching tabs preserves work
  byEvent: {
    "100m": { inputs: blankInputs(), bracket: null, mode: "predict" },
    "1mile": { inputs: blankInputs(), bracket: null, mode: "predict" },
  },
};

function blankInputs() {
  return Array.from({ length: 16 }, () => ({ name: "", pb: "" }));
}

function currentES() { return state.byEvent[state.event]; }

/* =============================================================
   DOM REFERENCES
   ============================================================= */
const $inputs   = document.getElementById("athlete-inputs");
const $errorMsg = document.getElementById("input-error");
const $inputPanel   = document.getElementById("input-panel");
const $bracketPanel = document.getElementById("bracket-panel");
const $groups   = document.getElementById("groups");
const $finals   = document.getElementById("finals");
const $champion = document.getElementById("champion");
const $summary  = document.getElementById("summary");
const $summaryList = document.getElementById("summary-list");
const $btnSimulate = document.getElementById("btn-simulate");

/* =============================================================
   INPUT RENDERING
   ============================================================= */
function renderInputs() {
  const es = currentES();
  const placeholders = {
    "100m":  "10.42",
    "1mile": "4:12.30",
  };
  $inputs.innerHTML = "";
  for (let i = 0; i < 16; i++) {
    const row = document.createElement("div");
    row.className = "athlete-row";
    row.innerHTML = `
      <div class="num">#${i + 1}</div>
      <input type="text" placeholder="Athlete name" data-idx="${i}" data-field="name" value="${escapeHTML(es.inputs[i].name)}" />
      <input type="text" placeholder="${placeholders[state.event]}" data-idx="${i}" data-field="pb" value="${escapeHTML(es.inputs[i].pb)}" />
    `;
    $inputs.appendChild(row);
  }
  $inputs.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", e => {
      const idx = +e.target.dataset.idx;
      const field = e.target.dataset.field;
      es.inputs[idx][field] = e.target.value;
      e.target.classList.remove("invalid");
      hideError();
    });
  });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function showError(msg) { $errorMsg.textContent = msg; $errorMsg.hidden = false; }
function hideError()    { $errorMsg.hidden = true; }

/* =============================================================
   VALIDATION + BUILD
   ============================================================= */
function validateAndBuild() {
  const es = currentES();
  const athletes = [];
  const badRows = [];
  for (let i = 0; i < 16; i++) {
    const { name, pb } = es.inputs[i];
    const trimmed = name.trim();
    const seconds = parseTime(pb);
    const valid = trimmed.length > 0 && !isNaN(seconds) && seconds > 0;
    if (!valid) badRows.push(i);
    else athletes.push({ name: trimmed, pb: seconds });
  }
  // Highlight bad rows
  $inputs.querySelectorAll("input").forEach(inp => {
    const idx = +inp.dataset.idx;
    inp.classList.toggle("invalid", badRows.includes(idx));
  });
  if (badRows.length > 0) {
    showError(`Please complete all 16 athletes with valid names and times. (${badRows.length} row${badRows.length===1?"":"s"} invalid.)`);
    return;
  }
  hideError();
  const groups = seedAthletes(athletes);
  es.bracket = {
    groups,
    results: emptyResults(),
  };
  renderBracket();
  $inputPanel.hidden = true;
  $bracketPanel.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =============================================================
   BRACKET RENDERING
   ============================================================= */
function renderBracket() {
  const es = currentES();
  if (!es.bracket) return;
  const { groups, results } = es.bracket;

  // Render 4 group brackets
  $groups.innerHTML = "";
  for (const g of GROUPS) {
    const wrapper = document.createElement("div");
    wrapper.className = "group";
    wrapper.innerHTML = `<div class="group-title">Group ${g}</div>`;
    const rounds = document.createElement("div");
    rounds.className = "bracket-rounds";

    // Semifinal column
    const semiCol = document.createElement("div");
    semiCol.className = "round";
    semiCol.appendChild(matchupCard({
      event: state.event,
      matchId: `${g}.semi1`,
      a: groups[g][0], b: groups[g][1],
      winner: results[g].semi1,
    }));
    semiCol.appendChild(matchupCard({
      event: state.event,
      matchId: `${g}.semi2`,
      a: groups[g][2], b: groups[g][3],
      winner: results[g].semi2,
    }));

    // connector
    const conn = document.createElement("div");
    conn.className = "round-connector";
    conn.textContent = "→";

    // Final column
    const finalCol = document.createElement("div");
    finalCol.className = "round";
    finalCol.appendChild(matchupCard({
      event: state.event,
      matchId: `${g}.final`,
      a: results[g].semi1, b: results[g].semi2,
      winner: results[g].final,
      label: "Group Final",
    }));

    rounds.append(semiCol, conn, finalCol);
    wrapper.appendChild(rounds);
    $groups.appendChild(wrapper);
  }

  // Render Finals (Final Four + Championship)
  $finals.innerHTML = "";
  const ftitle = document.createElement("div");
  ftitle.className = "finals-title";
  ftitle.textContent = "⭐ Final Four & Championship ⭐";
  $finals.appendChild(ftitle);

  const semiCol = document.createElement("div");
  semiCol.className = "round";
  semiCol.appendChild(matchupCard({
    event: state.event,
    matchId: "ff1",
    a: results.A.final, b: results.B.final,
    winner: results.ff1,
    label: "A vs B",
  }));
  semiCol.appendChild(matchupCard({
    event: state.event,
    matchId: "ff2",
    a: results.C.final, b: results.D.final,
    winner: results.ff2,
    label: "C vs D",
  }));

  const conn = document.createElement("div");
  conn.className = "round-connector";
  conn.textContent = "→";

  const champCol = document.createElement("div");
  champCol.className = "round";
  champCol.appendChild(matchupCard({
    event: state.event,
    matchId: "champ",
    a: results.ff1, b: results.ff2,
    winner: results.champ,
    label: "Championship",
  }));

  $finals.append(semiCol, conn, champCol);

  // Champion banner
  if (results.champ) {
    $champion.hidden = false;
    $champion.innerHTML = `
      <div class="trophy">🏆</div>
      <h2>Champion</h2>
      <div class="champ-name">${escapeHTML(results.champ.name)}</div>
      <div class="champ-seed">Seed #${results.champ.seed} · PB ${formatTime(results.champ.pb, state.event)}</div>
    `;
  } else {
    $champion.hidden = true;
    $champion.innerHTML = "";
  }

  // Summary: title odds for every athlete
  const { titleProb } = computeTitleOdds(groups);
  const ordered = Array.from(titleProb.entries())
    .sort((a, b) => b[1] - a[1]);
  $summaryList.innerHTML = "";
  for (const [ath, p] of ordered) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="seed-chip ${seedClass(ath.seed)}">#${ath.seed}</span>
      ${escapeHTML(ath.name)}
      <span class="pct">${(p * 100).toFixed(1)}%</span>
    `;
    $summaryList.appendChild(li);
  }
  $summary.hidden = false;
}

function seedClass(seed) {
  if (seed === 1) return "s1";
  if (seed === 2) return "s2";
  if (seed === 3) return "s3";
  return "";
}

/* ------------------------------------------------------------
   One matchup card (two slots + probability bar)
   ------------------------------------------------------------ */
function matchupCard({ event, matchId, a, b, winner, label }) {
  const card = document.createElement("div");
  card.className = "matchup";
  card.dataset.match = matchId;

  const probs = (a && b) ? matchupProbabilities(a, b) : null;
  const pA = probs ? probs.get(a) : null;
  const pB = probs ? probs.get(b) : null;

  card.appendChild(slotBtn({ athlete: a, prob: pA, winner, matchId, side: "a", event }));
  card.appendChild(slotBtn({ athlete: b, prob: pB, winner, matchId, side: "b", event }));

  // Probability bar + text (only when both slots are filled)
  if (probs) {
    const bar = document.createElement("div");
    bar.className = "prob-bar";
    bar.innerHTML = `<div class="p-a" style="flex: ${pA}"></div><div class="p-b" style="flex: ${pB}"></div>`;
    card.appendChild(bar);

    const txt = document.createElement("div");
    txt.className = "prob-text";
    txt.innerHTML = `
      <span>${(pA * 100).toFixed(0)}%</span>
      <span>${label ? label : "win odds"}</span>
      <span>${(pB * 100).toFixed(0)}%</span>
    `;
    card.appendChild(txt);
  } else if (label) {
    const txt = document.createElement("div");
    txt.className = "prob-text";
    txt.innerHTML = `<span></span><span>${label}</span><span></span>`;
    card.appendChild(txt);
  }

  return card;
}

function slotBtn({ athlete, prob, winner, matchId, side, event }) {
  const btn = document.createElement("button");
  btn.className = "slot";
  btn.dataset.match = matchId;
  btn.dataset.side = side;
  if (!athlete) {
    btn.classList.add("tbd");
    btn.disabled = true;
    btn.innerHTML = `
      <span class="seed-chip">–</span>
      <span class="athlete-name">TBD</span>
      <span class="athlete-pb"></span>
    `;
    return btn;
  }
  if (winner) {
    if (winner === athlete) btn.classList.add("winner");
    else btn.classList.add("loser");
  }
  btn.innerHTML = `
    <span class="seed-chip ${seedClass(athlete.seed)}">#${athlete.seed}</span>
    <span class="athlete-name">${escapeHTML(athlete.name)}</span>
    <span class="athlete-pb">${formatTime(athlete.pb, event)}</span>
  `;
  btn.addEventListener("click", () => onSlotClick(matchId, athlete));
  return btn;
}

/* ------------------------------------------------------------
   Predict mode: user clicks a slot to advance that athlete.
   Clicking automatically clears downstream rounds that depended
   on the changed matchup.
   ------------------------------------------------------------ */
function onSlotClick(matchId, athlete) {
  const es = currentES();
  if (es.mode !== "predict") return;
  if (!es.bracket) return;
  const { results } = es.bracket;

  // Only allow picking if both opponents are known
  if (matchId.endsWith(".semi1") || matchId.endsWith(".semi2")) {
    const [g, which] = matchId.split(".");
    results[g][which] = athlete;
    // Downstream: clear group final + finals that depend on this group
    results[g].final = null;
    if (g === "A" || g === "B") results.ff1 = null;
    if (g === "C" || g === "D") results.ff2 = null;
    results.champ = null;
  } else if (matchId.endsWith(".final")) {
    const g = matchId.split(".")[0];
    // Require both semis done
    if (!results[g].semi1 || !results[g].semi2) return;
    results[g].final = athlete;
    if (g === "A" || g === "B") results.ff1 = null;
    if (g === "C" || g === "D") results.ff2 = null;
    results.champ = null;
  } else if (matchId === "ff1") {
    if (!results.A.final || !results.B.final) return;
    results.ff1 = athlete;
    results.champ = null;
  } else if (matchId === "ff2") {
    if (!results.C.final || !results.D.final) return;
    results.ff2 = athlete;
    results.champ = null;
  } else if (matchId === "champ") {
    if (!results.ff1 || !results.ff2) return;
    results.champ = athlete;
  }
  renderBracket();
}

/* =============================================================
   EVENT WIRING
   ============================================================= */
document.querySelectorAll(".event-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".event-tab").forEach(t => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    state.event = tab.dataset.event;
    renderInputs();
    const es = currentES();
    // Toggle panels based on whether this event has a bracket already
    if (es.bracket) {
      $inputPanel.hidden = true;
      $bracketPanel.hidden = false;
      renderBracket();
    } else {
      $inputPanel.hidden = false;
      $bracketPanel.hidden = true;
    }
    syncModeUI();
  });
});

document.getElementById("btn-sample").addEventListener("click", () => {
  const es = currentES();
  es.inputs = SAMPLE_DATA[state.event].map(a => ({
    name: a.name,
    pb: formatTime(a.pb, state.event),
  }));
  renderInputs();
  hideError();
});

document.getElementById("btn-reset").addEventListener("click", () => {
  const es = currentES();
  es.inputs = blankInputs();
  es.bracket = null;
  renderInputs();
  $inputPanel.hidden = false;
  $bracketPanel.hidden = true;
  hideError();
});

document.getElementById("btn-build").addEventListener("click", validateAndBuild);

document.getElementById("btn-edit").addEventListener("click", () => {
  $inputPanel.hidden = false;
  $bracketPanel.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelectorAll("input[name='mode']").forEach(r => {
  r.addEventListener("change", e => {
    const es = currentES();
    es.mode = e.target.value;
    syncModeUI();
  });
});

$btnSimulate.addEventListener("click", () => {
  const es = currentES();
  if (!es.bracket) return;
  es.bracket.results = simulateBracket(es.bracket.groups);
  renderBracket();
});

function syncModeUI() {
  const es = currentES();
  const isSim = es.mode === "simulate";
  $btnSimulate.hidden = !isSim;
  // When entering simulate mode, auto-run one simulation for immediate feedback
  if (isSim && es.bracket && !es.bracket.results.champ) {
    es.bracket.results = simulateBracket(es.bracket.groups);
    renderBracket();
  }
}

/* =============================================================
   INIT
   ============================================================= */
renderInputs();
