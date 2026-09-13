import { mkdir, readFile, rename, writeFile, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { Registry } from "../domain/models.js";
import { ValidationError } from "../domain/errors.js";

const emptyRegistry = (): Registry => ({ decks: [] });

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

export class RegistryStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<Registry> {
    try {
      const data = await readFile(this.filePath, "utf8");
      const registry = JSON.parse(data) as Registry;
      // Ensure default values if reading legacy metadata
      for (const deck of registry.decks) {
        if (deck.revision === undefined) deck.revision = 1;
        for (const slide of deck.slides) {
          if (!slide.elements) slide.elements = [];
        }
        if (!deck.collections) deck.collections = [];
      }
      return registry;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyRegistry();
      throw error;
    }
  }

  /**
   * Atomically write the registry with crash-safe semantics.
   * 
   * 1. Write to a unique temp file
   * 2. Atomically rename to final path
   * 3. Verify the file exists at the target path
   * 4. Clean up temp file on failure
   * 
   * Throws if the write fails or verification fails.
   */
  async write(registry: Registry): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    const temporaryPath = generateUniqueTempPath(this.filePath);
    let renameSucceeded = false;

    try {
      // Write to unique temp file
      await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

      // Atomically rename temp to final
      await rename(temporaryPath, this.filePath);
      renameSucceeded = true;

      // Verify the file exists at the final path
      const verified = await verifyFileExists(this.filePath);
      if (!verified) {
        throw new Error(`Verification failed: registry not found at ${this.filePath} after rename`);
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
}

export function parseWorkspaceArgFromArgs(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--workspace" || arg === "-w") {
      if (i + 1 < args.length && args[i + 1] && !args[i + 1]!.startsWith("-")) {
        return args[i + 1]!;
      }
    } else if (arg.startsWith("--workspace=")) {
      return arg.slice("--workspace=".length);
    } else if (arg.startsWith("-w=")) {
      return arg.slice("-w=".length);
    }
  }
  return null;
}

let configuredWorkspaceRoot: string | null = null;

export function setWorkspaceRoot(rootPath: string): void {
  configuredWorkspaceRoot = resolve(rootPath);
}

export function resetWorkspaceRoot(): void {
  configuredWorkspaceRoot = null;
}

export function getWorkspaceRoot(): string {
  if (configuredWorkspaceRoot) {
    return configuredWorkspaceRoot;
  }
  const cliWorkspace = parseWorkspaceArgFromArgs(process.argv);
  if (cliWorkspace) {
    configuredWorkspaceRoot = resolve(cliWorkspace);
    return configuredWorkspaceRoot;
  }
  const envWorkspace = process.env.CHATPPT_WORKSPACE_ROOT || process.env.WORKSPACE_ROOT;
  if (envWorkspace) {
    configuredWorkspaceRoot = resolve(envWorkspace);
    return configuredWorkspaceRoot;
  }
  configuredWorkspaceRoot = resolve(process.cwd());
  return configuredWorkspaceRoot;
}

export function isSubpath(parentDir: string, targetPath: string): boolean {
  const resolvedParent = resolve(parentDir);
  const resolvedTarget = resolve(targetPath);
  const relativePath = relative(resolvedParent, resolvedTarget);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function ensureSubpath(parentDir: string, targetPath: string, label: string): string {
  const resolvedParent = resolve(parentDir);
  const resolvedTarget = resolve(targetPath);
  if (!isSubpath(resolvedParent, resolvedTarget)) {
    throw new ValidationError(`Security violation: ${label} '${targetPath}' escapes the managed workspace`);
  }
  return resolvedTarget;
}

export function getRegistryStore(): RegistryStore {
  return new RegistryStore(join(getWorkspaceRoot(), ".chatppt", "registry.json"));
}
