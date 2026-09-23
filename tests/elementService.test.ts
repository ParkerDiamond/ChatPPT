import { describe, expect, it } from "vitest";
import { truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { testWorkspaceDir } from "./testHelper.js";
import { deckService } from "../src/domain/deckService.js";
import { slideService } from "../src/domain/slideService.js";
import { elementService, MAX_IMAGE_BYTES } from "../src/domain/elementService.js";
import { ValidationError } from "../src/domain/errors.js";
import { resetWorkspaceRoot, setWorkspaceRoot } from "../src/storage/registry.js";

describe("ElementService", () => {
  it("should create elements in batch with clientId correlation", async () => {
    const deck = await deckService.create({ title: "Deck" });
    const slideRes = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slideRes.created[0]!.id;

    const result = await elementService.create({
      deckId: deck.id,
      slideId,
      elements: [
        {
          clientId: "title-box",
          kind: "textbox",
          text: "Headline",
          x: 1,
          y: 0.5,
          w: 8,
          h: 1,
          fill: "#F0F0F0",
          fontFamily: "Arial",
          fontSize: 28,
          bold: true,
          textColor: "#333333",
        },
        {
          clientId: "star-shape",
          kind: "shape",
          preset: "star5",
          x: 2,
          y: 2,
          w: 2,
          h: 2,
          fill: "#FFD700",
        },
      ],
    });

    expect(result.created.length).toBe(2);
    expect(result.created[0]!.clientId).toBe("title-box");
    expect(result.created[0]!.element.text).toBe("Headline");
    expect(result.created[0]!.element.fill).toBe("#F0F0F0");
    expect(result.created[0]!.element.bold).toBe(true);

    expect(result.created[1]!.clientId).toBe("star-shape");
    expect(result.created[1]!.element.preset).toBe("star5");

    const list = await elementService.list(deck.id, slideId);
    expect(list.elements.length).toBe(2);
  });

  it("should throw ValidationError on non-positive dimensions", async () => {
    const deck = await deckService.create({ title: "Deck" });
    const slideRes = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slideRes.created[0]!.id;

    await expect(
      elementService.create({
        deckId: deck.id,
        slideId,
        elements: [
          {
            kind: "textbox",
            w: -5,
            h: 2,
          },
        ],
      })
    ).rejects.toThrow(ValidationError);
  });

  it("should reject image files larger than the configured limit", async () => {
    setWorkspaceRoot(testWorkspaceDir);
    const imagePath = join(testWorkspaceDir, "oversized.png");
    await writeFile(imagePath, "");
    await truncate(imagePath, MAX_IMAGE_BYTES + 1);

    try {
      const deck = await deckService.create({ title: "Deck" });
      const slideRes = await slideService.create({ deckId: deck.id, slides: [{ title: "Slide 1" }] });

      await expect(
        elementService.create({
          deckId: deck.id,
          slideId: slideRes.created[0]!.id,
          elements: [{ kind: "image", imagePath }],
        })
      ).rejects.toThrow(ValidationError);
    } finally {
      resetWorkspaceRoot();
    }
  });

  it("should update elements in batch", async () => {
    const deck = await deckService.create({ title: "Deck" });
    const slideRes = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slideRes.created[0]!.id;

    const elemRes = await elementService.create({
      deckId: deck.id,
      slideId,
      elements: [{ kind: "textbox", text: "Original" }],
    });
    const elemId = elemRes.created[0]!.element.id;

    const updated = await elementService.update({
      deckId: deck.id,
      slideId,
      updates: [
        {
          elementId: elemId,
          text: "Updated Text",
          x: 2.5,
          y: 3.5,
          fill: "#00FF00",
        },
      ],
    });

    expect(updated.updated[0]!.text).toBe("Updated Text");
    expect(updated.updated[0]!.x).toBe(2.5);
    expect(updated.updated[0]!.y).toBe(3.5);
    expect(updated.updated[0]!.fill).toBe("#00FF00");
  });

  it("should reorder element z-index", async () => {
    const deck = await deckService.create({ title: "Deck" });
    const slideRes = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slideRes.created[0]!.id;

    const elemRes = await elementService.create({
      deckId: deck.id,
      slideId,
      elements: [
        { clientId: "elem1", text: "First" },
        { clientId: "elem2", text: "Second" },
      ],
    });

    const e1Id = elemRes.created[0]!.element.id;

    await elementService.reorder({
      deckId: deck.id,
      slideId,
      elementId: e1Id,
      action: "bringToFront",
    });

    const list = await elementService.list(deck.id, slideId);
    expect(list.elements[1]!.id).toBe(e1Id);
  });

  it("should delete elements in batch", async () => {
    const deck = await deckService.create({ title: "Deck" });
    const slideRes = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slideRes.created[0]!.id;

    const elemRes = await elementService.create({
      deckId: deck.id,
      slideId,
      elements: [
        { text: "Item 1" },
        { text: "Item 2" },
      ],
    });

    const e1Id = elemRes.created[0]!.element.id;
    const e2Id = elemRes.created[1]!.element.id;

    const deleted = await elementService.delete({
      deckId: deck.id,
      slideId,
      elementIds: [e1Id, e2Id],
    });

    expect(deleted.deleted.length).toBe(2);

    const list = await elementService.list(deck.id, slideId);
    expect(list.elements.length).toBe(0);
  });
});
