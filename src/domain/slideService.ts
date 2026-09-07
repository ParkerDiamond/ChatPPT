import { randomUUID } from "node:crypto";
import {
  addBlankSlide,
  addSlideTextBox,
  duplicateSlide,
  getSlides,
  inches,
  moveSlide,
  removeSlide,
  setSlideNotes,
  setSlideTitle,
  type SlideData,
} from "@office-kit/pptx";
import type { ElementRecord, SlideRecord } from "./models.js";
import { NotFoundError, ValidationError } from "./errors.js";
import { getRegistryStore } from "../storage/registry.js";
import { presentationStore } from "../storage/presentationStore.js";

const now = () => new Date().toISOString();

export type SlideCreateItem = {
  title?: string;
  notes?: string;
};

export type SlideUpdateItem = {
  slideId: string;
  title?: string;
  notes?: string;
};

export class SlideService {
  async create(args: {
    deckId: string;
    slides: SlideCreateItem[];
  }): Promise<{ created: Array<SlideRecord & { position: number }> }> {
    if (!args.slides || args.slides.length === 0) {
      throw new ValidationError("At least one slide definition must be provided");
    }

    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const presentation = await presentationStore.load(args.deckId);
    const created: Array<SlideRecord & { position: number }> = [];

    for (const item of args.slides) {
      const pptSlide = addBlankSlide(presentation);
      if (item.title) {
        try {
          setSlideTitle(pptSlide, item.title);
        } catch {
          addSlideTextBox(pptSlide, {
            x: inches(0.8),
            y: inches(0.5),
            w: inches(8.4),
            h: inches(1.0),
            text: item.title,
          });
        }
      }
      if (item.notes) {
        setSlideNotes(pptSlide, item.notes);
      }

      const slideRecord: SlideRecord = {
        id: randomUUID(),
        title: item.title,
        notes: item.notes,
        elements: [],
      };

      deck.slides.push(slideRecord);
      const position = deck.slides.length - 1;
      created.push({ ...slideRecord, position });
    }

    deck.revision += 1;
    deck.updatedAt = now();

    await presentationStore.save(args.deckId, presentation);
    await registryStore.write(registry);

    return { created };
  }

