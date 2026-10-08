import type { Piped, PipeStep } from "@command-kernel/core";
import { fileSubject } from "../../providers/files";
import { type WorkspaceFile, workspace } from "../../providers/workspace";

export interface PipePreset {
  id: string;
  from: Piped;
  steps: { label: string; step: PipeStep }[];
  /** what should happen, said before it runs */
  expect: string;
}

const file = (id: string): WorkspaceFile => {
  const f = workspace.find(id);
  if (!f) throw new Error(`${id} is not in the workspace`);
  return f;
};

const email = (args: Record<string, string>): PipeStep => ({
  path: [{ id: "email.send", args: { to: "jo@example.com", subject: "Next steps", ...args } }],
});

export const PRESETS: PipePreset[] = [
  {
    id: "seal",
    from: fileSubject(file("launch-notes.md")),
    expect: "a document becomes text, the text becomes ciphertext, the ciphertext becomes the body",
    steps: [
      { label: "Load as text", step: { path: [{ id: "files.read" }] } },
      {
        label: "Encrypt for Ada",
        step: { path: [{ id: "crypto.encrypt", args: { to: "ada@analytical.engine" } }] },
      },
      { label: "Send email", step: email({}) },
    ],
  },
  {
    id: "thumb",
    from: fileSubject(file("launch-teaser.mp4")),
    expect: "a media file makes an image, and an image is a file, so it goes in as an attachment",
    steps: [
      { label: "Make thumbnail", step: { path: [{ id: "media.thumbnail" }] } },
      { label: "Send email", step: email({ body: "Thumbnail attached." }) },
    ],
  },
  {
    id: "refused",
    from: fileSubject(file("q3-forecast.csv")),
    expect: "a document is not a media file: refused by the type check, before step 1 runs",
    steps: [
      { label: "Make thumbnail", step: { path: [{ id: "media.thumbnail" }] } },
      { label: "Send email", step: email({ body: "Thumbnail attached." }) },
    ],
  },
];
