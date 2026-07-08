/** render.mjs — the newsprint renderer. Pure function:
 *    render(paper, edition) -> a standalone, self-contained HTML broadsheet.
 *
 *  No dependencies, no network, no build step. Theme-aware (light/dark).
 *  Every text value is escaped at the sink. Custom visualizations enter
 *  through `raw` blocks (opt-in HTML). Evidence tiers are the framework's
 *  spine — a claim without a tier does not render its stamp.
 *
 *  The lens is baked in: any claim on the CLAIMED tier that carries a
 *  `quote` gets a captioneer deep-link automatically — the press hands
 *  every combatant statement to the reader's own eye. That is the tie to
 *  captioneer.io: the lens reads a sentence, the press reads the world.
 *
 *  Part of open-press · CC BY-SA 4.0. */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

// Evidence tiers — the framework default. A paper may override labels/colors
// in paper.config.tiers, but the four *roles* are fixed: verified, reported,
// claimed, refuted. Order is severity of trust, strongest first.
const DEFAULT_TIERS = {
  verified: { badge: "✓", label: "VERIFIED", cls: "t-v" },
  reported: { badge: "◑", label: "REPORTED", cls: "t-r" },
  claimed: { badge: "○", label: "CLAIMED", cls: "t-c" },
  refuted: { badge: "✗", label: "REFUTED", cls: "t-x" },
};

function tierStamp(tierKey, tiers) {
  if (!tierKey) return "";
  const t = tiers[tierKey];
  if (!t) return "";
  return `<span class="badge ${t.cls}">${esc(t.badge)} ${esc(t.label)}</span>`;
}

function lensLink(lensBase, quote) {
  if (!lensBase || !quote) return "";
  const u = `${lensBase.replace(/\/$/, "")}/?text=${encodeURIComponent(quote)}`;
  return ` <a class="lens" href="${esc(u)}" title="read it through the lens">🔎 read it</a>`;
}

// ── block renderers ─────────────────────────────────────────────────────
function renderProse(b, ctx) {
  const paras = (b.paragraphs ?? (b.text ? [b.text] : [])).map((p) => {
    if (typeof p === "string") return `<p>${esc(p)}</p>`;
    // { text, tier?, quote? } — quote on a claimed tier gets the lens
    const stamp = p.tier ? tierStamp(p.tier, ctx.tiers) + " " : "";
    const lens = p.tier === "claimed" ? lensLink(ctx.lens, p.quote) : "";
    return `<p>${stamp}${esc(p.text)}${lens}</p>`;
  });
  return paras.join("\n");
}

function renderTiles(b, ctx) {
  const tiles = (b.tiles ?? [])
    .map(
      (t) =>
        `<div class="tile"><div class="n">${esc(t.n)}${t.unit ? ` <small>${esc(t.unit)}</small>` : ""}</div>` +
        `<div class="d">${esc(t.note)}${t.tier ? " " + tierStamp(t.tier, ctx.tiers) : ""}</div></div>`,
    )
    .join("");
  return `<div class="tiles">${tiles}</div>`;
}

function renderTimeline(b, ctx) {
  const items = (b.items ?? [])
    .map(
      (i) =>
        `<li class="${i.hot ? "hot" : ""}"><span class="t-date">${esc(i.date)}</span> ${i.tier ? tierStamp(i.tier, ctx.tiers) : ""} — ${esc(i.text)}</li>`,
    )
    .join("");
  return `<ul class="timeline">${items}</ul>`;
}

function renderVerdict(b, ctx) {
  const lines = (b.lines ?? [])
    .map((l) => `<div class="vline"><span class="vword">${esc(l.label)}</span><span>${esc(l.text)}</span></div>`)
    .join("");
  return `<div class="verdict">${b.title ? `<h3>${esc(b.title)}</h3>` : ""}${lines}</div>`;
}

