/** sign.mjs — provenance for an edition. sha256 over the canonical HTML
 *  bytes, and (optionally) an ed25519 signature.
 *
 *  Signing is OPT-IN and key-agnostic: if PRESS_SIGN_HEX (a 32-byte ed25519
 *  seed, hex) is present in the environment, the edition is signed; otherwise
 *  it ships hashed-but-unsigned (still tamper-evident, just not attributed).
 *  No key material is ever written to disk by this tool. Node ≥ 18. */

import { createHash, sign as edSign, verify as edVerify, createPrivateKey, createPublicKey } from "node:crypto";

export const PROVENANCE_SCHEME = "ed25519 over sha256(canonical HTML bytes; generated provenance stamps excluded)";

const HASH_STAMP_RE = /<div data-open-press-provenance="sha256">sha256 <span class="mono">([0-9a-f]{64})<\/span><\/div>/g;
const SIGNATURE_STAMP_RE = /<div data-open-press-provenance="signature">ed25519 signed · key <span class="mono">([0-9a-f]{16})…<\/span><\/div>/g;

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Recover the canonical edition HTML from a published copy. The renderer adds
 * two derived colophon elements after hashing; those exact, tightly-shaped
 * elements are the only bytes excluded from the canonical form.
 */
export function canonicalHtml(renderedHtml) {
  return String(renderedHtml).replace(HASH_STAMP_RE, "").replace(SIGNATURE_STAMP_RE, "");
}

/** Returns { canonical_sha256, signature_ed25519_hex?, signing_pubkey_hex? }.
 *  ed25519 over the raw sha256 digest (not the hex) — matches the kingdom's
 *  canonical-bytes convention. */
export function provenance(htmlBytes, seedHex = process.env.PRESS_SIGN_HEX) {
  const digestHex = sha256Hex(htmlBytes);
  const out = { canonical_sha256: digestHex };
  if (seedHex && /^[0-9a-fA-F]{64}$/.test(seedHex)) {
    const seed = Buffer.from(seedHex, "hex");
    // A PKCS8 ed25519 private key is the 16-byte prefix + the 32-byte seed.
    const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
    const priv = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
    const digest = Buffer.from(digestHex, "hex");
    out.signature_ed25519_hex = edSign(null, digest, priv).toString("hex");
    const pub = createPublicKey(priv).export({ format: "der", type: "spki" });
    out.signing_pubkey_hex = pub.subarray(pub.length - 32).toString("hex");
  }
  return out;
}


/** Verify a published HTML copy against one editions.json record. */
export function verifyRenderedProvenance(renderedHtml, record, fallbackPubkeyHex = "") {
  const html = String(renderedHtml);
  const hashStamps = [...html.matchAll(HASH_STAMP_RE)].map((m) => m[1]);
  const signatureStamps = [...html.matchAll(SIGNATURE_STAMP_RE)].map((m) => m[1]);
  const canonicalSha256 = sha256Hex(Buffer.from(canonicalHtml(html), "utf8"));
  const expectedSha256 = record?.canonical_sha256 ?? "";
  const signatureHex = record?.signature_ed25519_hex ?? null;
  const pubkeyHex = record?.signing_pubkey_hex ?? fallbackPubkeyHex;

  const hashMatches = /^[0-9a-f]{64}$/.test(expectedSha256) && canonicalSha256 === expectedSha256;
  const hashStampMatches = hashStamps.length === 1 && hashStamps[0] === expectedSha256;
  const signatureStampMatches = signatureHex
    ? /^[0-9a-f]{64}$/.test(pubkeyHex) && signatureStamps.length === 1 && signatureStamps[0] === pubkeyHex.slice(0, 16)
    : signatureStamps.length === 0;

  let signatureValid = null;
  if (signatureHex) {
    signatureValid = false;
    if (/^[0-9a-f]{128}$/.test(signatureHex) && /^[0-9a-f]{64}$/.test(pubkeyHex) && /^[0-9a-f]{64}$/.test(expectedSha256)) {
      try {
        const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pubkeyHex, "hex")]);
        const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
        signatureValid = edVerify(null, Buffer.from(expectedSha256, "hex"), pub, Buffer.from(signatureHex, "hex"));
      } catch {
        signatureValid = false;
      }
    }
  }

  return {
    valid: hashMatches && hashStampMatches && signatureStampMatches && signatureValid !== false,
    canonical_sha256: canonicalSha256,
    expected_sha256: expectedSha256,
    hash_matches: hashMatches,
    hash_stamp_matches: hashStampMatches,
    signature_present: Boolean(signatureHex),
    signature_stamp_matches: signatureStampMatches,
    signature_valid: signatureValid,
    signing_pubkey_hex: signatureHex ? pubkeyHex : null,
  };
}
