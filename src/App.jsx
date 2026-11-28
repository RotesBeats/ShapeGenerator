import React, { useState, useMemo, useEffect, useRef } from "react";

/* ---------- helpers ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f = (n) => (Math.round(n * 100) / 100).toString();
const C = { white: "#F9F9F9", soft: "#E7E5E5", char: "#232323", deep: "#0B0B0B", gray: "#6E7174", blue: "#FF5500" };
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const DEFAULTS = {
  points: 5,
  outerR: 180,
  innerR: 75,
  altOn: true,
  altMult: 1,
  altMode: "pattern", // "pattern" = every Nth beam, "custom" = hand-picked
  altEvery: 2,
  altOffset: 1, // 0-based index of the first secondary beam in the pattern
  altCustom: [],
  outerRound: 0,
  innerRound: 0,
  rotation: 0,
  skew: 0,
    curve: 0, // edge curvature: -100 (pinched) .. 100 (bulging)
  beamEdits: {}, // per-beam overrides: { [index]: { len, rot, round } }
  symOn: false,
  symMode: "mirror", // "mirror" | "radial"
  fill: null, // null = auto: white on dark preview, dark grey on light / transparent
};

const PRESETS = [
  { name: "Classic 5-Point", values: { points: 5, outerR: 180, innerR: 75, altMult: 1, outerRound: 0, innerRound: 0, rotation: 0, skew: 0 } },
  { name: "Soft Badge", values: { points: 12, outerR: 190, innerR: 158, altMult: 1, outerRound: 70, innerRound: 60, rotation: 0, skew: 0 } },
  { name: "Compass Rose", values: { points: 16, outerR: 210, innerR: 42, altOn: true, altMult: 0.5, outerRound: 0, innerRound: 0, rotation: 0, skew: 0 } },
  { name: "Sharp Sparkle", values: { points: 4, outerR: 230, innerR: 22, altMult: 1, outerRound: 0, innerRound: 25, rotation: 0, skew: 0, curve: -40 } },
  { name: "Pinwheel", values: { points: 8, outerR: 200, innerR: 95, altMult: 1, outerRound: 20, innerRound: 0, rotation: 0, skew: 32 } },
];

/* ---------- geometry ---------- */
const isSecondary = (p, i) =>
  p.altOn &&
  (p.altMode === "custom"
    ? p.altCustom.includes(i)
    : (((i - p.altOffset) % p.altEvery) + p.altEvery) % p.altEvery === 0);


function buildStar(p) {
  const N = p.points;
  const edits = p.beamEdits || {};
  const wave = p._wave;
  const verts = [];
  const tips = [];
  for (let i = 0; i < N; i++) {
    const e = edits[i] || {};
    const base = ((p.rotation - 90) * Math.PI) / 180 + (i * 2 * Math.PI) / N;
    const a = base + ((e.rot || 0) * Math.PI) / 180;
    let R = p.outerR * (isSecondary(p, i) ? p.altMult : 1) * (e.len ?? 1);
    if (wave) R *= 1 + wave.amp * Math.sin(wave.t + (i * 2 * Math.PI) / N);
    if (p._flutter) R *= 1 + p._flutter.amp * Math.sin(p._flutter.t) * (i % 2 ? 1 : -1);
    const x = Math.cos(a) * R, y = Math.sin(a) * R;
    verts.push({ x, y, round: e.round ?? p.outerRound });
    tips.push({ x, y, i });
    const ia = base + Math.PI / N + (p.skew * Math.PI) / 180;
    verts.push({ x: Math.cos(ia) * p.innerR, y: Math.sin(ia) * p.innerR, round: p.innerRound });
  }
  const M = verts.length;

  // Per-vertex fillet: tangent points A (on incoming edge) and B (on outgoing edge)
  const segs = verts.map((v, k) => {
    const pr = verts[(k - 1 + M) % M];
    const nx = verts[(k + 1) % M];
    const ax = pr.x - v.x, ay = pr.y - v.y;
    const bx = nx.x - v.x, by = nx.y - v.y;
    const l1 = Math.hypot(ax, ay), l2 = Math.hypot(bx, by);
    const sharp = { A: v, B: v, r: 0, sweep: 0 };
    if (l1 < 1e-6 || l2 < 1e-6) return sharp;
    const u1 = [ax / l1, ay / l1], u2 = [bx / l2, by / l2];
    const phi = Math.acos(clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1));
    // each edge is shared by two corners, so a corner may use at most half of it
    const t = (Math.min(l1, l2) / 2) * (v.round / 100);
    if (t < 0.01 || phi < 1e-3 || Math.PI - phi < 1e-3) return sharp;
    const r = t * Math.tan(phi / 2);
    const cross = -u1[0] * u2[1] + u1[1] * u2[0];
    return {
      A: { x: v.x + u1[0] * t, y: v.y + u1[1] * t },
      B: { x: v.x + u2[0] * t, y: v.y + u2[1] * t },
      r,
      sweep: cross > 0 ? 1 : 0,
    };
  });

  const bow = (p.curve || 0) / 100;
  let d = "";

  if (!bow) {
    // straight edges: circular-arc fillets
    const arc = (s) => (s.r > 0 ? `A${f(s.r)} ${f(s.r)} 0 0 ${s.sweep} ${f(s.B.x)} ${f(s.B.y)}` : "");
    d = `M${f(segs[0].B.x)} ${f(segs[0].B.y)}`;
    for (let k = 1; k < M; k++) d += `L${f(segs[k].A.x)} ${f(segs[k].A.y)}` + arc(segs[k]);
    d += `L${f(segs[0].A.x)} ${f(segs[0].A.y)}` + arc(segs[0]) + "Z";
  } else {
    // curved edges: every edge is a quadratic Bezier between the sharp vertices. Corners are
    // rounded by trimming the two curves that meet there and joining them with a cubic whose
    // end tangents match the curves, so rounding follows the curvature (no kinks or knobs).
    const edges = verts.map((v, k) => {
      const w = verts[(k + 1) % M];
      const dx = w.x - v.x, dy = w.y - v.y;
      return { p0: v, p1: w, len: Math.hypot(dx, dy), q: { x: (v.x + w.x) / 2 + dy * bow * 0.4, y: (v.y + w.y) / 2 - dx * bow * 0.4 } };
    });
    const P = (e, s) => ({
      x: (1 - s) * (1 - s) * e.p0.x + 2 * (1 - s) * s * e.q.x + s * s * e.p1.x,
      y: (1 - s) * (1 - s) * e.p0.y + 2 * (1 - s) * s * e.q.y + s * s * e.p1.y,
    });
    const D = (e, s) => {
      const dx = 2 * ((1 - s) * (e.q.x - e.p0.x) + s * (e.p1.x - e.q.x));
      const dy = 2 * ((1 - s) * (e.q.y - e.p0.y) + s * (e.p1.y - e.q.y));
      const l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    };
    const tr = verts.map((v, k) => {
      const lin = edges[(k - 1 + M) % M].len, lout = edges[k].len;
      const t = lin > 1e-6 && lout > 1e-6 ? (Math.min(lin, lout) / 2) * (v.round / 100) : 0;
      return t < 0.01 ? { t: 0, sIn: 0, sOut: 0 } : { t, sIn: t / lin, sOut: t / lout };
    });
    const startPt = (k) => (tr[k].t ? P(edges[k], tr[k].sOut) : verts[k]);
    const piece = (k) => {
      const k2 = (k + 1) % M;
      const a = tr[k].t ? tr[k].sOut : 0;
      const b = tr[k2].t ? 1 - tr[k2].sIn : 1;
      const e = edges[k];
      const end = tr[k2].t ? P(e, b) : verts[k2];
      if (b - a < 1e-4) return "";
      const qa = (1 - a) * (1 - b), qm = (1 - a) * b + a * (1 - b), qb = a * b;
      const cx = qa * e.p0.x + qm * e.q.x + qb * e.p1.x;
      const cy = qa * e.p0.y + qm * e.q.y + qb * e.p1.y;
      return `Q${f(cx)} ${f(cy)} ${f(end.x)} ${f(end.y)}`;
    };
    const corner = (k) => {
      if (!tr[k].t) return "";
      const ein = edges[(k - 1 + M) % M], eout = edges[k];
      const A = P(ein, 1 - tr[k].sIn), B = P(eout, tr[k].sOut);
      const dA = D(ein, 1 - tr[k].sIn), dB = D(eout, tr[k].sOut);
      const th = Math.abs(Math.atan2(dA[0] * dB[1] - dA[1] * dB[0], dA[0] * dB[0] + dA[1] * dB[1]));
      if (th < 1e-3 || th > Math.PI - 1e-3) return `L${f(B.x)} ${f(B.y)}`;
      const c = Math.hypot(B.x - A.x, B.y - A.y);
      const h = (4 / 3) * Math.tan(th / 4) * (c / (2 * Math.sin(th / 2)));
      return `C${f(A.x + dA[0] * h)} ${f(A.y + dA[1] * h)} ${f(B.x - dB[0] * h)} ${f(B.y - dB[1] * h)} ${f(B.x)} ${f(B.y)}`;
    };
    const s0 = startPt(0);
    d = `M${f(s0.x)} ${f(s0.y)}`;
    for (let k = 0; k < M; k++) d += piece(k) + corner((k + 1) % M);
    d += "Z";
  }

  const extent = Math.max(...verts.map((v) => Math.hypot(v.x, v.y))) * (1 + Math.max(0, bow) * 0.12);
  return { d, extent, tips };
}

