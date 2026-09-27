import { describe, expect, it } from "vitest";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { testWorkspaceDir } from "./testHelper.js";
import { setWorkspaceRoot } from "../src/storage/registry.js";
import { deckService } from "../src/domain/deckService.js";
import { slideService } from "../src/domain/slideService.js";
import { slideRenderService } from "../src/domain/slideRenderService.js";

describe("SlideRenderService", () => {
  it("renders a slide as a PNG image", async () => {
    const deck = await deckService.create({ title: "Render Test" });
    const { created } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Preview me" }],
    });

    const preview = await slideRenderService.render({
      deckId: deck.id,
      slideId: created[0]!.id,
      width: 640,
    });

    expect(preview.mimeType).toBe("image/png");
    expect(preview.width).toBe(640);
    expect(Buffer.from(preview.data, "base64").subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  });

  it("renders at the requested resolution width", async () => {
    const deck = await deckService.create({ title: "Resolution Test" });
    const { created } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Resolution" }],
    });

    const preview = await slideRenderService.render({
      deckId: deck.id,
      slideId: created[0]!.id,
      resolution: 960,
    });
    const png = Buffer.from(preview.data, "base64");

    expect(preview.width).toBe(960);
    expect(png.readUInt32BE(16)).toBe(960);
  });

  it("writes PNG output and normalizes the file extension", async () => {
    setWorkspaceRoot(testWorkspaceDir);
    const deck = await deckService.create({ title: "File Output Test" });
    const { created } = await slideService.create({
      deckId: deck.id,
      slides: [{ title: "Save preview" }],
    });
    const outputDirectory = join(testWorkspaceDir, "renders");
    await mkdir(outputDirectory);

    const preview = await slideRenderService.render({
      deckId: deck.id,
      slideId: created[0]!.id,
      filePath: join(outputDirectory, "preview.jpeg"),
    });
    const writtenFile = await readFile(join(outputDirectory, "preview.png"));

    expect(preview.filePath).toBe(join(outputDirectory, "preview.png"));
    expect(writtenFile.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
    expect(writtenFile.toString("base64")).toBe(preview.data);
  });
});