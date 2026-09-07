import { execSync as exec } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const SMOKE_ROOT = resolve(process.cwd(), "tmp_smoke_test");
const TARBALL_DIR = join(SMOKE_ROOT, "pack");
const INSTALL_DIR = join(SMOKE_ROOT, "install");
const WORKSPACE_DIR = join(SMOKE_ROOT, "workspace");

describe("Package Smoke Test (Built Tarball Artifact)", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let tarballFilename: string;

  beforeAll(async () => {
    // 1. Clean up & create smoke test directories
    await rm(SMOKE_ROOT, { recursive: true, force: true });
    await mkdir(TARBALL_DIR, { recursive: true });
    await mkdir(INSTALL_DIR, { recursive: true });
    await mkdir(WORKSPACE_DIR, { recursive: true });

    // 2. Build TypeScript project
    exec("npm run build", { cwd: process.cwd(), stdio: "pipe" });

    // 3. Pack tarball into TARBALL_DIR
    const packOutput = exec(`npm pack --pack-destination="${TARBALL_DIR}"`, {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    tarballFilename = packOutput.trim().split("\n").pop()!;

    // 4. Extract tarball into INSTALL_DIR
    const tarballPath = join(TARBALL_DIR, tarballFilename);
    exec(`tar -xzf "${tarballPath}" -C "${INSTALL_DIR}"`, { stdio: "pipe" });

    // 5. Connect Client via StdioClientTransport to extracted package binary
    const entrypoint = join(INSTALL_DIR, "package", "dist", "index.js");
    transport = new StdioClientTransport({
      command: "node",
      args: [entrypoint, "--workspace", WORKSPACE_DIR],
    });

    client = new Client({ name: "smoke-test-client", version: "1.0.0" });
    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    if (transport) {
      await transport.close().catch(() => {});
    }
    await rm(SMOKE_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  it("should discover all expected MCP tools from the built package", async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);

    expect(toolNames).toContain("deck_create");
    expect(toolNames).toContain("deck_list");
    expect(toolNames).toContain("deck_read");
    expect(toolNames).toContain("deck_update");
    expect(toolNames).toContain("deck_delete");
    expect(toolNames).toContain("deck_validate");

    expect(toolNames).toContain("slide_create");
    expect(toolNames).toContain("slide_list");
    expect(toolNames).toContain("slide_read");
    expect(toolNames).toContain("slide_update");
    expect(toolNames).toContain("slide_delete");
    expect(toolNames).toContain("slide_move");
    expect(toolNames).toContain("slide_duplicate");

    expect(toolNames).toContain("slide_collection_create");
    expect(toolNames).toContain("slide_collection_list");
    expect(toolNames).toContain("slide_collection_read");

    expect(toolNames).toContain("element_create");
    expect(toolNames).toContain("element_list");
    expect(toolNames).toContain("element_read");
    expect(toolNames).toContain("element_update");
    expect(toolNames).toContain("element_delete");
    expect(toolNames).toContain("element_reorder");
  });

  it("should execute end-to-end presentation workflow via MCP client", async () => {
    // 1. Create deck
    const createDeckRes = (await client.callTool({
      name: "deck_create",
      arguments: { title: "Smoke Test Deck" },
    })) as { content: Array<{ type: string; text: string }> };

    const deckData = JSON.parse(createDeckRes.content[0]!.text) as { id: string };
    const deckId = deckData.id;
    expect(deckId).toBeDefined();

    // 2. Add slide
    const createSlideRes = (await client.callTool({
      name: "slide_create",
      arguments: {
        deckId,
        slides: [{ title: "Welcome Slide", notes: "Speaker notes here" }],
      },
    })) as { content: Array<{ type: string; text: string }> };

    const slideData = JSON.parse(createSlideRes.content[0]!.text) as {
      created: Array<{ id: string }>;
    };
    const slideId = slideData.created[0]!.id;
    expect(slideId).toBeDefined();

    // 3. Add elements
    const createElementRes = (await client.callTool({
      name: "element_create",
      arguments: {
        deckId,
        slideId,
        elements: [
          {
            clientId: "txt-1",
            kind: "textbox",
            text: "Smoke Test Text Box",
            x: 1,
            y: 1,
            w: 5,
            h: 1,
            fill: "#EFEFEF",
          },
        ],
      },
    })) as { content: Array<{ type: string; text: string }> };

    const elemData = JSON.parse(createElementRes.content[0]!.text) as {
      created: Array<{ clientId: string; element: { id: string } }>;
    };
    expect(elemData.created[0]!.clientId).toBe("txt-1");

    // 4. Validate deck
    const validateRes = (await client.callTool({
      name: "deck_validate",
      arguments: { deckId },
    })) as { content: Array<{ type: string; text: string }> };

    const valData = JSON.parse(validateRes.content[0]!.text) as { valid: boolean; issues: any[] };
    expect(valData.valid).toBe(true);

    // 5. Delete deck
    const deleteRes = (await client.callTool({
      name: "deck_delete",
      arguments: { deckId },
    })) as { content: Array<{ type: string; text: string }> };

    const deleteData = JSON.parse(deleteRes.content[0]!.text) as { deleted: { id: string } };
    expect(deleteData.deleted.id).toBe(deckId);
  });
});
