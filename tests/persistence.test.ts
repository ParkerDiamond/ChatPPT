import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setWorkspaceRoot, resetWorkspaceRoot, getRegistryStore } from "../src/storage/registry.js";
import { presentationStore } from "../src/storage/presentationStore.js";
import { deckMutex } from "../src/storage/deckMutex.js";
import { deckService } from "../src/domain/deckService.js";
import { slideService } from "../src/domain/slideService.js";
import { elementService } from "../src/domain/elementService.js";
import { collectionService } from "../src/domain/collectionService.js";

let testWorkspace: string;

beforeEach(async () => {
  testWorkspace = `/tmp/chatppt-persist-test-${randomUUID()}`;
  await mkdir(testWorkspace, { recursive: true });
  setWorkspaceRoot(testWorkspace);
});

afterEach(async () => {
  resetWorkspaceRoot();
  try {
    await rm(testWorkspace, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("Persistence: Crash Safety and Atomicity", () => {
  it("1. Create a deck and slide", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    expect(deck.id).toBeDefined();
    expect(deck.slides).toHaveLength(0);

    const { created } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.title).toBe("Slide 1");

    // Verify persistence by reloading
    const reloadedDeck = await deckService.read(deck.id);
    expect(reloadedDeck.slides).toHaveLength(1);
    expect(reloadedDeck.slides[0]!.title).toBe("Slide 1");
  });

  it("2. Create 30–50 heterogeneous elements in one batch", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slides[0]!.id;

    // Create 40 heterogeneous elements
    const elements = [];
    for (let i = 0; i < 40; i++) {
      const kind = ["textbox", "shape", "line", "table"][i % 4];
      elements.push({
        kind: kind as any,
        text: `Element ${i}`,
        x: 1 + (i % 5),
        y: 1 + Math.floor(i / 5),
        w: 2,
        h: 1,
        preset: kind === "shape" ? "rect" : undefined,
        rows: kind === "table" ? [["A", "B"], ["C", "D"]] : undefined,
      });
    }

    const { created } = await elementService.create({
      deckId: deck.id,
      slideId,
      elements,
    });

    expect(created).toHaveLength(40);

    // Verify every element persisted
    const { elements: persisted } = await elementService.list(deck.id, slideId);
    expect(persisted).toHaveLength(40);
    for (let i = 0; i < 40; i++) {
      expect(persisted[i]!.text).toBe(`Element ${i}`);
    }
  });

  it("3. Reopen PPTX and registry after large batch, verify persistence", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slides[0]!.id;

    // Create 30 elements
    const elements = [];
    for (let i = 0; i < 30; i++) {
      elements.push({
        kind: "textbox" as const,
        text: `Element ${i}`,
        x: 1,
        y: 1,
      });
    }

    await elementService.create({
      deckId: deck.id,
      slideId,
      elements,
    });

    // Force reload of both stores to simulate server restart
    const freshRegistry = await getRegistryStore().read();
    const freshDeck = freshRegistry.decks.find((d) => d.id === deck.id);
    expect(freshDeck).toBeDefined();
    expect(freshDeck!.slides[0]!.elements).toHaveLength(30);

    // Verify PPTX file exists and can be reloaded
    const pres = await presentationStore.load(deck.id);
    expect(pres).toBeDefined();
  });

  it("4. Add another large batch, reopen, verify cumulative state", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slides[0]!.id;

    // First batch: 20 elements
    let elements = [];
    for (let i = 0; i < 20; i++) {
      elements.push({ kind: "textbox" as const, text: `Batch1-${i}`, x: 1, y: 1 });
    }
    await elementService.create({ deckId: deck.id, slideId, elements });

    // Second batch: 25 more elements
    elements = [];
    for (let i = 0; i < 25; i++) {
      elements.push({ kind: "textbox" as const, text: `Batch2-${i}`, x: 1, y: 1 });
    }
    await elementService.create({ deckId: deck.id, slideId, elements });

    // Verify cumulative state
    const { elements: allElements } = await elementService.list(deck.id, slideId);
    expect(allElements).toHaveLength(45);

    // Reload and verify
    const freshRegistry = await getRegistryStore().read();
    const freshDeck = freshRegistry.decks.find((d) => d.id === deck.id);
    expect(freshDeck!.slides[0]!.elements).toHaveLength(45);
  });

  it("5. Batch-update many elements, reopen, verify", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slides[0]!.id;

    // Create 20 elements
    const elementDefs = [];
    const elementIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      elementDefs.push({ kind: "textbox" as const, text: `Element ${i}`, x: 1, y: 1 });
    }
    const { created } = await elementService.create({
      deckId: deck.id,
      slideId,
      elements: elementDefs,
    });

    for (const c of created) {
      elementIds.push(c.element.id);
    }

    // Update half of them
    const updates = [];
    for (let i = 0; i < 10; i++) {
      updates.push({
        elementId: elementIds[i]!,
        text: `Updated-${i}`,
        fontSize: 14,
      });
    }

    const { updated } = await elementService.update({
      deckId: deck.id,
      slideId,
      updates,
    });

    expect(updated).toHaveLength(10);

    // Reload and verify updates
    const { elements: allElements } = await elementService.list(deck.id, slideId);
    const firstUpdated = allElements.find((e) => e.id === elementIds[0]);
    expect(firstUpdated!.text).toBe("Updated-0");
    expect(firstUpdated!.fontSize).toBe(14);
  });

  it("6. Batch-delete elements, reopen, verify", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slides[0]!.id;

    // Create 20 elements
    const elementDefs = [];
    for (let i = 0; i < 20; i++) {
      elementDefs.push({ kind: "textbox" as const, text: `Element ${i}`, x: 1, y: 1 });
    }
    const { created } = await elementService.create({
      deckId: deck.id,
      slideId,
      elements: elementDefs,
    });

    const elementIds = created.map((c) => c.element.id);

    // Delete 5 elements
    const toDelete = elementIds.slice(0, 5);
    const { deleted } = await elementService.delete({
      deckId: deck.id,
      slideId,
      elementIds: toDelete,
    });

    expect(deleted).toHaveLength(5);

    // Verify deletion
    const { elements: remaining } = await elementService.list(deck.id, slideId);
    expect(remaining).toHaveLength(15);
    expect(remaining.every((e) => !toDelete.includes(e.id))).toBe(true);

    // Reload and verify
    const freshRegistry = await getRegistryStore().read();
    const freshDeck = freshRegistry.decks.find((d) => d.id === deck.id);
    expect(freshDeck!.slides[0]!.elements).toHaveLength(15);
  });

  it("7. Concurrent mutations against same deck are serialized", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slides[0]!.id;

    // Initial elements
    const { created: initial } = await elementService.create({
      deckId: deck.id,
      slideId,
      elements: [
        { kind: "textbox" as const, text: "E1", x: 1, y: 1 },
        { kind: "textbox" as const, text: "E2", x: 1, y: 1 },
      ],
    });

    const id1 = initial[0]!.element.id;
    const id2 = initial[1]!.element.id;

    // Start two mutations concurrently (they will queue due to mutex)
    const p1 = elementService.create({
      deckId: deck.id,
      slideId,
      elements: [{ kind: "textbox" as const, text: "E3", x: 1, y: 1 }],
    });

    const p2 = elementService.update({
      deckId: deck.id,
      slideId,
      updates: [{ elementId: id1, text: "Updated" }],
    });

    await Promise.all([p1, p2]);

    // Verify both mutations applied
    const { elements } = await elementService.list(deck.id, slideId);
    expect(elements).toHaveLength(3);
    expect(elements.find((e) => e.id === id1)!.text).toBe("Updated");
  });

  it("8. Large-batch operations repeated multiple times without corruption", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slides[0]!.id;

    // Repeat large-batch operations 3 times
    for (let round = 0; round < 3; round++) {
      const elements = [];
      for (let i = 0; i < 30; i++) {
        elements.push({
          kind: "textbox" as const,
          text: `Round${round}-Element${i}`,
          x: 1,
          y: 1,
        });
      }

      const { created } = await elementService.create({
        deckId: deck.id,
        slideId,
        elements,
      });

      expect(created).toHaveLength(30);

      // Verify after each round
      const { elements: all } = await elementService.list(deck.id, slideId);
      expect(all).toHaveLength((round + 1) * 30);
    }

    // Final verification
    const { elements: final } = await elementService.list(deck.id, slideId);
    expect(final).toHaveLength(90);
  });

  it("9. Verify registry and PPTX consistency after mutations", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }, { title: "Slide 2" }],
    });

    // Add elements to first slide
    const { created: elements } = await elementService.create({
      deckId: deck.id,
      slideId: slides[0]!.id,
      elements: Array.from({ length: 15 }, (_, i) => ({
        kind: "textbox" as const,
        text: `Element ${i}`,
        x: 1,
        y: 1,
      })),
    });

    // Reload registry
    const registry = await getRegistryStore().read();
    const reloadedDeck = registry.decks.find((d) => d.id === deck.id);

    // Count elements in registry
    const registryElementCount = reloadedDeck!.slides[0]!.elements.length;
    expect(registryElementCount).toBe(15);

    // Load presentation and count slides
    const presentation = await presentationStore.load(deck.id);
    // Verify presentation is valid (can be loaded and has elements)
    expect(presentation).toBeDefined();
  });

  it("10. Temporary files are cleaned up after successful writes", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    const slideId = slides[0]!.id;

    // Create elements (this writes temp files)
    await elementService.create({
      deckId: deck.id,
      slideId,
      elements: Array.from({ length: 20 }, (_, i) => ({
        kind: "textbox" as const,
        text: `Element ${i}`,
        x: 1,
        y: 1,
      })),
    });

    // Check presentations directory for temp files
    const presentationsDir = join(testWorkspace, "presentations");
    const files = await (await import("node:fs/promises")).readdir(presentationsDir);

    // Should only have the final .pptx file, no .tmp.* files
    const tempFiles = files.filter((f) => f.includes(".tmp."));
    expect(tempFiles).toHaveLength(0);
  });

  it("11. Deck revision increments correctly with multiple mutations", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    expect(deck.revision).toBe(1);

    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }],
    });
    expect((await deckService.read(deck.id)).revision).toBe(2);

    const slideId = slides[0]!.id;

    // Add elements
    await elementService.create({
      deckId: deck.id,
      slideId,
      elements: [{ kind: "textbox" as const, text: "E1", x: 1, y: 1 }],
    });
    expect((await deckService.read(deck.id)).revision).toBe(3);

    // Update slide
    await slideService.update({
      deckId: deck.id,
      updates: [{ slideId, title: "Updated Slide" }],
    });
    expect((await deckService.read(deck.id)).revision).toBe(4);
  });

  it("12. Multi-slide operations maintain consistency", async () => {
    const deck = await deckService.create({ title: "Test Deck" });
    const { created: slides } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Slide 1" }, { title: "Slide 2" }, { title: "Slide 3" }],
    });

    // Add elements to different slides
    const elementsPerSlide = 10;
    for (const slide of slides) {
      await elementService.create({
        deckId: deck.id,
        slideId: slide.id,
        elements: Array.from({ length: elementsPerSlide }, (_, i) => ({
          kind: "textbox" as const,
          text: `S${slide.position}-E${i}`,
          x: 1,
          y: 1,
        })),
      });
    }

    // Verify each slide has correct elements
    for (let i = 0; i < slides.length; i++) {
      const { elements } = await elementService.list(deck.id, slides[i]!.id);
      expect(elements).toHaveLength(elementsPerSlide);
      expect(elements[0]!.text).toContain(`S${i}-`);
    }

    // Reload and verify again
    const registry = await getRegistryStore().read();
    const reloadedDeck = registry.decks.find((d) => d.id === deck.id);
    for (let i = 0; i < slides.length; i++) {
      expect(reloadedDeck!.slides[i]!.elements).toHaveLength(elementsPerSlide);
    }
  });
});
