import { argText, type CommandNode } from "@command-kernel/core";
import { workspace } from "./workspace";

/**
 * "Make thumbnail" - takes a `media-file` (so a video or an image, never a
 * document) and makes an `image`. The image is a new value in the pipe, and since
 * an image IS a file it flows on into anything that takes a file:
 *
 *   [launch-teaser.mp4] -> Make thumbnail -> Send email (attachments)
 */
export const makeThumbnail: CommandNode = {
  id: "media.thumbnail",
  title: "Make thumbnail",
  subtitle: "media-file → image",
  summary:
    "Render a 640px thumbnail of a video or image and add it to the workspace. Takes media files only; hands the new image on, so it can be attached to an email.",
  category: "Files",
  icon: "ImagePlus",
  weight: 26,
  // adds a file to the workspace: a write, though not one worth a confirm
  effect: "writes",
  args: [
    {
      id: "media",
      label: "media",
      kind: "entity",
      required: true,
      placeholder: "which video or image…",
      entity: { type: "media-file" },
    },
  ],
  output: { kind: "entity", entity: { type: "image" }, label: "thumbnail" },
  run: async (a) => {
    const source = argText(a.media);
    const id = `${source.replace(/\.[^.]+$/, "")}.thumb.png`;
    workspace.add({ id, shape: "image", size: "64 KB" });
    return { kind: "data", message: `Thumbnail ready · ${id}`, value: id };
  },
};
