import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createPresentation, type PresentationData } from "@office-kit/pptx";
import { loadPresentationFile, savePresentationToFile } from "@office-kit/pptx/node";
import { ValidationError } from "../domain/errors.js";
import { ensureSubpath, getWorkspaceRoot } from "./registry.js";

export class PresentationStore {
  getDeckPath(deckId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(deckId)) {
      throw new ValidationError(`Invalid deck ID format: '${deckId}'`);
    }
    const presentationsDir = resolve(getWorkspaceRoot(), "presentations");
    const fullPath = resolve(presentationsDir, `${deckId}.pptx`);
    return ensureSubpath(presentationsDir, fullPath, "Deck path");
  }

  async load(deckId: string): Promise<PresentationData> {
    const path = this.getDeckPath(deckId);
    return await loadPresentationFile(path);
  }

  async save(deckId: string, presentation: PresentationData): Promise<void> {
    const path = this.getDeckPath(deckId);
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.tmp`;
    await savePresentationToFile(presentation, temporaryPath);
    await rename(temporaryPath, path);
  }

  async createNew(deckId: string): Promise<void> {
    const pres = createPresentation();
    await this.save(deckId, pres);
  }

  async delete(deckId: string): Promise<void> {
    const path = this.getDeckPath(deckId);
    await rm(path, { force: true });
  }
}

export const presentationStore = new PresentationStore();
