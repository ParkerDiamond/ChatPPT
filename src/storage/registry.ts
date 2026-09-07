import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Registry } from "../domain/models.js";
import { ValidationError } from "../domain/errors.js";

const emptyRegistry = (): Registry => ({ decks: [] });

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

  async write(registry: Registry): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
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
