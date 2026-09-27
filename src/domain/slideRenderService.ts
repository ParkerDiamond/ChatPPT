import { lstat, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { getSlides } from "@office-kit/pptx";
import { renderSlideToImage } from "@office-kit/pptx-preview/node";
import { NotFoundError, ValidationError } from "./errors.js";
import { ensureSubpath, getRegistryStore, getWorkspaceRoot } from "../storage/registry.js";
import { presentationStore } from "../storage/presentationStore.js";

export class SlideRenderService {
  async render(args: {
    deckId: string;
    slideId: string;
    width?: number;
    resolution?: number;
    filePath?: string;
  }): Promise<{ data: string; mimeType: "image/png"; width: number; filePath?: string }> {
    const registry = await getRegistryStore().read();
    const deck = registry.decks.find((candidate) => candidate.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const position = deck.slides.findIndex((slide) => slide.id === args.slideId);
    if (position < 0) throw new NotFoundError("slide", args.slideId);

    const presentation = await presentationStore.load(args.deckId);
    const slide = getSlides(presentation)[position];
    if (!slide) {
      throw new ValidationError("Slide metadata and presentation content are out of sync", {
        deckId: args.deckId,
        slideId: args.slideId,
      });
    }

    const width = args.resolution ?? args.width ?? 1280;
    const png = renderSlideToImage(presentation, slide, { width });
    let outputPath: string | undefined;

    if (args.filePath) {
      const extension = extname(args.filePath);
      const requestedPath = extension
        ? `${args.filePath.slice(0, -extension.length)}.png`
        : `${args.filePath}.png`;
      const workspaceRoot = resolve(getWorkspaceRoot());
      const candidatePath = ensureSubpath(
        workspaceRoot,
        isAbsolute(requestedPath) ? requestedPath : join(workspaceRoot, requestedPath),
        "Render output path"
      );
      const realWorkspaceRoot = await realpath(workspaceRoot);
      const realParent = await realpath(dirname(candidatePath));
      ensureSubpath(realWorkspaceRoot, realParent, "Render output path");
      outputPath = join(realParent, basename(candidatePath));

      const targetInfo = await lstat(outputPath).catch(() => undefined);
      if (targetInfo?.isSymbolicLink()) {
        throw new ValidationError("Render output path must not be a symbolic link");
      }
      await writeFile(outputPath, png);
    }

    return {
      data: Buffer.from(png).toString("base64"),
      mimeType: "image/png",
      width,
      filePath: outputPath,
    };
  }
}

export const slideRenderService = new SlideRenderService();