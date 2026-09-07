import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { elementService } from "../domain/elementService.js";

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export function registerElementTools(server: McpServer): void {
  server.registerTool(
    "element_create",
    {
      description: "Create one or multiple elements (text boxes, shapes, lines, tables, charts, or images) on a slide in a single batch operation.",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideId: z.string().uuid().describe("Stable ID of the slide"),
        elements: z
          .array(
            z.object({
              clientId: z.string().optional().describe("Optional request-scoped client correlation ID"),
              kind: z
                .enum(["textbox", "shape", "line", "table", "chart", "image"])
                .default("textbox")
                .describe("Element kind"),
              preset: z.string().optional().describe("Shape preset geometry (e.g. star5, roundRect, rightArrow)"),
              x: z.number().default(1).describe("Left x-coordinate in inches"),
              y: z.number().default(1).describe("Top y-coordinate in inches"),
              w: z.number().default(4).describe("Width in inches"),
              h: z.number().default(2).describe("Height in inches"),
              text: z.string().optional().describe("Text content"),
              fill: z.string().optional().describe("Solid fill color in hex format (e.g. #FF0000)"),
              fontFamily: z.string().optional().describe("Font family name (e.g. Arial, Calibri)"),
              fontSize: z.number().positive().optional().describe("Font size in points"),
              bold: z.boolean().optional().describe("Bold text flag"),
              italic: z.boolean().optional().describe("Italic text flag"),
              textColor: z.string().optional().describe("Text color in hex format"),
              strokeColor: z.string().optional().describe("Stroke border color in hex format"),
              strokeWidth: z.number().nonnegative().optional().describe("Stroke border width in points"),
              align: z.enum(["left", "center", "right", "justify"]).optional().describe("Text alignment"),
              rows: z.array(z.array(z.string())).optional().describe("2D array of string cells for tables"),
              chartSpec: z
                .object({
                  kind: z.enum(["column", "bar", "line", "pie", "doughnut", "area"]),
                  categories: z.array(z.string()),
                  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
                  title: z.string().optional(),
                })
                .optional()
                .describe("Chart specification"),
              imagePath: z.string().optional().describe("Path to image file relative to workspace root"),
            })
          )
          .min(1)
          .describe("Array of element definitions to create in batch"),
      },
    },
    async ({ deckId, slideId, elements }) => json(await elementService.create({ deckId, slideId, elements }))
  );

  server.registerTool(
    "element_list",
    {
      description: "List all visual elements on a slide in z-index order.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideId: z.string().uuid().describe("Stable ID of the slide"),
      },
    },
    async ({ deckId, slideId }) => json(await elementService.list(deckId, slideId))
  );

  server.registerTool(
    "element_read",
    {
      description: "Read details and formatting properties of a single element on a slide.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideId: z.string().uuid().describe("Stable ID of the slide"),
        elementId: z.string().uuid().describe("Stable ID of the element"),
      },
    },
    async ({ deckId, slideId, elementId }) =>
      json({ element: await elementService.read(deckId, slideId, elementId) })
  );

  server.registerTool(
    "element_update",
    {
      description: "Update positioning, sizing, text, fill, typography, stroke, or alignment for one or multiple elements on a slide in batch.",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideId: z.string().uuid().describe("Stable ID of the slide"),
        updates: z
          .array(
            z.object({
              elementId: z.string().uuid().describe("Stable ID of the element to update"),
              x: z.number().optional().describe("New left x-coordinate in inches"),
              y: z.number().optional().describe("New top y-coordinate in inches"),
              w: z.number().optional().describe("New width in inches"),
              h: z.number().optional().describe("New height in inches"),
              text: z.string().optional().describe("New text content"),
              fill: z.string().optional().describe("New fill color in hex format"),
              fontFamily: z.string().optional().describe("Font family name"),
              fontSize: z.number().positive().optional().describe("Font size in points"),
              bold: z.boolean().optional().describe("Bold text flag"),
              italic: z.boolean().optional().describe("Italic text flag"),
              textColor: z.string().optional().describe("Text color in hex format"),
              strokeColor: z.string().optional().describe("Stroke border color in hex format"),
              strokeWidth: z.number().nonnegative().optional().describe("Stroke border width in points"),
              align: z.enum(["left", "center", "right", "justify"]).optional().describe("Text alignment"),
            })
          )
          .min(1)
          .describe("Array of element updates"),
      },
    },
    async ({ deckId, slideId, updates }) => json(await elementService.update({ deckId, slideId, updates }))
  );

  server.registerTool(
    "element_delete",
    {
      description: "Permanently delete one or more elements from a slide in batch.",
      annotations: { destructiveHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideId: z.string().uuid().describe("Stable ID of the slide"),
        elementIds: z.array(z.string().uuid()).min(1).describe("Array of element IDs to delete"),
      },
    },
    async ({ deckId, slideId, elementIds }) =>
      json(await elementService.delete({ deckId, slideId, elementIds }))
  );

  server.registerTool(
    "element_reorder",
    {
      description: "Reorder an element's z-index on a slide (bringToFront, sendToBack, bringForward, sendBackward).",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideId: z.string().uuid().describe("Stable ID of the slide"),
        elementId: z.string().uuid().describe("Stable ID of the element to reorder"),
        action: z
          .enum(["bringToFront", "sendToBack", "bringForward", "sendBackward"])
          .describe("Z-order action"),
      },
    },
    async ({ deckId, slideId, elementId, action }) =>
      json(await elementService.reorder({ deckId, slideId, elementId, action }))
  );
}
