import { describe, expect, it } from "bun:test";
import { hex, hmacSha256, sha256 } from "./sha256.js";

/**
 * The synchronous SHA-256 (FIPS 180-4) and HMAC-SHA256 (RFC 2104) the default
 * evidence store signs with, checked against the published vectors: NIST's
 * SHA-256 examples and every HMAC-SHA256 case in RFC 4231.
 */

const utf8 = (s: string) => new TextEncoder().encode(s);
const fill = (n: number, byte: number) => new Uint8Array(n).fill(byte);
const bytes = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => Number.parseInt(b, 16));

describe("SHA-256 (FIPS 180-4, NIST vectors)", () => {
  it("the empty message", () => {
    expect(hex(sha256(utf8("")))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it('"abc"', () => {
    expect(hex(sha256(utf8("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("the 448-bit message (two blocks after padding)", () => {
    const m = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    expect(hex(sha256(utf8(m)))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it('one million "a"', () => {
    expect(hex(sha256(fill(1_000_000, 0x61)))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });
});

describe("HMAC-SHA256 (RFC 4231 test cases 1-7)", () => {
  const cases: Array<[string, Uint8Array, Uint8Array, string]> = [
    [
      "1",
      fill(20, 0x0b),
      utf8("Hi There"),
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    ],
    [
      "2: a key shorter than the output",
      utf8("Jefe"),
      utf8("what do ya want for nothing?"),
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    ],
    [
      "3: 50 bytes of 0xdd",
      fill(20, 0xaa),
      fill(50, 0xdd),
      "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
    ],
    [
      "4: a 25-byte key",
      bytes("0102030405060708090a0b0c0d0e0f10111213141516171819"),
      fill(50, 0xcd),
      "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b",
    ],
    [
      "6: a key larger than the block, hashed first",
      fill(131, 0xaa),
      utf8("Test Using Larger Than Block-Size Key - Hash Key First"),
      "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
    ],
    [
      "7: key and data both larger than the block",
      fill(131, 0xaa),
      utf8(
        "This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.",
      ),
      "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2",
    ],
  ];
  for (const [name, key, data, mac] of cases) {
    it(`case ${name}`, () => expect(hex(hmacSha256(key, data))).toBe(mac));
  }

  it("case 5: truncated to 128 bits", () => {
    const mac = hex(hmacSha256(fill(20, 0x0c), utf8("Test With Truncation")));
    expect(mac.slice(0, 32)).toBe("a3b6167473100ee06e0c796c2955552b");
  });
});
