import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  addSlideChart,
  addSlideImage,
  addSlideLine,
  addSlideShape,
  addSlideTable,
  addSlideTextBox,
  bringShapeForward,
  bringShapeToFront,
  getSlideShapes,
  getSlides,
  inches,
  pt,
  removeShape,
  sendShapeBackward,
  sendShapeToBack,
  setParagraphAlignment,
  setShapeFill,
  setShapePosition,
  setShapeRunFormat,
  setShapeSize,
  setShapeStroke,
  setShapeText,
} from "@office-kit/pptx";
import type { ChartSpec, ElementKind, ElementRecord } from "./models.js";
import { NotFoundError, ValidationError } from "./errors.js";
import { validateGeometry } from "./invariants.js";
import { ensureSubpath, getRegistryStore, getWorkspaceRoot } from "../storage/registry.js";
import { presentationStore } from "../storage/presentationStore.js";
import { deckMutex } from "../storage/deckMutex.js";

const now = () => new Date().toISOString();

export type ElementCreateParams = {
  clientId?: string;
  kind?: ElementKind;
  preset?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  fill?: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  align?: "left" | "center" | "right" | "justify";
  rows?: string[][];
  chartSpec?: ChartSpec;
  imagePath?: string;
};

export type ElementUpdateParams = {
  elementId: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  fill?: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  align?: "left" | "center" | "right" | "justify";
};

export class ElementService {
  async create(args: {
    deckId: string;
    slideId: string;
    elements: ElementCreateParams[];
  }): Promise<{ created: Array<{ clientId?: string; element: ElementRecord }> }> {
    // Serialize all mutations per deck to prevent races
    return await deckMutex.withLock(args.deckId, async () => {
      return await this._createWithLock(args);
    });
  }

