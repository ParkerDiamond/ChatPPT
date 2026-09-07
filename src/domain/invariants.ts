import { getSlides, type PresentationData } from "@office-kit/pptx";
import type { DeckRecord, ElementRecord, SlideCollection, SlideRecord } from "./models.js";

export type DiagnosticIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
  resourceId?: string;
};

export function validateGeometry(
  element: Partial<ElementRecord>,
  elementId?: string
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  const checkFinite = (val: number | undefined, name: string) => {
    if (val !== undefined && (!Number.isFinite(val) || Number.isNaN(val))) {
      issues.push({
        code: "INVALID_GEOMETRY",
        severity: "error",
        message: `${name} must be a finite number`,
        resourceId: elementId,
      });
    }
  };

  checkFinite(element.x, "x");
  checkFinite(element.y, "y");
  checkFinite(element.w, "width (w)");
  checkFinite(element.h, "height (h)");

  if (element.w !== undefined && element.w <= 0) {
    issues.push({
      code: "INVALID_GEOMETRY",
      severity: "error",
      message: "Width (w) must be positive",
      resourceId: elementId,
    });
  }

  if (element.h !== undefined && element.h <= 0) {
    issues.push({
      code: "INVALID_GEOMETRY",
      severity: "error",
      message: "Height (h) must be positive",
      resourceId: elementId,
    });
  }

  return issues;
}

export function validateDeckInvariants(
  deck: DeckRecord,
  presentation?: PresentationData
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  // Check unique slide IDs
  const slideIds = new Set<string>();
  for (const slide of deck.slides) {
    if (slideIds.has(slide.id)) {
      issues.push({
        code: "DUPLICATE_SLIDE_ID",
        severity: "error",
        message: `Duplicate slide ID '${slide.id}' found in deck`,
        resourceId: slide.id,
      });
    }
    slideIds.add(slide.id);

    // Check unique element IDs within slide
    const elementIds = new Set<string>();
    for (const elem of slide.elements ?? []) {
      if (elementIds.has(elem.id)) {
        issues.push({
          code: "DUPLICATE_ELEMENT_ID",
          severity: "error",
          message: `Duplicate element ID '${elem.id}' found on slide '${slide.id}'`,
          resourceId: elem.id,
        });
      }
      elementIds.add(elem.id);
      issues.push(...validateGeometry(elem, elem.id));
    }
  }

  // Check collections
  for (const col of deck.collections ?? []) {
    const colSlideSet = new Set<string>();
    for (const sId of col.slideIds) {
      if (colSlideSet.has(sId)) {
        issues.push({
          code: "DUPLICATE_COLLECTION_SLIDE_REF",
          severity: "warning",
          message: `Collection '${col.name}' contains duplicate slide reference '${sId}'`,
          resourceId: col.id,
        });
      }
      colSlideSet.add(sId);

      if (!slideIds.has(sId)) {
        issues.push({
          code: "DANGLING_COLLECTION_SLIDE_REF",
          severity: "error",
          message: `Collection '${col.name}' references non-existent slide '${sId}'`,
          resourceId: col.id,
        });
      }
    }
  }

  // Check presentation synchronization if loaded
  if (presentation) {
    const pptSlides = getSlides(presentation);
    if (pptSlides.length !== deck.slides.length) {
      issues.push({
        code: "SLIDE_COUNT_MISMATCH",
        severity: "error",
        message: `Registry slide count (${deck.slides.length}) does not match PPTX slide count (${pptSlides.length})`,
        resourceId: deck.id,
      });
    }
  }

  return issues;
}