function buildSvgString(p, path, extent) {
  const E = Math.ceil(extent + 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-E} ${-E} ${E * 2} ${E * 2}" width="512" height="512">\n  <path d="${path}" fill="${p.fill}"/>\n</svg>`;
}

/* ---------- styles (plain CSS so the look doesn't depend on Tailwind config) ---------- */
const STYLES = `
:root{--ink:#232323;--mute:#6E7174;--panel:#F9F9F9;--body:#E7E5E5;--blue:#FF5500;--line:rgba(35,35,35,.16)}
.sg-root{position:relative;height:100vh;height:100dvh;display:flex;flex-direction:column;gap:12px;padding:14px;box-sizing:border-box;overflow:hidden;background:var(--body);color:var(--ink);font-family:"Space Grotesk","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.sg-mono,.sg-label,.sg-h,.sg-unit,.sg-num,.sg-chip,.sg-btn,.sg-seg button,.sg-badge,.sg-model,.sg-code,.sg-keyrow kbd,.sg-beam,.sg-readout,.sg-toast,.sg-barlabel{font-family:"Space Mono",ui-monospace,Menlo,monospace}
.sg-bg{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(rgba(35,35,35,.13) 1px,transparent 1.2px);background-size:16px 16px}
.sg-body{position:relative;display:flex;flex-direction:column;gap:12px;flex:1 1 0;min-height:0}
.sg-aside{display:flex;flex-direction:column;gap:10px;width:100%;flex:none;max-height:380px;overflow-y:auto;min-height:0;padding-right:4px}
@media (min-width:768px){.sg-body{flex-direction:row}.sg-aside{width:392px;max-height:none}}
.sg-glass{background:var(--panel);border:1px solid var(--line);box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 2px 0 rgba(35,35,35,.08)}
.sg-head{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:10px 12px 10px 16px;border-radius:18px}
.sg-brand{display:flex;align-items:center;gap:12px}
.sg-logo{width:34px;height:34px;border-radius:10px;background:var(--ink);display:grid;place-items:center}
.sg-title{margin:0;font-size:20px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
.sg-model{padding:3px 7px;border-radius:6px;border:1px solid var(--ink);font-size:10px;letter-spacing:.08em}
.sg-badge{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.sg-badge i{width:8px;height:8px;border-radius:50%;background:var(--blue);box-shadow:0 0 0 2px rgba(255,85,0,.2);animation:sg-pulse 1.6s steps(2,end) infinite}
@keyframes sg-pulse{50%{opacity:.25}}
.sg-presets{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-left:auto}
.sg-chip{display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border-radius:10px;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink);cursor:pointer;background:linear-gradient(#fff,#ecebeb);border:1px solid rgba(35,35,35,.3);box-shadow:0 2px 0 rgba(35,35,35,.3);transition:transform .08s,box-shadow .08s,background .15s}
.sg-chip:hover{background:linear-gradient(#fff,#f3f2f2)}
.sg-chip:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:0 2px 0 rgba(35,35,35,.3)}
.sg-chip:active{transform:translateY(2px);box-shadow:0 0 0 rgba(35,35,35,.3)}
.sg-chip.on{background:var(--ink);color:var(--panel);border-color:var(--ink);box-shadow:0 2px 0 #000}
.sg-chip.accent{background:var(--blue);color:var(--ink);border-color:#c94300;box-shadow:0 2px 0 #a83800}
.sg-chip.accent:hover{background:#ff7326}
.sg-chip .sg-n{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;font-size:9.5px;background:rgba(35,35,35,.12)}
.sg-chip.on .sg-n{background:rgba(255,255,255,.2)}
.sg-chip kbd{margin:0;padding:1px 5px;border-radius:4px;font:inherit;font-size:10px;background:rgba(35,35,35,.15)}
.sg-chip:not(.accent) kbd{background:rgba(35,35,35,.1)}
.sg-mini{padding:5px 9px;font-size:10.5px;border-radius:8px}
.sg-card{flex-shrink:0;position:relative;border-radius:18px;padding:16px;background:var(--panel);border:1px solid var(--line);box-shadow:0 2px 0 rgba(35,35,35,.08)}
.sg-card>*{position:relative}
.sg-h{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding-bottom:12px;border-bottom:1px dashed rgba(35,35,35,.25);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink)}
.sg-idx{display:inline-grid;place-items:center;min-width:22px;height:22px;border-radius:50%;background:var(--ink);color:var(--panel);font-size:10px;font-weight:700}
.sg-label{font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink)}
.sg-num{width:66px;padding:5px 7px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums;color:#F9F9F9;background:var(--ink);border:0;border-radius:6px;outline:none;box-shadow:inset 0 2px 3px rgba(0,0,0,.5)}
.sg-num:focus{box-shadow:inset 0 2px 3px rgba(0,0,0,.5),0 0 0 2px var(--blue)}
.sg-num:disabled{opacity:.4}
.sg-hex{width:96px;text-transform:uppercase}
.sg-unit{width:14px;font-size:10.5px;color:var(--mute)}
.sg-hint{margin:8px 0 0;font-size:12px;line-height:1.45;color:var(--mute)}
.sg-range{-webkit-appearance:none;appearance:none;height:24px;width:100%;margin:0;cursor:pointer;outline:none;background-color:transparent;background-repeat:no-repeat;background-image:linear-gradient(var(--blue),var(--blue)),linear-gradient(#cfcdcd,#cfcdcd);background-size:var(--pct) 6px,100% 6px;background-position:left center,center;border-radius:3px}
.sg-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:24px;border-radius:4px;background:linear-gradient(90deg,transparent 43%,var(--ink) 43% 57%,transparent 57%),linear-gradient(#fff,#e6e5e5);border:1px solid var(--ink);box-shadow:0 2px 0 rgba(35,35,35,.5)}
.sg-range::-moz-range-thumb{width:12px;height:22px;border-radius:4px;background:linear-gradient(90deg,transparent 43%,#232323 43% 57%,transparent 57%),linear-gradient(#fff,#e6e5e5);border:1px solid #232323;box-shadow:0 2px 0 rgba(35,35,35,.5)}
.sg-range:focus-visible{box-shadow:0 0 0 2px rgba(255,85,0,.4)}
.sg-range:disabled{cursor:not-allowed;filter:grayscale(1)}
.sg-toggle{position:relative;width:44px;height:24px;border-radius:7px;border:1px solid rgba(35,35,35,.35);cursor:pointer;background:#cfcdcd;box-shadow:inset 0 2px 3px rgba(0,0,0,.2);transition:background .15s}
.sg-toggle.on{background:var(--blue);border-color:#c94300}
.sg-toggle span{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:5px;background:linear-gradient(#fff,#e6e5e5);border:1px solid rgba(35,35,35,.5);box-shadow:0 1px 0 rgba(35,35,35,.4);transition:transform .15s}
.sg-toggle.on span{transform:translateX(20px)}
.sg-swatch{position:relative;width:30px;height:30px;border-radius:8px;overflow:hidden;cursor:pointer;border:1.5px solid var(--ink)}
.sg-swatch input{position:absolute;inset:-6px;width:44px;height:44px;opacity:0;cursor:pointer}
.sg-btn{flex:1;padding:14px 14px;border:1px solid var(--ink);border-radius:12px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;transition:transform .08s,box-shadow .08s}
.sg-btn:active{transform:translateY(3px);box-shadow:0 0 0 #000}
.sg-btn.primary{color:var(--ink);background:var(--blue);border-color:#c94300;box-shadow:0 3px 0 #a83800}
.sg-btn.secondary{color:var(--panel);background:var(--ink);box-shadow:0 3px 0 #000}
.sg-code{width:100%;margin-top:14px;resize:vertical;padding:12px;border-radius:10px;border:0;background:var(--ink);color:#d9d7d7;font-size:11px;line-height:1.5;outline:none;box-shadow:inset 0 2px 4px rgba(0,0,0,.5)}
.sg-seg{display:inline-flex;gap:3px;padding:3px;border-radius:12px;background:#d9d7d7;box-shadow:inset 0 1px 3px rgba(0,0,0,.25)}
.sg-seg button{padding:7px 12px;border:0;border-radius:9px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);background:transparent;cursor:pointer;transition:all .12s}
.sg-seg button:hover{color:var(--ink)}
.sg-seg button.on{background:var(--panel);color:var(--ink);box-shadow:0 1px 0 rgba(35,35,35,.4)}
.sg-main{position:relative;display:flex;flex-direction:column;gap:10px;flex:1 1 0;min-width:0;min-height:340px;padding:12px;box-sizing:border-box;border-radius:22px;background:var(--panel);border:1px solid var(--line);box-shadow:0 2px 0 rgba(35,35,35,.1)}
.sg-screen{position:relative;flex:1 1 0;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:12px;border:1.5px solid var(--ink);box-shadow:inset 0 3px 8px rgba(0,0,0,.18)}
.sg-screen::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(var(--xh,rgba(128,128,128,.28)),var(--xh,rgba(128,128,128,.28))) center/1px 100% no-repeat,linear-gradient(var(--xh,rgba(128,128,128,.28)),var(--xh,rgba(128,128,128,.28))) center/100% 1px no-repeat}
.sg-dots{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(rgba(231,229,229,.16) 1px,transparent 1.3px);background-size:20px 20px}
.sg-readout{position:absolute;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-variant-numeric:tabular-nums}
.sg-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sg-barlabel{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
.sg-toast{position:absolute;left:50%;top:14px;transform:translateX(-50%);padding:7px 12px;border-radius:8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--ink);background:var(--blue);animation:sg-pop .2s steps(4,end)}
@keyframes sg-pop{from{opacity:0;transform:translate(-50%,-8px)}}
.sg-beams{display:grid;grid-template-columns:repeat(8,1fr);gap:6px}
.sg-beam{aspect-ratio:1;border-radius:8px;border:1px solid rgba(35,35,35,.3);background:linear-gradient(#fff,#ecebeb);box-shadow:0 2px 0 rgba(35,35,35,.3);color:var(--ink);font-size:11px;font-weight:700;cursor:pointer;transition:transform .08s,box-shadow .08s}
.sg-beam:active{transform:translateY(2px);box-shadow:none}
.sg-beam.on{background:var(--blue);border-color:#c94300;color:var(--ink);box-shadow:0 2px 0 #a83800}
.sg-beam.sel{outline:2px solid var(--ink);outline-offset:2px}
.sg-row{display:flex;flex-wrap:wrap;gap:7px}
.sg-favs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
.sg-fav{position:relative;aspect-ratio:1;border-radius:10px;background:var(--ink);cursor:pointer;padding:9px;box-shadow:inset 0 2px 4px rgba(0,0,0,.5);transition:transform .1s,outline-color .1s;outline:2px solid transparent}
.sg-fav:hover{outline-color:var(--blue);transform:translateY(-1px)}
.sg-fav svg{width:100%;height:100%;display:block}
.sg-fav button{position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:5px;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:11px;line-height:1;cursor:pointer;opacity:0;transition:opacity .15s}
.sg-fav:hover button{opacity:1}.sg-fav button:hover{background:var(--blue)}
.sg-empty{margin:14px 0 0;padding:16px;border-radius:10px;border:1px dashed rgba(35,35,35,.3);font-size:12px;line-height:1.45;color:var(--mute);text-align:center}
.sg-modal{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(35,35,35,.55)}
.sg-modal-card{width:min(440px,92vw);max-height:86vh;overflow:auto;padding:24px;border-radius:20px;background:var(--panel);border:1.5px solid var(--ink);box-shadow:0 6px 0 rgba(0,0,0,.35)}
.sg-keyrow{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px dashed rgba(35,35,35,.25);font-size:14px}
.sg-keyrow kbd{min-width:26px;padding:3px 8px;text-align:center;border-radius:6px;font-size:11px;font-weight:700;color:var(--ink);background:linear-gradient(#fff,#ecebeb);border:1px solid rgba(35,35,35,.3);box-shadow:0 2px 0 rgba(35,35,35,.3)}
.sg-step{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.sg-step button{width:34px;height:34px;border-radius:9px;border:1px solid rgba(35,35,35,.3);background:linear-gradient(#fff,#ecebeb);box-shadow:0 2px 0 rgba(35,35,35,.3);color:var(--ink);font-size:16px;cursor:pointer}
.sg-step button:active{transform:translateY(2px);box-shadow:none}
.sg-handle{cursor:grab;touch-action:none}.sg-handle:active{cursor:grabbing}
.sg-scroll::-webkit-scrollbar{width:8px}.sg-scroll::-webkit-scrollbar-thumb{background:#bdbbbb;border-radius:8px}
input[type=number]{-moz-appearance:textfield}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
`;

