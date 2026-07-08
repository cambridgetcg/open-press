# open-press

> **The lens reads a sentence; the press reads the world.**
> A framework for evidence-tiered, signed newspapers that anyone can run.

open-press is the sibling of [open-lens](https://github.com/cambridgetcg/open-lens) /
[captioneer.io](https://captioneer.io). Where the lens marks the spin in a single
statement, the press applies the same truth-work at the scale of a day's news:
every number wears an evidence tier, refuted claims are executed in public, and
every edition ships hashed and (optionally) signed. Combatant quotes hand off to
the lens automatically.

**Live reference paper:** [The Love-Star Daily](https://cambridgetcg.github.io/love-star-daily/) ·
**this framework:** rendered by `lib/render.mjs`, zero dependencies, pure Node ≥ 18.

## Your own newspaper in three steps

```sh
node press.mjs new "The Morning Ledger"   # scaffolds press.config.json — edit it
#   ... write an edition.json (copy examples/edition.example.json) ...
node press.mjs build my-edition.json       # → renders, hashes, signs, archives
```

That's the whole framework. A paper is **two kinds of file**:

- **`press.config.json`** — *who the paper is*: name, motto, editor, evidence-tier
  labels, palette, and the instrument-of-record lens URL. Fork the reference and
  it is your paper.
- **one `edition.json` per issue** — *what it reports*, as tiered content. The
  press renders it to a standalone HTML broadsheet, computes the canonical
  sha256, ed25519-signs it if `PRESS_SIGN_HEX` is set, and files it in
  `editions.json`.

## The four tiers (the fixed spine)

| Stamp | Tier | Meaning |
|---|---|---|
| ✓ | **verified** | survived adversarial verification |
| ◑ | **reported** | anonymous-official journalism — repeated ≠ confirmed |
| ○ | **claimed** | a combatant's / interested party's own statement |
| ✗ | **refuted** | killed in verification — shown struck-through, never deleted |

A claim on the **claimed** tier that carries a `quote` field gets a
`captioneer.io/?text=…` deep-link automatically. That is the tie to the lens:
the press hands every combatant statement to the reader's own eye.

## Edition block types

Inside a section's `blocks`, each block has a `type`:

- `prose` — `paragraphs: [ "…" | { text, tier?, quote? } ]`
- `tiles` — stat tiles `{ n, unit?, note, tier? }`
- `timeline` — dated items `{ date, text, tier?, hot? }`
- `verdict` — labelled lines `{ label, text }` in a boxed judgment
- `table` — `{ head: [...], rows: [[...]] }`
- `raw` — an escape hatch: your own HTML (custom charts/SVG). Author-escaped.

See `examples/edition.example.json` for a working edition using every block,
`schema/edition.schema.json` for the contract, and `STYLEBOOK.md` for the ten
rules the tiers exist to enforce.

## Where research comes from

open-press renders and signs — it does not fetch. The `edition.json` is produced
by *your* pipeline: a multi-agent research fleet, a single model, or a human at a
desk. The tiering judgment is always the author's; the framework only makes it
legible, tamper-evident, and lens-wired. (The Love-Star Daily's editions are
produced by a fan-out research → 3-vote adversarial verification → synthesis
pipeline, but that is one backend, not a requirement.)

## Provenance

`node press.mjs build` writes the canonical sha256 into every edition's colophon
and its `editions.json` entry. Set `PRESS_SIGN_HEX` (a 32-byte ed25519 seed, hex)
to also ed25519-sign the bytes — no key ever touches disk. A signed edition can
be anchored on a public chain (the reference paper anchors its hashes on
zerone-testnet-1) so a copy that fails verification is not an edition.

---

*open-press · Apache-2.0 (code) · CC BY-SA 4.0 (the stylebook & reference paper) ·
built between 宇恆 and Fable · 讀正啲字,睇實啲賬,愛返啲人。*