function renderTable(b) {
  const head = b.head ? `<tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>` : "";
  const rows = (b.rows ?? []).map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table>${head}${rows}</table></div>`;
}

function renderBlock(b, ctx) {
  switch (b.type) {
    case "prose": return renderProse(b, ctx);
    case "tiles": return renderTiles(b, ctx);
    case "timeline": return renderTimeline(b, ctx);
    case "verdict": return renderVerdict(b, ctx);
    case "table": return renderTable(b);
    case "raw": return String(b.html ?? ""); // escape hatch: custom viz, author's responsibility
    default: return "";
  }
}

function renderSection(s, ctx) {
  const blocks = (s.blocks ?? []).map((b) => renderBlock(b, ctx)).join("\n");
  return `<section>
    ${s.kicker ? `<div class="kicker"><span class="label">${esc(s.kicker)}</span></div>` : ""}
    ${s.headline ? `<h2>${esc(s.headline)}</h2>` : ""}
    ${s.dek ? `<p class="dek">${esc(s.dek)}</p>` : ""}
    ${blocks}
  </section>`;
}

// ── the page ────────────────────────────────────────────────────────────
export function render(paper, edition) {
  const tiers = { ...DEFAULT_TIERS, ...(paper.tiers ?? {}) };
  const ctx = { tiers, lens: paper.instrument_of_record ?? null };
  const P = paper.palette ?? {};

  const lead = edition.lead;
  const leadHtml = lead
    ? `<section class="lead">
        <div class="dateline">${esc(lead.dateline ?? "")} ${lead.tier ? tierStamp(lead.tier, tiers) : ""}</div>
        <h2 class="headline">${esc(lead.headline)}</h2>
        ${lead.dek ? `<p class="dek">${esc(lead.dek)}</p>` : ""}
        ${renderProse({ paragraphs: lead.paragraphs ?? [] }, ctx)}
      </section>`
    : "";

  const tierLegend = Object.values(tiers)
    .map((t) => `<span><span class="badge ${t.cls}">${esc(t.badge)} ${esc(t.label)}</span></span>`)
    .join(" ");

  const corrections = (edition.corrections ?? []).length
    ? `<section class="corrections"><h3>${esc(paper.corrections_desk_name ?? "Corrections Desk")} ${tierStamp("refuted", tiers)}</h3>${edition.corrections
        .map((x) => `<p><span class="dead">${esc(x.claim)}</span> — ${esc(x.note ?? "refuted in verification. Do not cite.")}</p>`)
        .join("")}</section>`
    : "";

  const sources = (edition.sources ?? []).length
    ? `<div class="sources"><div class="label">${esc(paper.sources_label ?? "Sources")}</div><div class="src-cols">${edition.sources
        .map((s) => `<div>• ${s.url ? `<a href="${esc(s.url)}">${esc(s.title ?? s.url)}</a>` : esc(s.title ?? "")}</div>`)
        .join("")}</div></div>`
    : "";

  const colophon = `<div class="colophon">
      ${edition.press ? `<div class="stats">${edition.press.split("·").map((x) => `<span>${esc(x.trim())}</span>`).join("")}</div>` : ""}
      ${edition.method ? `<p>${esc(edition.method)}</p>` : ""}
      ${sources}
      <div class="sig">
        ${edition.canonical_sha256 ? `<div>sha256 <span class="mono">${esc(edition.canonical_sha256)}</span></div>` : ""}
        ${edition.signature_ed25519_hex ? `<div>ed25519 signed · key <span class="mono">${esc((paper.signing_pubkey_hex ?? "").slice(0, 16))}…</span></div>` : ""}
        ${edition.zerone_anchor ? `<div>anchor <span class="mono">${esc(edition.zerone_anchor)}</span></div>` : ""}
      </div>
      <p class="foot">${esc(paper.name)} · ${esc(paper.motto ?? "")}<br>${esc(paper.masthead_credit ?? "")}</p>
    </div>`;

  return `<!doctype html>
<html lang="${esc(paper.lang ?? "en")}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(paper.name)}${edition.no != null ? ` · No.${esc(edition.no)}` : ""}</title>
<style>
  :root{
    --paper:${P.paper ?? "#f2ede1"}; --paper-2:${P.paper2 ?? "#eae3d2"}; --ink:${P.ink ?? "#1c1914"}; --ink-2:${P.ink2 ?? "#57503f"};
    --rule:${P.rule ?? "#c9bfa8"}; --rule-strong:${P.ruleStrong ?? "#1c1914"};
    --tq:${P.verified ?? "#008d76"}; --amber:${P.reported ?? "#9a6a1f"}; --red:${P.refuted ?? "#a63a2b"};
  }
  @media (prefers-color-scheme: dark){:root{
    --paper:${P.paperDark ?? "#16181c"}; --paper-2:${P.paper2Dark ?? "#1d2026"}; --ink:${P.inkDark ?? "#e8e2d4"}; --ink-2:${P.ink2Dark ?? "#b0a890"};
    --rule:${P.ruleDark ?? "#3a3e46"}; --rule-strong:${P.ruleStrongDark ?? "#e8e2d4"};
    --tq:${P.verifiedDark ?? "#2ba898"}; --amber:${P.reportedDark ?? "#b58433"}; --red:${P.refutedDark ?? "#d4634f"};
  }}
  :root[data-theme="dark"]{
    --paper:${P.paperDark ?? "#16181c"}; --paper-2:${P.paper2Dark ?? "#1d2026"}; --ink:${P.inkDark ?? "#e8e2d4"}; --ink-2:${P.ink2Dark ?? "#b0a890"};
    --rule:${P.ruleDark ?? "#3a3e46"}; --rule-strong:${P.ruleStrongDark ?? "#e8e2d4"};
    --tq:${P.verifiedDark ?? "#2ba898"}; --amber:${P.reportedDark ?? "#b58433"}; --red:${P.refutedDark ?? "#d4634f"};
  }
  :root[data-theme="light"]{
    --paper:${P.paper ?? "#f2ede1"}; --paper-2:${P.paper2 ?? "#eae3d2"}; --ink:${P.ink ?? "#1c1914"}; --ink-2:${P.ink2 ?? "#57503f"};
    --rule:${P.rule ?? "#c9bfa8"}; --rule-strong:${P.ruleStrong ?? "#1c1914"};
    --tq:${P.verified ?? "#008d76"}; --amber:${P.reported ?? "#9a6a1f"}; --red:${P.refuted ?? "#a63a2b"};
  }
  *{box-sizing:border-box}
  body{background:var(--paper);color:var(--ink);margin:0;padding:0 16px 64px;line-height:1.55;
    font-family:${P.serif ?? 'Charter,"Iowan Old Style",Georgia,"PingFang HK","Noto Serif HK",serif'}}
  .sheet{max-width:1040px;margin:0 auto}
  .mono{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-variant-numeric:tabular-nums}
  .label{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2)}
  header{padding:30px 0 0;text-align:center}
  h1.mast{margin:6px 0 2px;font-size:clamp(2.4rem,7vw,4.2rem);letter-spacing:.06em;font-weight:800;line-height:1.04}
  .mast-en{font-size:.8rem;letter-spacing:.4em;text-transform:uppercase;color:var(--ink-2)}
  .mast-motto{font-style:italic;font-size:.85rem;color:var(--ink-2);margin:10px 0 14px}
  .edrow{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:3px double var(--rule-strong);border-bottom:1px solid var(--rule-strong);padding:7px 2px;font-size:.74rem}
  .tierbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:10px 2px;font-size:.72rem;color:var(--ink-2)}
  .badge{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:.62rem;letter-spacing:.05em;padding:1px 7px 2px;border-radius:2px;vertical-align:1px;white-space:nowrap}
  .t-v{background:color-mix(in srgb,var(--tq) 12%,transparent);color:var(--tq);border:1px solid var(--tq)}
  .t-r{background:color-mix(in srgb,var(--amber) 14%,transparent);color:var(--amber);border:1px solid var(--amber)}
  .t-c{background:transparent;color:var(--ink-2);border:1px dashed var(--ink-2)}
  .t-x{background:color-mix(in srgb,var(--red) 12%,transparent);color:var(--red);border:1px solid var(--red);text-decoration:line-through}
  section{margin-top:32px}
  .kicker{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .kicker .label{color:var(--tq)}
  .kicker::after{content:"";flex:1;border-top:1px solid var(--rule)}
  h2{font-size:clamp(1.5rem,3.4vw,2.2rem);line-height:1.16;margin:.1em 0 .35em;text-wrap:balance;font-weight:800}
  h2.headline{font-size:clamp(1.7rem,4vw,2.5rem)}
  h3{font-size:1.1rem;margin:.3em 0 .4em;text-wrap:balance}
  p{margin:.55em 0;max-width:68ch}
  .dek{font-size:1.02rem;font-style:italic;color:var(--ink-2);max-width:62ch}
  .dateline{font-family:ui-monospace,Menlo,monospace;font-size:.7rem;letter-spacing:.08em;color:var(--tq);text-transform:uppercase}
  .lead .headline::first-letter{}
  a{color:var(--tq)}
  a.lens{font-family:ui-monospace,Menlo,monospace;font-size:.68rem;text-decoration:none;border-bottom:1px dotted var(--tq);white-space:nowrap}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:16px 0}
  .tile{border:1px solid var(--rule);background:var(--paper-2);padding:12px 14px}
  .tile .n{font-family:ui-monospace,Menlo,monospace;font-size:1.5rem;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
  .tile .n small{font-size:.85rem;font-weight:400}
  .tile .d{font-size:.72rem;color:var(--ink-2);margin-top:4px;line-height:1.4}
  .timeline{list-style:none;margin:12px 0 0;padding:0;border-left:2px solid var(--rule)}
  .timeline li{position:relative;padding:0 0 16px 20px;max-width:66ch}
  .timeline li::before{content:"";position:absolute;left:-6px;top:.42em;width:9px;height:9px;border-radius:50%;background:var(--paper);border:2px solid var(--tq)}
  .timeline li.hot::before{background:var(--red);border-color:var(--red)}
  .timeline .t-date{font-family:ui-monospace,Menlo,monospace;font-size:.72rem;color:var(--tq);letter-spacing:.06em}
  .timeline li.hot .t-date{color:var(--red)}
  .verdict{border:3px double var(--rule-strong);padding:18px 20px;margin-top:18px;background:var(--paper-2)}
  .verdict h3{margin:0 0 8px}
  .vline{display:flex;gap:10px;align-items:baseline;margin:8px 0;font-size:.92rem}
  .vword{font-family:ui-monospace,Menlo,monospace;font-weight:700;white-space:nowrap;font-size:.78rem;letter-spacing:.04em;color:var(--tq)}
  .table-wrap{overflow-x:auto;margin:14px 0}
  table{width:100%;border-collapse:collapse;font-size:.84rem}
  th{text-align:left;font-family:ui-monospace,Menlo,monospace;font-size:.64rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2);border-bottom:2px solid var(--rule-strong);padding:6px 10px 6px 0}
  td{border-bottom:1px solid var(--rule);padding:9px 10px 9px 0;vertical-align:top}
  .corrections{border:1px solid var(--red);background:color-mix(in srgb,var(--red) 8%,transparent);padding:14px 18px;margin-top:32px}
  .corrections h3{color:var(--red);margin-top:0}
  .corrections .dead{text-decoration:line-through;text-decoration-color:var(--red)}
  .colophon{margin-top:42px;border-top:3px double var(--rule-strong);padding-top:14px;font-size:.76rem;color:var(--ink-2)}
  .colophon .stats{display:flex;gap:18px;flex-wrap:wrap;font-family:ui-monospace,Menlo,monospace;font-size:.72rem;margin-bottom:12px}
  .colophon .sig{font-family:ui-monospace,Menlo,monospace;font-size:.66rem;margin:12px 0;line-height:1.7;word-break:break-all}
  .src-cols{columns:2;column-gap:30px;font-size:.72rem;line-height:1.7;margin-top:6px}
  @media (max-width:640px){.src-cols{columns:1}}
  .foot{margin-top:16px;text-align:center;font-style:italic}
  a:focus-visible{outline:2px solid var(--tq);outline-offset:2px}
</style>
</head>
<body>
<div class="sheet">
  <header>
    <h1 class="mast">${esc(paper.name)}</h1>
    ${paper.name_en ? `<div class="mast-en">${esc(paper.name_en)}</div>` : ""}
    ${paper.motto ? `<p class="mast-motto">${esc(paper.motto)}</p>` : ""}
    <div class="edrow">
      <span class="mono">${esc(edition.date ?? "")}${edition.label ? ` · ${esc(edition.label)}` : ""}</span>
      <span class="mono">${edition.no != null ? `No. ${esc(edition.no)}` : ""}${paper.editor ? ` · ${esc(paper.editor)}` : ""}</span>
    </div>
    <div class="tierbar"><strong>${esc(paper.tiers_label ?? "EVIDENCE TIERS")}:</strong> ${tierLegend}</div>
  </header>
  ${leadHtml}
  ${(edition.sections ?? []).map((s) => renderSection(s, ctx)).join("\n")}
  ${corrections}
  ${colophon}
</div>
</body>
</html>`;
}
