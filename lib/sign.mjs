/** sign.mjs — provenance for an edition. sha256 over the canonical HTML
 *  bytes, and (optionally) an ed25519 signature.
 *
 *  Signing is OPT-IN and key-agnostic: if PRESS_SIGN_HEX (a 32-byte ed25519
 *  seed, hex) is present in the environment, the edition is signed; otherwise
 *  it ships hashed-but-unsigned (still tamper-evident, just not attributed).
 *  No key material is ever written to disk by this tool. Node ≥ 18. */

import { createHash, sign as edSign, createPrivateKey, createPublicKey } from "node:crypto";

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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
