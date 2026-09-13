import { getSlides } from "@office-kit/pptx";
import { renderSlideToImage } from "@office-kit/pptx-preview/node";
import { NotFoundError, ValidationError } from "./errors.js";
import { getRegistryStore } from "../storage/registry.js";
import { presentationStore } from "../storage/presentationStore.js";

export class SlideRenderService {
  async render(args: {
    deckId: string;
    slideId: string;
    width?: number;
  }): Promise<{ data: string; mimeType: "image/png"; width: number }> {
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

    const width = args.width ?? 1280;
    const png = renderSlideToImage(presentation, slide, { width });

    return {
      data: Buffer.from(png).toString("base64"),
      mimeType: "image/png",
      width,
    };
  }
}

export const slideRenderService = new SlideRenderService();