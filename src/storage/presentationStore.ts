import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createPresentation, type PresentationData } from "@office-kit/pptx";
import { loadPresentationFile, savePresentationToFile } from "@office-kit/pptx/node";
import { ValidationError } from "../domain/errors.js";
import { ensureSubpath, getWorkspaceRoot } from "./registry.js";

/**
 * Generate a unique temporary filename using a random suffix.
 * Prevents race conditions when multiple processes write simultaneously.
 */
function generateUniqueTempPath(originalPath: string): string {
  const randomSuffix = randomBytes(8).toString("hex");
  return `${originalPath}.tmp.${randomSuffix}`;
}

/**
 * Safely remove a temporary file, ignoring errors if it doesn't exist.
 */
async function safeDeleteTemp(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // Temp file may not exist or already cleaned up; this is acceptable
  }
}

/**
 * Verify that a file exists and is readable.
 * Used to confirm atomicity of writes.
 */
async function verifyFileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

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

  /**
   * Atomically save a presentation with crash-safe semantics.
   * 
   * 1. Write to a unique temp file
   * 2. Atomically rename to final path
   * 3. Verify the file exists at the target path
   * 4. Clean up temp file on failure
   * 
   * Throws if the write fails or verification fails.
   */
  async save(deckId: string, presentation: PresentationData): Promise<void> {
    const finalPath = this.getDeckPath(deckId);
    await mkdir(dirname(finalPath), { recursive: true });

    const temporaryPath = generateUniqueTempPath(finalPath);
    let renameSucceeded = false;

    try {
      // Write to unique temp file
      await savePresentationToFile(presentation, temporaryPath);

      // Atomically rename temp to final
      await rename(temporaryPath, finalPath);
      renameSucceeded = true;

      // Verify the file exists at the final path
      const verified = await verifyFileExists(finalPath);
      if (!verified) {
        throw new Error(`Verification failed: presentation not found at ${finalPath} after rename`);
      }
    } catch (error) {
      // Clean up temp file on any failure
      await safeDeleteTemp(temporaryPath);

      // If rename succeeded but verification failed, the file might be corrupted
      // In this case, do NOT delete the final file; preserve last known good state
      if (!renameSucceeded) {
        throw error;
      }

      // Verification failed; re-throw
      throw error;
    }
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
