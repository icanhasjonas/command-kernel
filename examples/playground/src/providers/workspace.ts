/**
 * The demo workspace: a handful of files of different SHAPES. Mutable, because a
 * command can make a new one (Make thumbnail adds an image).
 *
 *   file                       abstract - anything in the workspace
 *   ├─ document                text you can read (Load as text)
 *   └─ media-file              audio / video (Make thumbnail)
 *      └─ image                a picture is media too
 */

export type Shape = "document" | "media-file" | "image";

export interface WorkspaceFile {
  id: string;
  shape: Shape;
  size: string;
  /** what Load as text reads, for a document */
  contents?: string;
}

export const ICON: Record<Shape, string> = {
  document: "FileText",
  "media-file": "FileVideo",
  image: "FileImage",
};

const FILES: WorkspaceFile[] = [
  {
    id: "launch-notes.md",
    shape: "document",
    size: "1.2 KB",
    contents: "Launch is Thursday 10:00. Keep the pricing page dark until the press embargo lifts.",
  },
  {
    id: "q3-forecast.csv",
    shape: "document",
    size: "4.8 KB",
    contents: "month,signups,churn\njul,412,3.1\naug,498,2.8\nsep,566,2.6",
  },
  {
    id: "contract-draft.txt",
    shape: "document",
    size: "9.1 KB",
    contents: "Mutual NDA between Circle Surrogacy and Duplo. Term: 24 months from signature.",
  },
  {
    id: "recovery-codes.txt",
    shape: "document",
    size: "0.3 KB",
    contents: "7F3K-2LQ9  M8PD-4XWA  R2VN-6TYC  H9JB-1ZSE",
  },
  { id: "launch-teaser.mp4", shape: "media-file", size: "48 MB" },
  { id: "podcast-ep12.m4a", shape: "media-file", size: "31 MB" },
  { id: "cover.png", shape: "image", size: "820 KB" },
];

export const workspace = {
  all: (): readonly WorkspaceFile[] => FILES,
  find: (id: string) => FILES.find((f) => f.id === id),
  ofShape: (shape: Shape) => FILES.filter((f) => f.shape === shape),
  add(file: WorkspaceFile) {
    if (!FILES.some((f) => f.id === file.id)) FILES.push(file);
    return file;
  },
};
