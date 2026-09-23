import { describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./testHelper.js";
import { ensureRealSubpath, ensureSubpath, isSubpath, parseWorkspaceArgFromArgs } from "../src/storage/registry.js";
import { presentationStore } from "../src/storage/presentationStore.js";
import { ValidationError } from "../src/domain/errors.js";

describe("Workspace Semantics & Path Isolation", () => {
  it("should correctly parse workspace CLI arguments", () => {
    expect(parseWorkspaceArgFromArgs(["node", "index.js", "--workspace", "/tmp/ws1"])).toBe("/tmp/ws1");
    expect(parseWorkspaceArgFromArgs(["node", "index.js", "-w", "/tmp/ws2"])).toBe("/tmp/ws2");
    expect(parseWorkspaceArgFromArgs(["node", "index.js", "--workspace=/tmp/ws3"])).toBe("/tmp/ws3");
    expect(parseWorkspaceArgFromArgs(["node", "index.js", "-w=/tmp/ws4"])).toBe("/tmp/ws4");
    expect(parseWorkspaceArgFromArgs(["node", "index.js"])).toBeNull();
  });

  it("should accurately identify subpaths and reject escapes", () => {
    const parent = "/home/user/workspace";
    expect(isSubpath(parent, "/home/user/workspace/presentations/deck.pptx")).toBe(true);
    expect(isSubpath(parent, "/home/user/workspace")).toBe(true);
    expect(isSubpath(parent, "/home/user/workspace_extra")).toBe(false);
    expect(isSubpath(parent, "/etc/passwd")).toBe(false);
    expect(isSubpath(parent, "/home/user/workspace/../escape")).toBe(false);
  });

  it("should throw ValidationError on path traversal in ensureSubpath", () => {
    const parent = "/home/user/workspace";
    expect(() => ensureSubpath(parent, "/etc/passwd", "Path")).toThrow(ValidationError);
    expect(() => ensureSubpath(parent, "/home/user/workspace_other/file", "Path")).toThrow(ValidationError);
  });

  it("should reject symlinks that resolve outside the workspace", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "chatppt-path-test-"));
    const workspace = join(temporaryRoot, "workspace");
    const externalFile = join(temporaryRoot, "outside.png");
    const workspaceLink = join(workspace, "image.png");

    try {
      await import("node:fs/promises").then(({ mkdir }) => mkdir(workspace));
      await writeFile(externalFile, "outside");
      await symlink(externalFile, workspaceLink);

      await expect(ensureRealSubpath(workspace, workspaceLink, "Image path")).rejects.toThrow(ValidationError);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("should reject malformed deck IDs in presentationStore", () => {
    expect(() => presentationStore.getDeckPath("../etc/passwd")).toThrow(ValidationError);
    expect(() => presentationStore.getDeckPath("deck/subfolder")).toThrow(ValidationError);
    expect(() => presentationStore.getDeckPath("deck..id")).toThrow(ValidationError);
  });
});