const SMOOTH = ["outerR", "innerR", "altMult", "outerRound", "innerRound", "rotation", "skew", "curve"];

/* eases numeric geometry toward its target so preset changes and drags feel fluid */
function useSmooth(target) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  const raf = useRef(0);
  useEffect(() => {
    const step = () => {
      const c = cur.current;
      const n = { ...target };
      let moving = false;
      for (const k of SMOOTH) {
        const diff = target[k] - c[k];
        if (Math.abs(diff) > 0.01) { n[k] = c[k] + diff * 0.22; moving = true; }
      }
      cur.current = n;
      setV(n);
      if (moving) raf.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(raf.current);
    step();
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return v;
}

/* ---------- UI pieces ---------- */
function NumInput({ value, min, max, step = 1, onCommit, disabled, className = "" }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = parseFloat(draft);
    if (Number.isNaN(n)) return setDraft(String(value));
    const v = clamp(step >= 1 ? Math.round(n) : n, min, max);
    onCommit(v);
    setDraft(String(v));
  };
  return (
    <input
      type="number" className={`sg-num ${className}`} value={draft} min={min} max={max} step={step} disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function Field({ label, value, min, max, step = 1, unit = "", onChange, disabled, hint }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ opacity: disabled ? 0.4 : 1, marginBottom: 18 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10, gap: 8 }}>
        <label className="sg-label">{label}</label>
        <div className="flex items-center" style={{ gap: 6 }}>
          <NumInput value={value} min={min} max={max} step={step} onCommit={onChange} disabled={disabled} />
          <span className="sg-unit">{unit}</span>
        </div>
      </div>
      <input
        type="range" className="sg-range" min={min} max={max} step={step} value={value} disabled={disabled}
        style={{ "--pct": `${pct}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {hint && <p className="sg-hint">{hint}</p>}
    </div>
  );
}

function ColorField({ label, value, onChange, disabled }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex items-center justify-between" style={{ opacity: disabled ? 0.4 : 1, marginBottom: 16, gap: 8 }}>
      <span className="sg-label">{label}</span>
      <div className="flex items-center" style={{ gap: 10 }}>
        <label className="sg-swatch" style={{ background: value }}>
          <input
            type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <input
          type="text" className="sg-num sg-hex" value={draft} disabled={disabled} spellCheck={false} maxLength={7}
          onChange={(e) => { setDraft(e.target.value); if (HEX_RE.test(e.target.value)) onChange(e.target.value); }}
          onBlur={() => !HEX_RE.test(draft) && setDraft(value)}
        />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 18, gap: 12 }}>
      <span className="sg-label">{label}</span>
      <button type="button" role="switch" aria-checked={checked} className={`sg-toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  );
}

function Section({ title, index, children }) {
  return (
    <section className="sg-card">
      <h2 className="sg-h"><span className="sg-idx">{index}</span><span>{title}</span></h2>
      {children}
    </section>
  );
}

/* ---------- main ---------- */
const FAV_KEY = "star-generator-favorites-v1";
const ANIMS = [
  ["off", "Off"], ["spin", "Spin"], ["pulse", "Pulse"], ["twist", "Twist"], ["ripple", "Ripple"],
  ["breathe", "Breathe"], ["sway", "Sway"], ["soften", "Soften"], ["bloom", "Bloom"], ["flutter", "Flutter"],
];
const SHORTCUTS = [
  ["R", "Randomize"], ["S", "Save to favorites"], ["C", "Copy SVG code"], ["D", "Download .SVG"],
  ["1 – 5", "Load preset"], ["[  ]", "Fewer / more points"], ["← →", "Rotate −5° / +5°"],
  ["P", "Play / pause animation"], ["B", "Cycle preview background"], ["H", "Show / hide selection points"],
  ["⌘/Ctrl Z", "Undo"], ["⇧⌘/Ctrl Y", "Redo"],
  ["L", "Symmetry lock on / off"], ["?", "Show this list"],
];

function FavThumb({ fav, onLoad, onDelete }) {
  const { d, extent } = useMemo(() => buildStar(fav.p), [fav]);
  const E = Math.ceil(extent + 6);
  return (
    <div className="sg-fav" onClick={onLoad} title="Load this star">
      <svg viewBox={`${-E} ${-E} ${E * 2} ${E * 2}`}><path d={d} fill={fav.p.fill ?? C.white} /></svg>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete favorite">×</button>
    </div>
  );
}

/* Pure animation frame: the same maths drives the live preview and the WebM recorder. */
function animView(shown, mode, intensity, t) {
  const k = intensity / 100; // animation intensity scales every effect
  switch (mode) {
      case "spin": return { ...shown, rotation: shown.rotation + t * 50 * k };
      case "pulse": return { ...shown, innerR: shown.innerR * (1 + 0.35 * k * Math.sin(t * 2.2)), outerR: shown.outerR * (1 + 0.06 * k * Math.sin(t * 2.2 + 1)) };
      case "twist": return { ...shown, skew: shown.skew + 28 * k * Math.sin(t * 1.6) };
      case "ripple": return { ...shown, _wave: { amp: 0.2 * k, t: t * 3 } };
      case "breathe": { const m = 1 + 0.12 * k * Math.sin(t * 1.6); return { ...shown, outerR: shown.outerR * m, innerR: shown.innerR * m }; }
      case "sway": return { ...shown, rotation: shown.rotation + 25 * k * Math.sin(t * 1.4) };
      case "soften": return {
        ...shown,
        outerRound: shown.outerRound + k * (50 + 50 * Math.sin(t * 1.3) - shown.outerRound),
        innerRound: shown.innerRound + k * (50 + 50 * Math.sin(t * 1.3 + 1.5) - shown.innerRound),
      };
      case "bloom": return { ...shown, curve: shown.curve + 70 * k * Math.sin(t * 1.5) };
      case "flutter": return { ...shown, _flutter: { amp: 0.3 * k, t: t * 2.5 } };
      default: return shown;
  }
}

/* Animation-time length of one seamless loop (t runs at `speed` per real second). */
const TAU = Math.PI * 2;
const LOOP_OMEGA = { pulse: 2.2, twist: 1.6, ripple: 3, breathe: 1.6, sway: 1.4, soften: 1.3, bloom: 1.5, flutter: 2.5 };
function loopLength(p, mode, intensity) {
  if (mode === "spin") return 360 / (50 * Math.max(intensity / 100, 0.05)); // one full turn
  return TAU / (LOOP_OMEGA[mode] || 1);
}
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

export default function StarGenerator() {
  const [p, setP] = useState(DEFAULTS);
  const [bg, setBg] = useState("dark");
  const [toast, setToast] = useState(false);
  const [activePreset, setActivePreset] = useState("Classic 5-Point");
  const [sel, setSel] = useState(0);
  const [showHandles, setShowHandles] = useState(true);
  const [anim, setAnim] = useState({ mode: "off", speed: 1, intensity: 100 });
  const [t, setT] = useState(0);
  const [favs, setFavs] = useState([]);
  const [showKeys, setShowKeys] = useState(false);
  const [rec, setRec] = useState(null); // null | { progress: 0..1 }
  const [recSize, setRecSize] = useState(720);
  const [recMsg, setRecMsg] = useState("");
  const recCancel = useRef(false);
  const timer = useRef(null);
  const svgRef = useRef(null);
  const drag = useRef(null);

  const set = (k) => (v) => { setP((s) => ({ ...s, [k]: v })); setActivePreset(null); };
  const applyPreset = (pr) => {
    setP((s) => ({ ...DEFAULTS, ...pr.values, fill: s.fill, symOn: s.symOn, symMode: s.symMode }));
    setActivePreset(pr.name);
  };

  /* ---- derived geometry ---- */
  const autoFill = bg === "dark" ? C.white : C.char;
  const fillNow = p.fill ?? autoFill;
  const exact = useMemo(() => buildStar(p), [p]);
  const svgString = useMemo(() => buildSvgString({ ...p, fill: fillNow }, exact.d, exact.extent), [p, exact, fillNow]);
  const shown = useSmooth(p);
  const staticStar = useMemo(() => buildStar(shown), [shown]);
  const view = useMemo(() => animView(shown, anim.mode, anim.intensity, t), [shown, anim.mode, anim.intensity, t]);
  const live = useMemo(() => (anim.mode === "off" ? staticStar : buildStar(view)), [view, staticStar, anim.mode]);
  const half = Math.max(280, Math.ceil(staticStar.extent * (anim.mode === "off" ? 1 : 1.3) + 12));
  const selIdx = Math.min(sel, p.points - 1);
  const selEdit = (p.beamEdits || {})[selIdx] || {};

  /* ---- animation clock ---- */
  useEffect(() => {
    if (anim.mode === "off") return;
    let raf, last = performance.now(), acc = 0;
    const loop = (now) => { acc += ((now - last) / 1000) * anim.speed; last = now; setT(acc); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [anim.mode, anim.speed]);

  /* ---- favorites (localStorage when the host allows it) ---- */
  useEffect(() => {
    try { const raw = localStorage.getItem(FAV_KEY); if (raw) setFavs(JSON.parse(raw)); } catch {}
  }, []);
  const persist = (list) => { setFavs(list); try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch {} };
  const saveFav = () => persist([{ id: Date.now(), p: { ...p } }, ...favs].slice(0, 24));
  const loadFav = (fav) => { setP({ ...DEFAULTS, ...fav.p }); setActivePreset(null); };

  /* ---- randomize ---- */
  const randomize = () => {
    const r = (a, b) => a + Math.random() * (b - a);
    const ri = (a, b) => Math.floor(r(a, b + 1));
    setP((s) => {
      const outerR = Math.round(r(130, 240));
      const alt = Math.random() < 0.4;
      const every = alt ? ri(2, 4) : 2;
      return {
        ...DEFAULTS, fill: s.fill, symOn: s.symOn, symMode: s.symMode,
        points: ri(3, 18), outerR, innerR: Math.round(outerR * r(0.2, 0.85)),
        outerRound: Math.random() < 0.5 ? Math.round(r(0, 90)) : 0,
        innerRound: Math.random() < 0.4 ? Math.round(r(0, 90)) : 0,
        skew: Math.random() < 0.35 ? Math.round(r(-35, 35)) : 0,
        curve: Math.random() < 0.45 ? Math.round(r(-70, 70)) : 0,
        altOn: alt, altEvery: every, altOffset: alt ? ri(0, every - 1) : 1 % every,
        altMult: alt ? Math.round(r(0.35, 1.35) * 20) / 20 : 1,
      };
    });
    setSel(0);
    setActivePreset(null);
  };

  /* ---- alternating beams ---- */
  const beamOn = (i) => isSecondary({ ...p, altOn: true }, i);
  const toggleBeam = (i) => {
    const cur = Array.from({ length: p.points }, (_, k) => k).filter(beamOn);
    const next = cur.includes(i) ? cur.filter((k) => k !== i) : [...cur, i];
    setP((s) => ({ ...s, altMode: "custom", altCustom: next, altOn: true }));
    setActivePreset(null);
  };
  const setCustom = (fn) => {
    const all = Array.from({ length: p.points }, (_, k) => k);
    setP((s) => ({ ...s, altMode: "custom", altCustom: all.filter(fn), altOn: true }));
    setActivePreset(null);
  };
  const setEvery = (n) => {
    setP((s) => ({ ...s, altMode: "pattern", altEvery: n, altOffset: Math.min(s.altOffset, n - 1), altOn: true }));
    setActivePreset(null);
  };
  const uneven = p.altOn && p.altMode === "pattern" && p.points % p.altEvery !== 0;

  /* ---- per-beam editing (with symmetry lock) ---- */
  const targetsFor = (s, i) => {
    const N = s.points;
    if (!s.symOn) return [[i, 1]];
    if (s.symMode === "radial") return Array.from({ length: N }, (_, k) => [k, 1]);
    const j = (N - i) % N; // mirror across the vertical axis through beam 1
    return j === i ? [[i, 1]] : [[i, 1], [j, -1]];
  };
  const updateBeam = (i, patch) => {
    setP((s) => {
      const next = { ...(s.beamEdits || {}) };
      for (const [k, sign] of targetsFor(s, i)) {
        const cur = { ...(next[k] || {}) };
        for (const key in patch) cur[key] = key === "rot" && sign === -1 ? -patch.rot : patch[key];
        next[k] = cur;
      }
      return { ...s, beamEdits: next };
    });
    setActivePreset(null);
  };
  const resetBeam = (i) => {
    setP((s) => {
      const next = { ...(s.beamEdits || {}) };
      for (const [k] of targetsFor(s, i)) delete next[k];
      return { ...s, beamEdits: next };
    });
  };
  const resetAllBeams = () => setP((s) => ({ ...s, beamEdits: {} }));

  /* drag a tip handle on the preview to change its length */
  const onHandleDown = (e, i) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = i; setSel(i);
  };
  const onHandleMove = (e) => {
    const i = drag.current, svg = svgRef.current;
    if (i == null || !svg) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    const base = p.outerR * (isSecondary(p, i) ? p.altMult : 1);
    updateBeam(i, { len: clamp(Math.round((Math.hypot(loc.x, loc.y) / base) * 100) / 100, 0.2, 2) });
  };
  const onHandleUp = () => { drag.current = null; };

  /* ---- export ---- */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(svgString);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = svgString; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setToast(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(false), 1800);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url; a.download = `rayform-${p.points}pt.svg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };


  /* ---- record the animation as a seamless-loop .webm ---- */
  const recordWebm = () => {
    const mime = pickMime();
    if (anim.mode === "off") return;
    if (!mime) { setRecMsg("This browser can't record WebM. Try Chrome, Edge or Firefox."); return; }
    setRecMsg("");
    const S = recSize;
    const canvas = document.createElement("canvas");
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d");
    const frameHalf = Math.max(280, Math.ceil(exact.extent * 1.3 + 12));
    const scale = S / (frameHalf * 2);
    const bgColor = bg === "dark" ? C.char : C.white;
    const fillColor = fillNow;
    const loopT = loopLength(p, anim.mode, anim.intensity);
    const loops = Math.max(1, Math.round(5 / (loopT / anim.speed))); // aim for about 5 s or more
    const totalT = Math.min(loopT * loops, loopT * Math.max(1, Math.floor(20 / (loopT / anim.speed))) || loopT);
    const realMs = Math.min((totalT / anim.speed) * 1000, 20000); // never record more than 20 s
    const draw = (tt) => {
      const star = buildStar(animView(p, anim.mode, anim.intensity, tt));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, S, S);
      if (bg !== "checker") { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, S, S); } // transparent preview keeps the alpha channel
      ctx.setTransform(scale, 0, 0, scale, S / 2, S / 2);
      ctx.fillStyle = fillColor; ctx.fill(new Path2D(star.d));
    };
    draw(0);
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      setRec(null);
      if (recCancel.current) return;
      const url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
      const a = document.createElement("a");
      a.href = url; a.download = `rayform-${p.points}pt-${anim.mode}.webm`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    recCancel.current = false;
    setRec({ progress: 0 });
    recorder.start();
    const t0 = performance.now();
    const frame = (now) => {
      if (recCancel.current) { recorder.state !== "inactive" && recorder.stop(); return; }
      const end = realMs - 1000 / 30; // stop one frame early: the last frame would equal the first and stall the loop
      const el = Math.min(now - t0, end);
      draw((el / realMs) * totalT);
      setRec({ progress: el / end });
      if (el < end) requestAnimationFrame(frame);
      else setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 120);
    };
    requestAnimationFrame(frame);
  };
  const cancelRec = () => { recCancel.current = true; };

  /* ---- undo / redo (slider drags are grouped into one step) ---- */
  const pRef = useRef(p);
  pRef.current = p;
  const hist = useRef({ past: [], future: [], base: DEFAULTS, skip: false, timer: null });
  const [, bumpHist] = useState(0);
  const commitHist = () => {
    const h = hist.current;
    if (h.timer) { clearTimeout(h.timer); h.timer = null; }
    if (pRef.current !== h.base) {
      h.past.push(h.base);
      if (h.past.length > 100) h.past.shift();
      h.base = pRef.current;
      h.future = [];
      bumpHist((n) => n + 1);
    }
  };
  useEffect(() => {
    const h = hist.current;
    if (h.skip) { h.skip = false; h.base = p; return; }
    if (p === h.base) return;
    clearTimeout(h.timer);
    h.timer = setTimeout(commitHist, 350);
  }, [p]);
  const undo = () => {
    commitHist();
    const h = hist.current;
    if (!h.past.length) return;
    const prev = h.past.pop();
    h.future.push(h.base);
    h.skip = true; h.base = prev;
    setP(prev); setActivePreset(null); bumpHist((n) => n + 1);
  };
  const redo = () => {
    commitHist();
    const h = hist.current;
    if (!h.future.length) return;
    const next = h.future.pop();
    h.past.push(h.base);
    h.skip = true; h.base = next;
    setP(next); setActivePreset(null); bumpHist((n) => n + 1);
  };
  const canUndo = hist.current.past.length > 0 || p !== hist.current.base;
  const canRedo = hist.current.future.length > 0 && p === hist.current.base;

  /* ---- keyboard shortcuts (handler kept in a ref so it always sees fresh state) ---- */
  const keyRef = useRef();
  keyRef.current = (e) => {
    const tag = (e.target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.metaKey || e.ctrlKey) {
      const kk = e.key.toLowerCase();
      if (kk === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (kk === "y") { e.preventDefault(); return redo(); }
      return;
    }
    if (e.altKey) return;
    const k = e.key;
    if (k === "Escape") return setShowKeys(false);
    if (k === "?" || k === "/") return setShowKeys((v) => !v);
    if (/^[1-5]$/.test(k)) return applyPreset(PRESETS[+k - 1]);
    switch (k.toLowerCase()) {
      case "r": return randomize();
      case "s": return saveFav();
      case "c": return copy();
      case "d": return download();
      case "[": return set("points")(clamp(p.points - 1, 3, 32));
      case "]": return set("points")(clamp(p.points + 1, 3, 32));
      case "arrowleft": e.preventDefault(); return set("rotation")((p.rotation - 5 + 360) % 360);
      case "arrowright": e.preventDefault(); return set("rotation")((p.rotation + 5) % 360);
      case "p": return setAnim((a) => ({ ...a, mode: a.mode === "off" ? "spin" : "off" }));
      case "b": return setBg((b) => ({ dark: "light", light: "checker", checker: "dark" }[b]));
      case "h": return setShowHandles((v) => !v);
      case "l": return set("symOn")(!p.symOn);
      default:
    }
  };
  useEffect(() => {
    const h = (e) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ---- look ---- */
  const stageBg = {
    light: { background: C.white },
    dark: { background: C.char },
    checker: {
      backgroundColor: "#ffffff",
      backgroundImage:
        "linear-gradient(45deg,#d9d7d7 25%,transparent 25%),linear-gradient(-45deg,#d9d7d7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d9d7d7 75%),linear-gradient(-45deg,transparent 75%,#d9d7d7 75%)",
      backgroundSize: "20px 20px",
      backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
    },
  }[bg];
  const onDark = bg === "dark";
  const tone = onDark ? "rgba(231,229,229,.6)" : "rgba(35,35,35,.55)";
  const handlesVisible = showHandles && anim.mode === "off";

  return (
    <div className="sg-root">
      <style>{STYLES}</style>
      <div className="sg-bg" />


      {/* Header + presets */}
      <header className="sg-glass sg-head">
        <div className="sg-brand">
          <div className="sg-logo" aria-hidden>
            <svg viewBox="-12 -12 24 24" width="20" height="20"><path d="M0 -10L3 -3.2L10 -3L4.6 1.6L6.2 9L0 5L-6.2 9L-4.6 1.6L-10 -3L-3 -3.2Z" fill="#F9F9F9" /></svg>
          </div>
          <h1 className="sg-title">Rayform</h1>
          <span className="sg-model">SG-01</span>
          <span className="sg-badge"><i />Live svg</span>
        </div>
        <div className="sg-presets">
          {PRESETS.map((pr, i) => (
            <button key={pr.name} onClick={() => applyPreset(pr)} className={`sg-chip ${activePreset === pr.name ? "on" : ""}`}>
              <span className="sg-n">{i + 1}</span>{pr.name}
            </button>
          ))}
          <button onClick={randomize} className="sg-chip accent">Randomize<kbd>R</kbd></button>
          <button onClick={() => setShowHandles((v) => !v)} className={`sg-chip ${showHandles ? "on" : ""}`} aria-pressed={showHandles} title="Show / hide the selection points on the preview">
            {showHandles ? "Hide points" : "Show points"}<kbd>H</kbd>
          </button>
          <button onClick={undo} disabled={!canUndo} className="sg-chip" aria-label="Undo" title="Undo (Ctrl/⌘ Z)">↶ Undo</button>
          <button onClick={redo} disabled={!canRedo} className="sg-chip" aria-label="Redo" title="Redo (Shift Ctrl/⌘ Z)">Redo ↷</button>
          <button onClick={() => setShowKeys(true)} className="sg-chip" aria-label="Keyboard shortcuts">Keys<kbd>?</kbd></button>
        </div>
      </header>

      <div className="sg-body">
        {/* Stage */}
        <main className="sg-main">
          <div className="sg-screen" style={{ ...stageBg, ["--xh"]: onDark ? "rgba(231,229,229,.1)" : "rgba(35,35,35,.1)" }}>
            {onDark && <div className="sg-dots" />}
            <div className="sg-readout" style={{ left: 16, top: 14, color: tone }}>
              Preview{anim.mode !== "off" ? ` / ${anim.mode}` : ""}
            </div>
            <div className="sg-readout" style={{ right: 16, top: 14, color: tone }}>
              pts {String(p.points).padStart(2, "0")} · R{p.outerR} · r{p.innerR}
            </div>
            <div className="sg-readout" style={{ left: 16, bottom: 14, color: tone }}>
              {anim.mode !== "off" ? "export: record .webm" : handlesVisible ? "drag tips to edit" : ""}
            </div>
            <div className="sg-readout" style={{ right: 16, bottom: 14, color: tone }}>
              {(p.fill ?? "auto").toString().toUpperCase()}
            </div>

            <svg
              ref={svgRef}
              viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
              style={{ display: "block", position: "relative", aspectRatio: "1 / 1", overflow: "visible", width: "min(100%, 780px, calc(100vh - 330px))", minWidth: 120 }}
              role="img" aria-label="Star preview"
            >
              <path d={live.d} fill={fillNow} style={{ transition: "fill .25s" }} />
              {handlesVisible && live.tips.map((tp) => (
                <circle
                  key={tp.i} className="sg-handle" cx={tp.x} cy={tp.y}
                  r={tp.i === selIdx ? 11 : 7}
                  fill={tp.i === selIdx ? C.blue : C.white}
                  stroke={tp.i === selIdx ? C.white : C.blue} strokeWidth={3}
                  onPointerDown={(e) => onHandleDown(e, tp.i)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
                />
              ))}
            </svg>

            {toast && <div className="sg-toast">Copied</div>}
          </div>

          <div className="sg-bar">
            <span className="sg-barlabel">Display</span>
            <div className="sg-seg">
              {[["dark", "Dark"], ["light", "Light"], ["checker", "Transparent"]].map(([k, l]) => (
                <button key={k} onClick={() => setBg(k)} className={bg === k ? "on" : ""}>{l}</button>
              ))}
            </div>
            <span className="sg-barlabel">Press ? for keys</span>
          </div>
        </main>

        {/* Sidebar */}
        <aside className="sg-scroll sg-aside">
          <Section title="Geometry" index="01">
            <Field label="Points" value={p.points} min={3} max={32} onChange={set("points")} />
            <Field label="Outer radius" value={p.outerR} min={50} max={250} unit="px" onChange={set("outerR")} />
            <Field label="Inner radius" value={p.innerR} min={10} max={240} unit="px" onChange={set("innerR")} />
            <Field label="Rotation" value={p.rotation} min={0} max={360} unit="°" onChange={set("rotation")} />
            <Field label="Skew / twist" value={p.skew} min={-45} max={45} unit="°" onChange={set("skew")} hint="Rotates valleys relative to tips for pinwheel and sawblade looks." />
          </Section>

          <Section title="Alternating beams" index="02">
            <Toggle label="Secondary beams" checked={p.altOn} onChange={set("altOn")} />
            <Field label="Secondary length" value={p.altMult} min={0.2} max={1.5} step={0.05} unit="×" disabled={!p.altOn} onChange={set("altMult")} />

            <div style={{ opacity: p.altOn ? 1 : 0.4, pointerEvents: p.altOn ? "auto" : "none" }}>
              <div className="sg-label" style={{ marginBottom: 10 }}>Repeat pattern</div>
              <div className="sg-row" style={{ marginBottom: 18 }}>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button key={n} className={`sg-chip sg-mini ${p.altMode === "pattern" && p.altEvery === n ? "on" : ""}`} onClick={() => setEvery(n)}>
                    Every {n}{n === 2 ? "nd" : n === 3 ? "rd" : "th"}
                  </button>
                ))}
              </div>

              {p.altMode === "pattern" && (
                <Field label="Start at beam" value={p.altOffset + 1} min={1} max={p.altEvery} onChange={(v) => set("altOffset")(v - 1)} />
              )}

              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <span className="sg-label">Pick beams</span>
                <div className="sg-row">
                  <button className="sg-chip sg-mini" onClick={() => setCustom(() => true)}>All</button>
                  <button className="sg-chip sg-mini" onClick={() => setCustom(() => false)}>None</button>
                  <button className="sg-chip sg-mini" onClick={() => setCustom((i) => !beamOn(i))}>Invert</button>
                </div>
              </div>
              <div className="sg-beams">
                {Array.from({ length: p.points }, (_, i) => (
                  <button key={i} className={`sg-beam ${beamOn(i) ? "on" : ""}`} onClick={() => toggleBeam(i)} title={`Beam ${i + 1}`}>
                    {i + 1}
                  </button>
                ))}
              </div>
              <p className="sg-hint">
                Highlighted beams get the secondary length. Beam 1 is at the top, counting clockwise (with rotation at 0°).
                {uneven ? ` ${p.points} isn't divisible by ${p.altEvery}, so the pattern won't be perfectly symmetric.` : ""}
              </p>
            </div>
          </Section>

          <Section title="Beam editor" index="03">
            <div className="sg-step">
              <button onClick={() => setSel((selIdx - 1 + p.points) % p.points)} aria-label="Previous beam">‹</button>
              <span className="sg-label">Beam {selIdx + 1} <span style={{ opacity: 0.5 }}>of {p.points}</span></span>
              <button onClick={() => setSel((selIdx + 1) % p.points)} aria-label="Next beam">›</button>
            </div>
            <Field label="Length" value={selEdit.len ?? 1} min={0.2} max={2} step={0.05} unit="×" onChange={(v) => updateBeam(selIdx, { len: v })} />
            <Field label="Angle offset" value={selEdit.rot ?? 0} min={-30} max={30} unit="°" onChange={(v) => updateBeam(selIdx, { rot: v })} />
            <Field
              label="Tip rounding" value={selEdit.round ?? p.outerRound} min={0} max={100} unit="%"
              onChange={(v) => updateBeam(selIdx, { round: v })}
              hint={selEdit.round == null ? "Inherited from the global tip rounding." : undefined}
            />
            <div className="sg-row" style={{ marginBottom: 18 }}>
              <button className="sg-chip sg-mini" onClick={() => resetBeam(selIdx)}>Reset beam</button>
              <button className="sg-chip sg-mini" onClick={resetAllBeams}>Reset all beams</button>
            </div>
            <Toggle label="Symmetry lock" checked={p.symOn} onChange={set("symOn")} />
            {p.symOn && (
              <div className="sg-row" style={{ marginBottom: 18 }}>
                {[["mirror", "Mirror"], ["radial", "Radial (all beams)"]].map(([k, l]) => (
                  <button key={k} className={`sg-chip sg-mini ${p.symMode === k ? "on" : ""}`} onClick={() => set("symMode")(k)}>{l}</button>
                ))}
              </div>
            )}
            <Toggle label="Show handles on preview" checked={showHandles} onChange={setShowHandles} />
            <p className="sg-hint" style={{ marginTop: -6 }}>
              Drag a tip handle on the preview to stretch that beam. With the lock on, edits are
              {p.symOn ? (p.symMode === "mirror" ? " mirrored across the vertical axis." : " applied to every beam equally.") : " applied to one beam only."}
            </p>
          </Section>

          <Section title="Corners & edges" index="04">
            <Field label="Tips" value={p.outerRound} min={0} max={100} unit="%" onChange={set("outerRound")} />
            <Field label="Valleys" value={p.innerRound} min={0} max={100} unit="%" onChange={set("innerRound")} />
            <Field label="Edge curve" value={p.curve} min={-100} max={100} unit="%" onChange={set("curve")} hint="Negative pinches the edges inward (sparkle), positive bulges them outward (puffy)." />
          </Section>

          <Section title="Animation preview" index="05">
            <div className="sg-row" style={{ marginBottom: 18 }}>
              {ANIMS.map(([k, l]) => (
                <button key={k} className={`sg-chip sg-mini ${anim.mode === k ? "on" : ""}`} onClick={() => setAnim((a) => ({ ...a, mode: k }))}>{l}</button>
              ))}
            </div>
            <Field label="Speed" value={anim.speed} min={0.25} max={3} step={0.25} unit="×" disabled={anim.mode === "off"} onChange={(v) => setAnim((a) => ({ ...a, speed: v }))} />
            <Field label="Intensity" value={anim.intensity} min={0} max={100} step={5} unit="%" disabled={anim.mode === "off"} onChange={(v) => setAnim((a) => ({ ...a, intensity: v }))} />
            <p className="sg-hint" style={{ marginTop: -6 }}>The SVG export is always the static shape. Use Record .WEBM in Export to save the animation.</p>
          </Section>

          <Section title="Color" index="06">
            <ColorField label="Fill color" value={fillNow} onChange={set("fill")} />
            <div className="flex items-center justify-between" style={{ marginTop: -4 }}>
              <span className="sg-hint" style={{ margin: 0 }}>
                {p.fill === null ? "Auto: follows the preview background" : "Custom color"}
              </span>
              {p.fill !== null && (
                <button className="sg-chip sg-mini" onClick={() => set("fill")(null)}>Reset to auto</button>
              )}
            </div>
          </Section>

          <Section title="Favorites" index="07">
            <button className="sg-chip accent" style={{ width: "100%" }} onClick={saveFav}>Save current shape<kbd>S</kbd></button>
            {favs.length === 0 ? (
              <p className="sg-empty">Nothing saved yet. Saved shapes appear here, and are kept in this browser when storage is available.</p>
            ) : (
              <div className="sg-favs">
                {favs.map((fav) => (
                  <FavThumb key={fav.id} fav={fav} onLoad={() => loadFav(fav)} onDelete={() => persist(favs.filter((x) => x.id !== fav.id))} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Export" index="08">
            <div className="flex" style={{ gap: 10 }}>
              <button onClick={copy} className="sg-btn primary">{toast ? "Copied!" : "Copy SVG Code"}</button>
              <button onClick={download} className="sg-btn secondary">Download .SVG</button>
            </div>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
            <div className="sg-label" style={{ marginBottom: 8 }}>Animation video</div>
            <div className="flex" style={{ gap: 8, marginBottom: 10 }}>
              {[[480, "480"], [720, "720"], [1080, "1080"]].map(([v, l]) => (
                <button key={v} className={`sg-chip sg-mini ${recSize === v ? "on" : ""}`} onClick={() => setRecSize(v)} disabled={!!rec}>{l} px</button>
              ))}
            </div>
            {rec ? (
              <div className="flex" style={{ gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1, height: 10, borderRadius: 5, background: "rgba(35,35,35,.12)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(rec.progress * 100)}%`, height: "100%", background: "var(--blue)" }} />
                </div>
                <button onClick={cancelRec} className="sg-btn secondary" style={{ flex: "0 0 auto" }}>Cancel</button>
              </div>
            ) : (
              <button onClick={recordWebm} disabled={anim.mode === "off"} className="sg-btn primary" style={{ width: "100%", opacity: anim.mode === "off" ? 0.45 : 1, cursor: anim.mode === "off" ? "not-allowed" : "pointer" }}>
                Record .WEBM
              </button>
            )}
            <p className="sg-hint" style={{ marginTop: 8 }}>
              {recMsg || (anim.mode === "off"
                ? "Pick an animation in section 05 first."
                : "Records a seamless loop of about 5 seconds at the current speed and intensity. Keep this tab open while it records." + (bg === "checker" ? " Transparent preview records a WebM with a transparent background." : ""))}
            </p>
            <textarea className="sg-code" readOnly value={svgString} rows={6} spellCheck={false} />
          </Section>
        </aside>
      </div>

      {showKeys && (
        <div className="sg-modal" onClick={() => setShowKeys(false)}>
          <div className="sg-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em" }}>Keyboard shortcuts</h2>
              <button className="sg-chip sg-mini" onClick={() => setShowKeys(false)}>Close</button>
            </div>
            {SHORTCUTS.map(([k, d]) => (
              <div className="sg-keyrow" key={k}><span>{d}</span><kbd>{k}</kbd></div>
            ))}
            <p className="sg-hint">Shortcuts pause while you're typing in a field.</p>
          </div>
        </div>
      )}
    </div>
  );
}
