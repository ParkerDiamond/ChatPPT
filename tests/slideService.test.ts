import { describe, expect, it } from "vitest";
import "./testHelper.js";
import { deckService } from "../src/domain/deckService.js";
import { slideService } from "../src/domain/slideService.js";
import { collectionService } from "../src/domain/collectionService.js";

describe("SlideService", () => {
  it("should create slides in batch", async () => {
    const deck = await deckService.create({ title: "Slide Deck" });
    const result = await slideService.create({
      deckId: deck.id,
      slides: [
        { title: "Intro Slide", notes: "Welcome everyone" },
        { title: "Agenda Slide", notes: "3 main items" },
      ],
    });

    expect(result.created.length).toBe(2);
    expect(result.created[0]!.title).toBe("Intro Slide");
    expect(result.created[0]!.position).toBe(0);
    expect(result.created[1]!.title).toBe("Agenda Slide");
    expect(result.created[1]!.position).toBe(1);

    const slideList = await slideService.list(deck.id);
    expect(slideList.slides.length).toBe(2);
  });

  it("should update slides in batch", async () => {
    const deck = await deckService.create({ title: "Slide Deck" });
    const created = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Old Title" }],
    });
    const slideId = created.created[0]!.id;

    const updated = await slideService.update({
      deckId: deck.id,
      updates: [{ slideId, title: "New Title", notes: "Updated notes" }],
    });

    expect(updated.updated[0]!.title).toBe("New Title");
    expect(updated.updated[0]!.notes).toBe("Updated notes");
  });

  it("should move slides by slideOrder", async () => {
    const deck = await deckService.create({ title: "Slide Deck" });
    const created = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "First" }, { title: "Second" }, { title: "Third" }],
    });

    const ids = created.created.map((s) => s.id); // [id0, id1, id2]
    const newOrder = [ids[2]!, ids[0]!, ids[1]!];

    const moved = await slideService.move({
      deckId: deck.id,
      slideOrder: newOrder,
    });

    expect(moved.slides[0]!.id).toBe(ids[2]);
    expect(moved.slides[1]!.id).toBe(ids[0]);
    expect(moved.slides[2]!.id).toBe(ids[1]);
  });

  it("should duplicate a slide with new stable IDs", async () => {
    const deck = await deckService.create({ title: "Slide Deck" });
    const created = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Original Slide" }],
    });
    const origId = created.created[0]!.id;

    const dupResult = await slideService.duplicate({
      deckId: deck.id,
      slideId: origId,
    });

    expect(dupResult.duplicated.id).not.toBe(origId);
    expect(dupResult.duplicated.title).toBe("Original Slide (Copy)");

    const list = await slideService.list(deck.id);
    expect(list.slides.length).toBe(2);
  });

  it("should delete slide and clean up collection references", async () => {
    const deck = await deckService.create({ title: "Slide Deck" });
    const created = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }, { title: "Slide 2" }],
    });
    const s1Id = created.created[0]!.id;
    const s2Id = created.created[1]!.id;

    const col = await collectionService.create({
      deckId: deck.id,
      name: "All Slides Collection",
      slideIds: [s1Id, s2Id],
    });

    await slideService.delete({
      deckId: deck.id,
      slideIds: [s1Id],
    });

    const updatedCol = await collectionService.read(deck.id, col.id);
    expect(updatedCol.slideIds).toEqual([s2Id]);

    const remainingSlides = await slideService.list(deck.id);
    expect(remainingSlides.slides.length).toBe(1);
    expect(remainingSlides.slides[0]!.id).toBe(s2Id);
  });
});
