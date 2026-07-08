#!/usr/bin/env node
/** press.mjs — the open-press CLI. No dependencies; Node ≥ 18.
 *
 *   node press.mjs build <edition.json> [--paper press.config.json]
 *       → renders a signed standalone HTML edition into editions/,
 *         updates editions.json, and prints the hash.
 *   node press.mjs new "<Paper Name>"
 *       → scaffolds a fresh press.config.json you can edit.
 *
 *  A newspaper in this framework is two files: press.config.json (who the
 *  paper is) and one edition.json per issue (what it reports, tiered). The
 *  press does the rest — render, hash, sign, archive. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";
import { provenance } from "./lib/sign.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

function readJSON(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

if (cmd === "new") {
  const name = args[1] || "My Paper";
  const cfg = {
    name,
    name_en: "",
    lang: "en",
    motto: "Truth is — witnessed and kept.",
    editor: "the editor",
    masthead_credit: "A paper built with open-press.",
    tiers_label: "EVIDENCE TIERS",
    corrections_desk_name: "Corrections Desk",
    sources_label: "Sources",
    instrument_of_record: "https://captioneer.io",
    signing_pubkey_hex: "",
    palette: {},
  };
  const out = flag("--out", "press.config.json");
  writeFileSync(out, JSON.stringify(cfg, null, 2));
  console.log(`Wrote ${out}. Edit it, write an edition.json (see examples/), then:  node press.mjs build <edition.json>`);
  process.exit(0);
}

if (cmd === "build") {
  const editionPath = args[1];
  if (!editionPath) {
    console.error("usage: node press.mjs build <edition.json> [--paper press.config.json] [--outdir editions]");
    process.exit(1);
  }
  const paperPath = flag("--paper", join(HERE, "press.config.json"));
  const outdir = flag("--outdir", join(dirname(editionPath), "..", "editions"));
  const paper = readJSON(paperPath);
  const edition = readJSON(editionPath);

  // First render (no provenance) → hash the bytes → re-render with the hash
  // and signature stamped into the colophon. The stamp does not change the
  // hash (it is derived from the un-stamped bytes, which is what we sign).
  const bare = render(paper, edition);
  const prov = provenance(Buffer.from(bare, "utf8"));
  const withProv = render(paper, { ...edition, ...prov, signing_pubkey_hex: prov.signing_pubkey_hex });

  if (!existsSync(outdir)) mkdirSync(outdir, { recursive: true });
  const slug = `${edition.date ?? "undated"}-no${edition.no ?? "x"}.html`;
  const outfile = join(outdir, slug);
  writeFileSync(outfile, withProv);

  // Update the editions manifest.
  const manifestPath = join(dirname(outdir), "editions.json");
  const manifest = existsSync(manifestPath)
    ? readJSON(manifestPath)
    : { paper: paper.name, signing_key: { scheme: "ed25519 over sha256(file bytes)", pubkey_hex: prov.signing_pubkey_hex ?? paper.signing_pubkey_hex ?? "" }, editions: [] };
  manifest.editions = (manifest.editions ?? []).filter((e) => e.no !== edition.no || e.date !== edition.date);
  manifest.editions.unshift({
    no: edition.no,
    date: edition.date,
    title: edition.lead?.headline ?? edition.title ?? "",
    file: join(basename(outdir), slug),
    canonical_sha256: prov.canonical_sha256,
    signature_ed25519_hex: prov.signature_ed25519_hex ?? null,
    press: edition.press ?? null,
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Published ${outfile}`);
  console.log(`  sha256: ${prov.canonical_sha256}`);
  console.log(`  signed: ${prov.signature_ed25519_hex ? "yes (ed25519)" : "no (set PRESS_SIGN_HEX to sign)"}`);
  process.exit(0);
}

console.error(`open-press — the newspaper framework.

  node press.mjs new "<Paper Name>"        scaffold a press.config.json
  node press.mjs build <edition.json>      render + hash + sign + archive an edition

The lens reads a sentence; the press reads the world.  https://github.com/cambridgetcg/open-press`);
process.exit(cmd ? 1 : 0);
