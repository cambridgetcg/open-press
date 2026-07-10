import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { render } from "../lib/render.mjs";
import { canonicalHtml, provenance, verifyRenderedProvenance } from "../lib/sign.mjs";

const paper = {
  name: "Test Press",
  signing_pubkey_hex: "f".repeat(64),
  instrument_of_record: "https://captioneer.io",
};
const edition = {
  no: 1,
  date: "2026-07-10",
  lead: {
    headline: "Canonical provenance survives its own colophon",
    paragraphs: [{ text: "A visible claim.", tier: "verified" }],
  },
};
const seedHex = "42".repeat(32);
const pressCli = fileURLToPath(new URL("../press.mjs", import.meta.url));

function signedCopy() {
  const bare = render(paper, edition);
  const prov = provenance(Buffer.from(bare, "utf8"), seedHex);
  const html = render(paper, { ...edition, ...prov });
  return { bare, prov, html };
}

test("published provenance stamps round-trip to canonical HTML", () => {
  const { bare, prov, html } = signedCopy();
  assert.equal(canonicalHtml(html), bare);

  const result = verifyRenderedProvenance(html, { ...prov });
  assert.equal(result.valid, true);
  assert.equal(result.hash_matches, true);
  assert.equal(result.hash_stamp_matches, true);
  assert.equal(result.signature_valid, true);
  assert.match(html, new RegExp(`key <span class="mono">${prov.signing_pubkey_hex.slice(0, 16)}…`));
  assert.doesNotMatch(html, /ffffffffffffffff…/);
});

test("body tampering fails canonical hash verification", () => {
  const { prov, html } = signedCopy();
  const tampered = html.replace("A visible claim.", "A changed claim.");
  const result = verifyRenderedProvenance(tampered, { ...prov });
  assert.equal(result.valid, false);
  assert.equal(result.hash_matches, false);
});

test("colophon tampering fails even when canonical content is intact", () => {
  const { prov, html } = signedCopy();
  const tampered = html.replace(prov.canonical_sha256, "0".repeat(64));
  const result = verifyRenderedProvenance(tampered, { ...prov });
  assert.equal(result.valid, false);
  assert.equal(result.hash_matches, true);
  assert.equal(result.hash_stamp_matches, false);
});

test("CLI builds and verifies a signed archive with an entry-scoped key", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "open-press-provenance-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paperPath = join(dir, "press.config.json");
  const editionPath = join(dir, "edition.json");
  const outdir = join(dir, "archive");
  const manifestPath = join(dir, "editions.json");
  const htmlPath = join(outdir, "2026-07-10-no1.html");
  writeFileSync(paperPath, JSON.stringify(paper));
  writeFileSync(editionPath, JSON.stringify(edition));

  const built = spawnSync(process.execPath, [pressCli, "build", editionPath, "--paper", paperPath, "--outdir", outdir], {
    encoding: "utf8",
    env: { ...process.env, PRESS_SIGN_HEX: seedHex },
  });
  assert.equal(built.status, 0, built.stderr);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.editions[0].signing_pubkey_hex.length, 64);
  assert.match(manifest.signing_key.scheme, /canonical HTML bytes/);

  const verified = spawnSync(process.execPath, [pressCli, "verify", htmlPath], { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  assert.match(verified.stdout, /^VERIFIED /);

  writeFileSync(htmlPath, readFileSync(htmlPath, "utf8").replace("A visible claim.", "A changed claim."));
  const rejected = spawnSync(process.execPath, [pressCli, "verify", htmlPath], { encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stdout, /^FAILED /);
});
