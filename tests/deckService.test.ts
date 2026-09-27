import { describe, expect, it } from "vitest";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { addBlankSlide, createPresentation, getSlides, setSlideNotes } from "@office-kit/pptx";
import { savePresentationToFile } from "@office-kit/pptx/node";
import "./testHelper.js";
import { deckService } from "../src/domain/deckService.js";
import { ConflictError, NotFoundError } from "../src/domain/errors.js";
import { presentationStore } from "../src/storage/presentationStore.js";
import { testWorkspaceDir } from "./testHelper.js";

describe("DeckService", () => {
  it("should import a presentation and register its slides", async () => {
    const sourcePath = join(testWorkspaceDir, "Quarterly Review.pptx");
    const presentation = createPresentation();
    const slide = addBlankSlide(presentation);
    setSlideNotes(slide, "Discuss the quarterly trend");
    await mkdir(testWorkspaceDir, { recursive: true });
    await savePresentationToFile(presentation, sourcePath);

    const deck = await deckService.import({ filePath: sourcePath });

    expect(deck.title).toBe("Quarterly Review");
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]).toMatchObject({ notes: "Discuss the quarterly trend" });
    const managedPresentation = await presentationStore.load(deck.id);
    expect(getSlides(managedPresentation)).toHaveLength(1);
    expect((await deckService.list()).map(({ id }) => id)).toContain(deck.id);
  });

  it("should create, list, and read a new deck", async () => {
    const deck = await deckService.create({ title: "My Sales Pitch" });
    expect(deck.id).toBeDefined();
    expect(deck.title).toBe("My Sales Pitch");
    expect(deck.revision).toBe(1);

    const decks = await deckService.list();
    expect(decks.length).toBe(1);
    expect(decks[0]!.id).toBe(deck.id);

    const readDeck = await deckService.read(deck.id);
    expect(readDeck.title).toBe("My Sales Pitch");
  });

  it("should update a deck title and increment revision", async () => {
    const deck = await deckService.create({ title: "Initial Title" });
    const updated = await deckService.update({
      deckId: deck.id,
      title: "Updated Title",
      expectedRevision: 1,
    });

    expect(updated.title).toBe("Updated Title");
    expect(updated.revision).toBe(2);
  });

  it("should throw ConflictError on revision mismatch", async () => {
    const deck = await deckService.create({ title: "Initial Title" });
    await expect(
      deckService.update({
        deckId: deck.id,
        title: "Conflicting Update",
        expectedRevision: 99,
      })
    ).rejects.toThrow(ConflictError);
  });

  it("should validate deck and return clean diagnostics", async () => {
    const deck = await deckService.create({ title: "Valid Deck" });
    const validation = await deckService.validate(deck.id);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("should delete a deck", async () => {
    const deck = await deckService.create({ title: "To Delete" });
    const deleted = await deckService.delete(deck.id);
    expect(deleted.id).toBe(deck.id);

    await expect(deckService.read(deck.id)).rejects.toThrow(NotFoundError);
  });
});