  async list(deckId: string): Promise<{ slides: Array<SlideRecord & { position: number }> }> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === deckId);
    if (!deck) throw new NotFoundError("deck", deckId);

    const slides = deck.slides.map((s, position) => ({ ...s, position }));
    return { slides };
  }

  async read(deckId: string, slideId: string): Promise<SlideRecord & { position: number }> {
    const { slides } = await this.list(deckId);
    const slide = slides.find((s) => s.id === slideId);
    if (!slide) throw new NotFoundError("slide", slideId);
    return slide;
  }

  async update(args: {
    deckId: string;
    updates: SlideUpdateItem[];
  }): Promise<{ updated: SlideRecord[] }> {
    if (!args.updates || args.updates.length === 0) {
      throw new ValidationError("At least one slide update must be provided");
    }

    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const presentation = await presentationStore.load(args.deckId);
    const pptSlides = getSlides(presentation);
    const updated: SlideRecord[] = [];

    for (const updateItem of args.updates) {
      const position = deck.slides.findIndex((s) => s.id === updateItem.slideId);
      if (position < 0) throw new NotFoundError("slide", updateItem.slideId);

      const slide = deck.slides[position]!;
      const pptSlide = pptSlides[position];

      if (updateItem.title !== undefined) {
        slide.title = updateItem.title;
        if (pptSlide) {
          try {
            setSlideTitle(pptSlide, updateItem.title);
          } catch {
            // fallback if title placeholder absent
          }
        }
      }

      if (updateItem.notes !== undefined) {
        slide.notes = updateItem.notes;
        if (pptSlide) setSlideNotes(pptSlide, updateItem.notes);
      }

      updated.push(slide);
    }

    deck.revision += 1;
    deck.updatedAt = now();

    await presentationStore.save(args.deckId, presentation);
    await registryStore.write(registry);

    return { updated };
  }

  async delete(args: {
    deckId: string;
    slideIds: string[];
  }): Promise<{ deleted: SlideRecord[] }> {
    if (!args.slideIds || args.slideIds.length === 0) {
      throw new ValidationError("At least one slide ID must be provided");
    }

    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const presentation = await presentationStore.load(args.deckId);
    const pptSlides = getSlides(presentation);
    const deleted: SlideRecord[] = [];
    const deleteSet = new Set(args.slideIds);

    // Filter and delete slides in reverse index order to preserve indexes
    const indicesToDelete = deck.slides
      .map((s, idx) => ({ id: s.id, idx }))
      .filter((item) => deleteSet.has(item.id))
      .sort((a, b) => b.idx - a.idx);

    if (indicesToDelete.length === 0) {
      throw new NotFoundError("slide", args.slideIds.join(", "));
    }

    for (const { id, idx } of indicesToDelete) {
      const slide = deck.slides[idx]!;
      const pptSlide = pptSlides[idx];
      if (pptSlide) {
        removeSlide(presentation, pptSlide);
      }
      deck.slides.splice(idx, 1);
      deleted.push(slide);

      // Clean up collection references
      for (const col of deck.collections ?? []) {
        col.slideIds = col.slideIds.filter((sId) => sId !== id);
      }
    }

    deck.revision += 1;
    deck.updatedAt = now();

    await presentationStore.save(args.deckId, presentation);
    await registryStore.write(registry);

    return { deleted };
  }

  async move(args: {
    deckId: string;
    slideOrder?: string[];
    slideId?: string;
    toPosition?: number;
  }): Promise<{ slides: Array<SlideRecord & { position: number }> }> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const presentation = await presentationStore.load(args.deckId);

    if (args.slideOrder) {
      if (args.slideOrder.length !== deck.slides.length) {
        throw new ValidationError("slideOrder length must match current slide count");
      }
      const newOrderSet = new Set(args.slideOrder);
      if (newOrderSet.size !== deck.slides.length) {
        throw new ValidationError("slideOrder must contain unique slide IDs");
      }

      // Reorder registry slides
      const slideMap = new Map(deck.slides.map((s) => [s.id, s]));
      const newSlides: SlideRecord[] = [];
      for (const sId of args.slideOrder) {
        const slide = slideMap.get(sId);
        if (!slide) throw new NotFoundError("slide", sId);
        newSlides.push(slide);
      }

      // Move slides in PPTX presentation to match slideOrder
      for (let i = 0; i < args.slideOrder.length; i++) {
        const targetId = args.slideOrder[i]!;
        const currentPptSlides = getSlides(presentation);
        const currentRegistryIds = deck.slides.map((s) => s.id);
        const currentIdx = currentRegistryIds.indexOf(targetId);
        if (currentIdx !== i && currentIdx >= 0) {
          const pptSlideToMove = currentPptSlides[currentIdx];
          if (pptSlideToMove) moveSlide(presentation, pptSlideToMove, i);
          const [moved] = deck.slides.splice(currentIdx, 1);
          if (moved) deck.slides.splice(i, 0, moved);
        }
      }
      deck.slides = newSlides;
    } else if (args.slideId !== undefined && args.toPosition !== undefined) {
      const currentIdx = deck.slides.findIndex((s) => s.id === args.slideId);
      if (currentIdx < 0) throw new NotFoundError("slide", args.slideId);

      const pptSlides = getSlides(presentation);
      const pptSlideToMove = pptSlides[currentIdx];
      const targetPos = Math.max(0, Math.min(args.toPosition, deck.slides.length - 1));

      if (pptSlideToMove) {
        moveSlide(presentation, pptSlideToMove, targetPos);
      }

      const [moved] = deck.slides.splice(currentIdx, 1);
      if (moved) deck.slides.splice(targetPos, 0, moved);
    } else {
      throw new ValidationError("Either slideOrder or slideId with toPosition must be provided");
    }

    deck.revision += 1;
    deck.updatedAt = now();

    await presentationStore.save(args.deckId, presentation);
    await registryStore.write(registry);

    return this.list(args.deckId);
  }

  async duplicate(args: {
    deckId: string;
    slideId: string;
    targetPosition?: number;
  }): Promise<{ duplicated: SlideRecord & { position: number } }> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const sourceIdx = deck.slides.findIndex((s) => s.id === args.slideId);
    if (sourceIdx < 0) throw new NotFoundError("slide", args.slideId);

    const sourceSlide = deck.slides[sourceIdx]!;
    const presentation = await presentationStore.load(args.deckId);
    const pptSlides = getSlides(presentation);
    const pptSourceSlide = pptSlides[sourceIdx];

    if (!pptSourceSlide) {
      throw new ValidationError("PPTX slide missing for source slide");
    }

    const dupPptSlide = duplicateSlide(presentation, pptSourceSlide);

    // Reassign new stable slide ID and new stable element IDs for all duplicated elements
    const newElements: ElementRecord[] = sourceSlide.elements.map((elem) => ({
      ...elem,
      id: randomUUID(),
      createdAt: now(),
      updatedAt: now(),
    }));

    const duplicatedRecord: SlideRecord = {
      id: randomUUID(),
      title: sourceSlide.title ? `${sourceSlide.title} (Copy)` : undefined,
      notes: sourceSlide.notes,
      elements: newElements,
    };

    const targetPos =
      args.targetPosition !== undefined
        ? Math.max(0, Math.min(args.targetPosition, deck.slides.length))
        : sourceIdx + 1;

    deck.slides.splice(targetPos, 0, duplicatedRecord);

    if (targetPos < deck.slides.length - 1) {
      moveSlide(presentation, dupPptSlide, targetPos);
    }

    deck.revision += 1;
    deck.updatedAt = now();

    await presentationStore.save(args.deckId, presentation);
    await registryStore.write(registry);

    return { duplicated: { ...duplicatedRecord, position: targetPos } };
  }
}

export const slideService = new SlideService();
