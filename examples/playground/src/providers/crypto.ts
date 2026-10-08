import { argText, type CommandNode } from "@command-kernel/core";

/**
 * "Encrypt for…" - text in, ciphertext out, so it sits in the middle of a pipe:
 *
 *   [file] -> Load as text -> Encrypt for… -> Send email
 *
 * Real AES-256-GCM through WebCrypto, but the key is derived from the recipient's
 * address, so anyone who knows the address can decrypt: a demo of the PLUMBING,
 * not of key management. A real build would seal to the recipient's public key.
 */

const enc = new TextEncoder();

async function keyFor(recipient: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`ck-demo:${recipient}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export async function sealFor(recipient: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyFor(recipient),
    enc.encode(text),
  );
  const out = new Uint8Array(iv.length + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), iv.length);
  return `ck1.${base64(out)}`;
}

export const encryptText: CommandNode = {
  id: "crypto.encrypt",
  title: "Encrypt for…",
  subtitle: "text → ciphertext · AES-GCM",
  summary:
    "Encrypt text for one recipient (AES-256-GCM, demo key derived from their address) and hand the ciphertext on. Pipe text in; pipe the result into Send email.",
  category: "Actions",
  icon: "LockKeyhole",
  weight: 24,
  effect: "pure",
  args: [
    { id: "text", label: "text", kind: "text", required: true, placeholder: "text to seal…" },
    {
      id: "to",
      label: "for",
      kind: "entity",
      required: true,
      placeholder: "recipient…",
      entity: { type: "person", constraint: "with-email-address" },
    },
  ],
  output: { kind: "text", label: "ciphertext" },
  run: async (a) => {
    const sealed = await sealFor(argText(a.to), argText(a.text));
    return {
      kind: "data",
      message: `Encrypted for ${argText(a.to)} · ${sealed.slice(0, 18)}…`,
      value: sealed,
    };
  },
};