  private async _createWithLock(args: {
    deckId: string;
    slideId: string;
    elements: ElementCreateParams[];
  }): Promise<{ created: Array<{ clientId?: string; element: ElementRecord }> }> {
    if (!args.elements || args.elements.length === 0) {
      throw new ValidationError("At least one element definition must be provided");
    }

    // Atomic pre-validation of all elements
    for (const item of args.elements) {
      const geomIssues = validateGeometry(item);
      if (geomIssues.length > 0) {
        throw new ValidationError(geomIssues.map((i) => i.message).join("; "));
      }
    }

    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const slideIndex = deck.slides.findIndex((s) => s.id === args.slideId);
    if (slideIndex < 0) throw new NotFoundError("slide", args.slideId);

    const slide = deck.slides[slideIndex]!;
    slide.elements = slide.elements ?? [];

    const presentation = await presentationStore.load(args.deckId);
    const pptSlides = getSlides(presentation);
    const pptSlide = pptSlides[slideIndex];
    if (!pptSlide) throw new Error("CONFLICT: presentation slide order differs from the registry");

    const created: Array<{ clientId?: string; element: ElementRecord }> = [];

    for (const item of args.elements) {
      const kind: ElementKind = item.kind ?? "textbox";
      const x = item.x ?? 1;
      const y = item.y ?? 1;
      const w = item.w ?? 4;
      const h = item.h ?? 2;

      let pptShape;

      if (kind === "textbox") {
        pptShape = addSlideTextBox(pptSlide, {
          x: inches(x),
          y: inches(y),
          w: inches(w),
          h: inches(h),
          text: item.text ?? "",
        });
      } else if (kind === "shape") {
        pptShape = addSlideShape(pptSlide, {
          preset: (item.preset as any) ?? "rect",
          x: inches(x),
          y: inches(y),
          w: inches(w),
          h: inches(h),
          text: item.text ?? "",
        });
      } else if (kind === "line") {
        pptShape = addSlideLine(pptSlide, {
          from: { x: inches(x), y: inches(y) },
          to: { x: inches(x + w), y: inches(y + h) },
        });
      } else if (kind === "table") {
        pptShape = addSlideTable(pptSlide, {
          x: inches(x),
          y: inches(y),
          w: inches(w),
          h: inches(h),
          rows: item.rows ?? [["Header 1", "Header 2"], ["Data 1", "Data 2"]],
        });
      } else if (kind === "chart") {
        pptShape = addSlideChart(pptSlide, {
          x: inches(x),
          y: inches(y),
          w: inches(w),
          h: inches(h),
          spec: item.chartSpec ?? {
            kind: "column",
            categories: ["Q1", "Q2"],
            series: [{ name: "Series 1", values: [10, 20] }],
          },
        });
      } else if (kind === "image") {
        if (!item.imagePath) {
          throw new ValidationError("imagePath is required for image elements");
        }
        const workspaceRoot = resolve(getWorkspaceRoot());
        const rawResolved = isAbsolute(item.imagePath)
          ? item.imagePath
          : resolve(workspaceRoot, item.imagePath);

        const resolvedPath = ensureSubpath(workspaceRoot, rawResolved, "Image path");

        const imageBytes = await readFile(resolvedPath);
        pptShape = addSlideImage(pptSlide, imageBytes, {
          x: inches(x),
          y: inches(y),
          w: inches(w),
          h: inches(h),
        });
      } else {
        throw new ValidationError(`Unsupported element kind '${kind}'`);
      }

      // Apply formatting properties
      if (pptShape) {
        if (item.fill) {
          setShapeFill(pptShape, item.fill);
        }
        if (item.fontFamily || item.fontSize || item.bold !== undefined || item.italic !== undefined || item.textColor) {
          try {
            setShapeRunFormat(pptShape, 0, 0, {
              font: item.fontFamily,
              size: item.fontSize,
              bold: item.bold,
              italic: item.italic,
              color: item.textColor,
            });
          } catch {
            // text run format fallback
          }
        }
        if (item.align) {
          try {
            setParagraphAlignment(pptShape, 0, item.align);
          } catch {
            // paragraph align fallback
          }
        }
        if (item.strokeColor || item.strokeWidth) {
          try {
            setShapeStroke(pptShape, {
              color: item.strokeColor ?? "#000000",
              widthEmu: item.strokeWidth !== undefined ? pt(item.strokeWidth) : undefined,
            });
          } catch {
            // stroke fallback
          }
        }
      }

      const timestamp = now();
      const elementRecord: ElementRecord = {
        id: randomUUID(),
        kind,
        preset: item.preset,
        x,
        y,
        w,
        h,
        text: item.text,
        fill: item.fill,
        fontFamily: item.fontFamily,
        fontSize: item.fontSize,
        bold: item.bold,
        italic: item.italic,
        textColor: item.textColor,
        strokeColor: item.strokeColor,
        strokeWidth: item.strokeWidth,
        align: item.align,
        rows: item.rows,
        chartSpec: item.chartSpec,
        imagePath: item.imagePath,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      slide.elements.push(elementRecord);
      created.push({ clientId: item.clientId, element: elementRecord });
    }

    deck.revision += 1;
    deck.updatedAt = now();

    await presentationStore.save(args.deckId, presentation);
    await registryStore.write(registry);

    return { created };
  }

  async list(deckId: string, slideId: string): Promise<{ elements: Array<ElementRecord & { position: number }> }> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === deckId);
    if (!deck) throw new NotFoundError("deck", deckId);

    const slide = deck.slides.find((s) => s.id === slideId);
    if (!slide) throw new NotFoundError("slide", slideId);

