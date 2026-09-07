import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

export let testWorkspaceDir = "";

beforeEach(async () => {
  testWorkspaceDir = join(process.cwd(), "tmp_test_workspace", randomUUID());
  process.env.CHATPPT_WORKSPACE_ROOT = testWorkspaceDir;
  await mkdir(testWorkspaceDir, { recursive: true });
});

afterEach(async () => {
  if (testWorkspaceDir) {
    await rm(testWorkspaceDir, { recursive: true, force: true }).catch(() => {});
  }
});
