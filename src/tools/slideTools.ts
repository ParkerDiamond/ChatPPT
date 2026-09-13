import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { slideService } from "../domain/slideService.js";
import { slideRenderService } from "../domain/slideRenderService.js";

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export function registerSlideTools(server: McpServer): void {
  server.registerTool(
    "slide_create",
    {
      description: "Create one or multiple new slides in a presentation deck. Pass an array of slide definitions for vectorized batch creation.",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slides: z
          .array(
            z.object({
              title: z.string().max(500).optional().describe("Optional title text for the slide"),
              notes: z.string().max(10000).optional().describe("Optional speaker notes"),
            })
          )
          .min(1)
          .describe("Array of slide definitions to create in batch"),
      },
    },
    async ({ deckId, slides }) => json(await slideService.create({ deckId, slides }))
  );

  server.registerTool(
    "slide_list",
    {
      description: "List all slides in a presentation deck in presentation order.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
      },
    },
    async ({ deckId }) => json(await slideService.list(deckId))
  );

  server.registerTool(
    "slide_read",
    {
      description: "Read metadata, elements, and speaker notes for a specific slide.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideId: z.string().uuid().describe("Stable ID of the slide"),
      },
    },
    async ({ deckId, slideId }) => json({ slide: await slideService.read(deckId, slideId) })
  );

  server.registerTool(
    "slide_render",
    {
      description: "Render a slide to a PNG image preview for visual feedback.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideId: z.string().uuid().describe("Stable ID of the slide to render"),
        width: z
          .number()
          .int()
          .min(320)
          .max(4096)
          .optional()
          .describe("Optional output width in pixels; defaults to 1280"),
      },
    },
    async ({ deckId, slideId, width }) => {
      const preview = await slideRenderService.render({ deckId, slideId, width });
      return {
        content: [
          {
            type: "image" as const,
            data: preview.data,
            mimeType: preview.mimeType,
          },
          {
            type: "text" as const,
            text: JSON.stringify({ deckId, slideId, width: preview.width }),
          },
        ],
      };
    }
  );

  server.registerTool(
    "slide_update",
    {
      description: "Update metadata, title, or speaker notes of one or more slides in batch.",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        updates: z
          .array(
            z.object({
              slideId: z.string().uuid().describe("Stable ID of the slide to update"),
              title: z.string().max(500).optional().describe("New title text"),
              notes: z.string().max(10000).optional().describe("New speaker notes"),
            })
          )
          .min(1)
          .describe("Array of slide updates"),
      },
    },
    async ({ deckId, updates }) => json(await slideService.update({ deckId, updates }))
  );

  server.registerTool(
    "slide_delete",
    {
      description: "Permanently delete one or more slides from the presentation and registry, and clean up collection references.",
      annotations: { destructiveHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideIds: z
          .array(z.string().uuid())
          .min(1)
          .describe("Array of slide IDs to delete"),
      },
    },
    async ({ deckId, slideIds }) => json(await slideService.delete({ deckId, slideIds }))
  );

  server.registerTool(
    "slide_move",
    {
      description: "Reorder slides in a presentation deck, either by providing a complete slideOrder array or moving a single slideId to a target position.",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideOrder: z
          .array(z.string().uuid())
          .optional()
          .describe("Complete array of slide IDs declaring the desired final order"),
        slideId: z.string().uuid().optional().describe("Single slide ID to move"),
        toPosition: z.number().int().min(0).optional().describe("0-based target index when moving a single slide"),
      },
    },
    async ({ deckId, slideOrder, slideId, toPosition }) =>
      json(await slideService.move({ deckId, slideOrder, slideId, toPosition }))
  );

  server.registerTool(
    "slide_duplicate",
    {
      description: "Duplicate an existing slide in a presentation deck, generating new stable IDs for the slide and all duplicated elements.",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideId: z.string().uuid().describe("Stable ID of the slide to duplicate"),
        targetPosition: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Optional 0-based target index placement for the duplicated slide"),
      },
    },
    async ({ deckId, slideId, targetPosition }) =>
      json(await slideService.duplicate({ deckId, slideId, targetPosition }))
  );
}
