import { execSync as exec } from "node:child_process";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

let smokeRoot = "";
let tarballDir = "";
let installDir = "";
let workspaceDir = "";

describe("Package Smoke Test (Built Tarball Artifact)", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let tarballFilename: string;

  beforeAll(async () => {
    smokeRoot = await mkdtemp(join(tmpdir(), "chatppt-smoke-"));
    tarballDir = join(smokeRoot, "pack");
    installDir = join(smokeRoot, "install");
    workspaceDir = join(smokeRoot, "workspace");
    await mkdir(tarballDir, { recursive: true });
    await mkdir(installDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });

    // 2. Build TypeScript project
    exec("npm run build", { cwd: process.cwd(), stdio: "pipe" });

    // 3. Pack tarball into TARBALL_DIR
    const packOutput = exec(`npm pack --pack-destination="${tarballDir}"`, {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    tarballFilename = packOutput.trim().split("\n").pop()!;

    // 4. Install the packed artifact outside this repository.
    const tarballPath = join(tarballDir, tarballFilename);
    exec("npm init -y", { cwd: installDir, stdio: "pipe" });
    exec(`npm install "${tarballPath}" --ignore-scripts`, { cwd: installDir, stdio: "pipe" });

    // 5. Connect Client via StdioClientTransport to the installed package binary.
    const pkgJson = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile(join(process.cwd(), "package.json"), "utf8")));
    const entrypoint = join(installDir, "node_modules", ...pkgJson.name.split("/"), "dist", "index.js");
    transport = new StdioClientTransport({
      command: "node",
      args: [entrypoint, "--workspace", workspaceDir],
    });

    client = new Client({ name: "smoke-test-client", version: "1.0.0" });
    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    if (transport) {
      await transport.close().catch(() => {});
    }
    if (smokeRoot) {
      await rm(smokeRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("should ensure version and identifier consistency across package.json and server.json", async () => {
    const pkgJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
    const serverJson = JSON.parse(await readFile(join(process.cwd(), "server.json"), "utf8"));

    expect(serverJson.version).toBe(pkgJson.version);
    expect(serverJson.name).toBe(pkgJson.mcpName);
    expect(serverJson.packages[0].identifier).toBe(pkgJson.name);
    expect(serverJson.packages[0].version).toBe(pkgJson.version);
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
    expect(toolNames).toContain("slide_render");
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

    // 4. Render the slide and verify the MCP image content block.
    const renderRes = (await client.callTool({
      name: "slide_render",
      arguments: { deckId, slideId, width: 640 },
    })) as { content: Array<{ type: string; data?: string; mimeType?: string }> };
    expect(renderRes.content[0]!.type).toBe("image");
    expect(renderRes.content[0]!.mimeType).toBe("image/png");
    expect(renderRes.content[0]!.data).toBeTruthy();

    // 5. Validate deck
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
