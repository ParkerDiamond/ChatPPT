import { randomUUID } from "node:crypto";
import type { DeckRecord } from "./models.js";
import { NotFoundError, ConflictError } from "./errors.js";
import { validateDeckInvariants, type DiagnosticIssue } from "./invariants.js";
import { getRegistryStore } from "../storage/registry.js";
import { presentationStore } from "../storage/presentationStore.js";

const now = () => new Date().toISOString();

export class DeckService {
  async create(args: { title?: string }): Promise<DeckRecord> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();

    const id = randomUUID();
    const createdAt = now();
    const deck: DeckRecord = {
      id,
      title: args.title,
      fileName: `${id}.pptx`,
      revision: 1,
      slides: [],
      collections: [],
      createdAt,
      updatedAt: createdAt,
    };

    await presentationStore.createNew(id);
    registry.decks.push(deck);
    await registryStore.write(registry);

    return deck;
  }

  async list(): Promise<DeckRecord[]> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    return registry.decks;
  }

  async read(deckId: string): Promise<DeckRecord> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === deckId);
    if (!deck) throw new NotFoundError("deck", deckId);
    return deck;
  }

  async update(args: { deckId: string; title: string; expectedRevision?: number }): Promise<DeckRecord> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    if (args.expectedRevision !== undefined && deck.revision !== args.expectedRevision) {
      throw new ConflictError(
        `Revision conflict: expected revision ${args.expectedRevision} but current revision is ${deck.revision}`
      );
    }

    deck.title = args.title;
    deck.revision += 1;
    deck.updatedAt = now();

    await registryStore.write(registry);
    return deck;
  }

  async delete(deckId: string): Promise<DeckRecord> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const index = registry.decks.findIndex((d) => d.id === deckId);
    if (index < 0) throw new NotFoundError("deck", deckId);

    const [deleted] = registry.decks.splice(index, 1);
    await presentationStore.delete(deckId);
    await registryStore.write(registry);

    return deleted!;
  }

  async validate(deckId: string): Promise<{ valid: boolean; revision: number; issues: DiagnosticIssue[] }> {
    const deck = await this.read(deckId);
    let presentation;
    try {
      presentation = await presentationStore.load(deckId);
    } catch {
      // pptx store load error
    }

    const issues = validateDeckInvariants(deck, presentation);
    const valid = !issues.some((issue) => issue.severity === "error");

    return { valid, revision: deck.revision, issues };
  }
}

export const deckService = new DeckService();
