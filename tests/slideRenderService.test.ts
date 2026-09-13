import { describe, expect, it } from "vitest";
import "./testHelper.js";
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
});