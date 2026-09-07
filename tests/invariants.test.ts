import { describe, expect, it } from "vitest";
import { validateDeckInvariants, validateGeometry } from "../src/domain/invariants.js";
import type { DeckRecord } from "../src/domain/models.js";

describe("Domain Invariants", () => {
  it("should detect invalid non-finite or non-positive geometry", () => {
    const issues = validateGeometry({ x: NaN, w: -10, h: 0 });
    expect(issues.length).toBe(3);
    expect(issues.map((i) => i.code)).toContain("INVALID_GEOMETRY");
  });

  it("should detect dangling collection slide references and duplicate IDs", () => {
    const deck: DeckRecord = {
      id: "deck-1",
      fileName: "deck-1.pptx",
      revision: 1,
      slides: [
        { id: "slide-1", elements: [] },
        { id: "slide-1", elements: [] }, // duplicate slide ID
      ],
      collections: [
        { id: "col-1", name: "Dangling", slideIds: ["non-existent-slide"] },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const issues = validateDeckInvariants(deck);
    const codes = issues.map((i) => i.code);

    expect(codes).toContain("DUPLICATE_SLIDE_ID");
    expect(codes).toContain("DANGLING_COLLECTION_SLIDE_REF");
  });
});