    const elements = (slide.elements ?? []).map((e, position) => ({ ...e, position }));
    return { elements };
  }

  async read(deckId: string, slideId: string, elementId: string): Promise<ElementRecord & { position: number }> {
    const { elements } = await this.list(deckId, slideId);
    const element = elements.find((e) => e.id === elementId);
    if (!element) throw new NotFoundError("element", elementId);
    return element;
  }

  async update(args: {
    deckId: string;
    slideId: string;
    updates: ElementUpdateParams[];
  }): Promise<{ updated: ElementRecord[] }> {
    // Serialize all mutations per deck to prevent races
    return await deckMutex.withLock(args.deckId, async () => {
      return await this._updateWithLock(args);
    });
  }

  private async _updateWithLock(args: {
    deckId: string;
    slideId: string;
    updates: ElementUpdateParams[];
  }): Promise<{ updated: ElementRecord[] }> {
    if (!args.updates || args.updates.length === 0) {
      throw new ValidationError("At least one element update must be provided");
    }

    for (const updateItem of args.updates) {
      const geomIssues = validateGeometry(updateItem, updateItem.elementId);
      if (geomIssues.length > 0) {
        throw new ValidationError(geomIssues.map((i) => i.message).join("; "));
      }
    }

    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const slideIndex = deck.slides.findIndex((s) => s.id === args.slideId);
    if (slideIndex < 0) throw new NotFoundError("slide", args.slideId);

    const slide = deck.slides[slideIndex]!;
    slide.elements = slide.elements ?? [];

    const presentation = await presentationStore.load(args.deckId);
    const pptSlides = getSlides(presentation);
    const pptSlide = pptSlides[slideIndex];
    if (!pptSlide) throw new Error("CONFLICT: presentation slide order differs from the registry");

    const pptShapes = getSlideShapes(pptSlide);
    const updated: ElementRecord[] = [];

    for (const updateItem of args.updates) {
      const elementIndex = slide.elements.findIndex((e) => e.id === updateItem.elementId);
      if (elementIndex < 0) throw new NotFoundError("element", updateItem.elementId);

      const element = slide.elements[elementIndex]!;
      const pptShape = pptShapes[elementIndex];

      const newX = updateItem.x ?? element.x ?? 1;
      const newY = updateItem.y ?? element.y ?? 1;
      const newW = updateItem.w ?? element.w ?? 4;
      const newH = updateItem.h ?? element.h ?? 2;

      if (updateItem.x !== undefined || updateItem.y !== undefined) {
        if (pptShape) setShapePosition(pptShape, inches(newX), inches(newY));
        element.x = newX;
        element.y = newY;
      }

      if (updateItem.w !== undefined || updateItem.h !== undefined) {
        if (pptShape) setShapeSize(pptShape, inches(newW), inches(newH));
        element.w = newW;
        element.h = newH;
      }

      if (updateItem.text !== undefined) {
        if (pptShape) setShapeText(pptShape, updateItem.text);
        element.text = updateItem.text;
      }

      if (updateItem.fill !== undefined) {
        if (pptShape) setShapeFill(pptShape, updateItem.fill);
        element.fill = updateItem.fill;
      }

      if (
        updateItem.fontFamily !== undefined ||
        updateItem.fontSize !== undefined ||
        updateItem.bold !== undefined ||
        updateItem.italic !== undefined ||
        updateItem.textColor !== undefined
      ) {
        element.fontFamily = updateItem.fontFamily ?? element.fontFamily;
        element.fontSize = updateItem.fontSize ?? element.fontSize;
        element.bold = updateItem.bold ?? element.bold;
        element.italic = updateItem.italic ?? element.italic;
        element.textColor = updateItem.textColor ?? element.textColor;

        if (pptShape) {
          try {
            setShapeRunFormat(pptShape, 0, 0, {
              font: element.fontFamily,
              size: element.fontSize,
              bold: element.bold,
              italic: element.italic,
              color: element.textColor,
            });
          } catch {
            // text run format fallback
          }
        }
      }

      if (updateItem.align !== undefined) {
        element.align = updateItem.align;
        if (pptShape) {
          try {
            setParagraphAlignment(pptShape, 0, updateItem.align);
          } catch {
            // paragraph align fallback
          }
        }
      }

      if (updateItem.strokeColor !== undefined || updateItem.strokeWidth !== undefined) {
        element.strokeColor = updateItem.strokeColor ?? element.strokeColor;
        element.strokeWidth = updateItem.strokeWidth ?? element.strokeWidth;
        if (pptShape) {
          try {
            setShapeStroke(pptShape, {
              color: element.strokeColor ?? "#000000",
              widthEmu: element.strokeWidth !== undefined ? pt(element.strokeWidth) : undefined,
            });
          } catch {
            // stroke fallback
          }
        }
      }

      element.updatedAt = now();
      updated.push(element);
    }

    deck.revision += 1;
    deck.updatedAt = now();

    await presentationStore.save(args.deckId, presentation);
    await registryStore.write(registry);

    return { updated };
  }

  async delete(args: {
    deckId: string;
    slideId: string;
    elementIds: string[];
  }): Promise<{ deleted: ElementRecord[] }> {
    // Serialize all mutations per deck to prevent races
    return await deckMutex.withLock(args.deckId, async () => {
      return await this._deleteWithLock(args);
    });
  }

  private async _deleteWithLock(args: {
    deckId: string;
    slideId: string;
    elementIds: string[];
  }): Promise<{ deleted: ElementRecord[] }> {
    if (!args.elementIds || args.elementIds.length === 0) {
      throw new ValidationError("At least one element ID must be provided");
    }

    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const slideIndex = deck.slides.findIndex((s) => s.id === args.slideId);
    if (slideIndex < 0) throw new NotFoundError("slide", args.slideId);

    const slide = deck.slides[slideIndex]!;
    slide.elements = slide.elements ?? [];

    const presentation = await presentationStore.load(args.deckId);
    const pptSlides = getSlides(presentation);
    const pptSlide = pptSlides[slideIndex];
    const pptShapes = pptSlide ? getSlideShapes(pptSlide) : [];

    const deleteSet = new Set(args.elementIds);

    // Filter elements to delete in reverse order
    const indicesToDelete = slide.elements
      .map((e, idx) => ({ id: e.id, idx }))
      .filter((item) => deleteSet.has(item.id))
      .sort((a, b) => b.idx - a.idx);

    if (indicesToDelete.length === 0) {
      throw new NotFoundError("element", args.elementIds.join(", "));
    }

    const deleted: ElementRecord[] = [];

    for (const { idx } of indicesToDelete) {
      const [elem] = slide.elements.splice(idx, 1);
      if (elem) deleted.push(elem);

      const pptShape = pptShapes[idx];
      if (pptShape) {
        try {
          removeShape(pptShape);
        } catch {
          // pptx shape removal fallback
        }
      }
    }

    deck.revision += 1;
    deck.updatedAt = now();

    await presentationStore.save(args.deckId, presentation);
    await registryStore.write(registry);

    return { deleted };
  }

  async reorder(args: {
    deckId: string;
    slideId: string;
    elementId: string;
    action: "bringToFront" | "sendToBack" | "bringForward" | "sendBackward";
  }): Promise<{ elementId: string; action: string }> {
    const registryStore = getRegistryStore();
    const registry = await registryStore.read();
    const deck = registry.decks.find((d) => d.id === args.deckId);
    if (!deck) throw new NotFoundError("deck", args.deckId);

    const slideIndex = deck.slides.findIndex((s) => s.id === args.slideId);
    if (slideIndex < 0) throw new NotFoundError("slide", args.slideId);

    const slide = deck.slides[slideIndex]!;
    slide.elements = slide.elements ?? [];

    const elementIndex = slide.elements.findIndex((e) => e.id === args.elementId);
    if (elementIndex < 0) throw new NotFoundError("element", args.elementId);

    const presentation = await presentationStore.load(args.deckId);
    const pptSlides = getSlides(presentation);
    const pptSlide = pptSlides[slideIndex];

    if (pptSlide) {
      const pptShapes = getSlideShapes(pptSlide);
      const pptShape = pptShapes[elementIndex];
      if (pptShape) {
        if (args.action === "bringToFront") bringShapeToFront(pptShape);
        else if (args.action === "sendToBack") sendShapeToBack(pptShape);
        else if (args.action === "bringForward") bringShapeForward(pptShape);
        else if (args.action === "sendBackward") sendShapeBackward(pptShape);
      }
    }

    const [element] = slide.elements.splice(elementIndex, 1);
    if (element) {
      if (args.action === "bringToFront") {
        slide.elements.push(element);
      } else if (args.action === "sendToBack") {
        slide.elements.unshift(element);
      } else if (args.action === "bringForward") {
        const targetIndex = Math.min(slide.elements.length, elementIndex + 1);
        slide.elements.splice(targetIndex, 0, element);
      } else if (args.action === "sendBackward") {
        const targetIndex = Math.max(0, elementIndex - 1);
        slide.elements.splice(targetIndex, 0, element);
      }
    }

    deck.revision += 1;
    deck.updatedAt = now();

    await presentationStore.save(args.deckId, presentation);
    await registryStore.write(registry);

    return { elementId: args.elementId, action: args.action };
  }
}

export const elementService = new ElementService();
