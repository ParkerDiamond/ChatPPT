import { randomUUID } from "node:crypto";
import type { SlideCollection } from "./models.js";
import { NotFoundError, ValidationError } from "./errors.js";
import { getRegistryStore } from "../storage/registry.js";

const now = () => new Date().toISOString();

export class CollectionService {
  async create(args: {
    deckId: string;
    name: string;
    description?: string;
    slideIds?: string[];
  }): Promise<SlideCollection> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const slideIds = args.slideIds ?? [];
    if (new Set(slideIds).size !== slideIds.length) {
      throw new ValidationError("slideIds must contain unique values");
    }

    // Verify all slideIds exist in deck
    const validSlideIds = new Set(deck.slides.map((s) => s.id));
    for (const sId of slideIds) {
      if (!validSlideIds.has(sId)) {
        throw new ValidationError(`Slide '${sId}' does not exist in deck '${args.deckId}'`);
      }
    }

    const collection: SlideCollection = {
      id: randomUUID(),
      name: args.name,
      description: args.description,
      slideIds,
    };

    deck.collections = deck.collections ?? [];
    deck.collections.push(collection);
    deck.revision += 1;
    deck.updatedAt = now();

    await registryStore.write(registry);
    return collection;
  }

  async list(deckId: string): Promise<SlideCollection[]> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === deckId);
    if (!deck) throw new NotFoundError("deck", deckId);
    return deck.collections ?? [];
  }

  async read(deckId: string, slideCollectionId: string): Promise<SlideCollection> {
    const collections = await this.list(deckId);
    const collection = collections.find((c) => c.id === slideCollectionId);
    if (!collection) throw new NotFoundError("slide collection", slideCollectionId);
    return collection;
  }

  async update(args: {
    deckId: string;
    slideCollectionId: string;
    name?: string;
    description?: string;
    slideIds?: string[];
  }): Promise<SlideCollection> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const collection = (deck.collections ?? []).find((c) => c.id === args.slideCollectionId);
    if (!collection) throw new NotFoundError("slide collection", args.slideCollectionId);

    if (args.slideIds) {
      if (new Set(args.slideIds).size !== args.slideIds.length) {
        throw new ValidationError("slideIds must contain unique values");
      }
      const validSlideIds = new Set(deck.slides.map((s) => s.id));
      for (const sId of args.slideIds) {
        if (!validSlideIds.has(sId)) {
          throw new ValidationError(`Slide '${sId}' does not exist in deck '${args.deckId}'`);
        }
      }
      collection.slideIds = args.slideIds;
    }

    if (args.name !== undefined) collection.name = args.name;
    if (args.description !== undefined) collection.description = args.description;

    deck.revision += 1;
    deck.updatedAt = now();

    await registryStore.write(registry);
    return collection;
  }

  async delete(deckId: string, slideCollectionId: string): Promise<SlideCollection> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === deckId);
    if (!deck) throw new NotFoundError("deck", deckId);

    const collections = deck.collections ?? [];
    const index = collections.findIndex((c) => c.id === slideCollectionId);
    if (index < 0) throw new NotFoundError("slide collection", slideCollectionId);

    const [deleted] = collections.splice(index, 1);
    deck.revision += 1;
    deck.updatedAt = now();

    await registryStore.write(registry);
    return deleted!;
  }
}

export const collectionService = new CollectionService();
