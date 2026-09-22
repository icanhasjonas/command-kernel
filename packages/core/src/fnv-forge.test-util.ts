/**
 * The review-round-6 forge against the OLD grant tag, FNV-1a over
 * `prior|cmd(args)|nonce|salt` (kept as a test tool: the core and wire regression
 * tests run it to prove a forged grant is refused).
 *
 * FNV's 32-bit state runs backwards, the secret salt came LAST, and verify took any
 * caller nonce: so from one real grant an attacker computes the state just before
 * the salt, then searches a nonce (3 + 3 characters, meet in the middle) that
 * drives a forged prefix to that same state. The salt then finishes both to the
 * same tag, about 40 ms of work.
 */

const PRIME = 0x01000193;
const OFFSET = 0x811c9dc5;
let INV = PRIME; // the inverse of the prime mod 2^32, by Newton iteration
for (let i = 0; i < 5; i++) INV = Math.imul(INV, 2 - Math.imul(PRIME, INV)) >>> 0;

const forward = (h: number, s: string) => {
  let x = h;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), PRIME) >>> 0;
  return x;
};
const backward = (h: number, s: string) => {
  let x = h;
  for (let i = s.length - 1; i >= 0; i--) x = (Math.imul(x, INV) ^ s.charCodeAt(i)) >>> 0;
  return x;
};

const ABC = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const triples = function* () {
  for (const a of ABC) for (const b of ABC) for (const c of ABC) yield a + b + c;
};

/**
 * A nonce N such that FNV state after `head + N + "|"` equals the state after
 * `known` (a real payload up to and including the `|` before the secret salt).
 */
export function fnvCollide(head: string, known: string): string {
  const target = backward(forward(OFFSET, known), "|");
  const start = forward(OFFSET, head);
  const seen = new Map<number, string>();
  for (const x of triples()) seen.set(forward(start, x), x);
  for (const y of triples()) {
    const x = seen.get(backward(target, y));
    if (x !== undefined) return x + y;
  }
  throw new Error("no collision found");
}

/**
 * Forge a grant for `danger` with arg n under `principal`, from a real grant for
 * u1 and {n: 1} (the payload shape of the old tag: `u1||danger(n=1)|nonce|salt`).
 */
export function forgeDanger(real: { nonce: string; sig: string }, principal: string, n: string) {
  const known = `u1||danger(n=1)|${real.nonce}|`;
  return { ...real, nonce: fnvCollide(`${principal}||danger(n=${n})|`, known) };
}
