/**
 * SHA-256 (FIPS 180-4) and HMAC-SHA256 (RFC 2104), synchronous and dependency-free.
 *
 * The evidence store signs grants on synchronous paths (`kernel.grantFor`, the
 * palette's confirm, `executeNode`'s verify), so `crypto.subtle` (async only) cannot
 * serve it. This is the textbook algorithm, checked against the NIST SHA-256
 * vectors and every RFC 4231 HMAC-SHA256 case (sha256.test.ts). It touches no
 * runtime global, so it runs the same in a browser, Bun and a Cloudflare Worker.
 */

const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H0 = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];
const BLOCK = 64;

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
/** A word of a typed array (the index is always in range; this only satisfies the checker). */
const at = (a: Uint32Array, i: number) => a[i] ?? 0;

/** The SHA-256 digest of `message` (32 bytes). */
export function sha256(message: Uint8Array): Uint8Array {
  const len = message.length;
  // the message, a 1 bit, zeros, then its length in bits as a 64-bit big-endian number
  const padded = new Uint8Array(Math.ceil((len + 9) / BLOCK) * BLOCK);
  padded.set(message);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  view.setUint32(padded.length - 4, (len * 8) >>> 0);

  const H = Uint32Array.from(H0);
  const W = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += BLOCK) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const w15 = at(W, t - 15);
      const w2 = at(W, t - 2);
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      W[t] = (at(W, t - 16) + s0 + at(W, t - 7) + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at(H, i)) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + at(K, t) + at(W, t)) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((x, i) => {
      H[i] = (at(H, i) + x) | 0;
    });
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, at(H, i));
  return out;
}

/** HMAC-SHA256 of `message` under `key` (RFC 2104): H((K ^ opad) || H((K ^ ipad) || m)). */
export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const k = new Uint8Array(BLOCK);
  k.set(key.length > BLOCK ? sha256(key) : key);
  const inner = new Uint8Array(BLOCK + message.length);
  const outer = new Uint8Array(BLOCK + 32);
  for (let i = 0; i < BLOCK; i++) {
    const b = k[i] ?? 0;
    inner[i] = b ^ 0x36;
    outer[i] = b ^ 0x5c;
  }
  inner.set(message, BLOCK);
  outer.set(sha256(inner), BLOCK);
  return sha256(outer);
}

/** Lowercase hex of some bytes. */
export function hex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/**
 * UTF-8 bytes of a string, without TextEncoder (not every host's types declare it).
 * A lone surrogate is written as U+FFFD, as TextEncoder does; callers that sign
 * text pass it through JSON.stringify first, which escapes lone surrogates, so
 * two different strings never reach here as the same bytes.
 */
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0) ?? 0xfffd;
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
