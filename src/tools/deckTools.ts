import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { deckService } from "../domain/deckService.js";

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export function registerDeckTools(server: McpServer): void {
  server.registerTool(
    "deck_create",
    {
      description: "Create a new blank PowerPoint presentation deck and initialize its metadata in the managed workspace.",
      inputSchema: {
        title: z.string().min(1).max(200).optional().describe("Title for the new presentation deck"),
      },
    },
    async ({ title }) => json(await deckService.create({ title }))
  );

  server.registerTool(
    "deck_list",
    {
      description: "List all managed PowerPoint decks in the workspace.",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => json({ decks: await deckService.list() })
  );

  server.registerTool(
    "deck_read",
    {
      description: "Read metadata, slide list, and slide collections for a specific deck.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the deck"),
      },
    },
    async ({ deckId }) => json({ deck: await deckService.read(deckId) })
  );

  server.registerTool(
    "deck_update",
    {
      description: "Update metadata or title of an existing presentation deck.",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the deck"),
        title: z.string().min(1).max(200).describe("New title for the deck"),
        expectedRevision: z.number().int().positive().optional().describe("Expected deck revision for optimistic concurrency check"),
      },
    },
    async ({ deckId, title, expectedRevision }) =>
      json({ deck: await deckService.update({ deckId, title, expectedRevision }) })
  );

  server.registerTool(
    "deck_delete",
    {
      description: "Permanently delete a presentation deck and its underlying PowerPoint file.",
      annotations: { destructiveHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the deck to delete"),
      },
    },
    async ({ deckId }) => json({ deleted: await deckService.delete(deckId) })
  );

  server.registerTool(
    "deck_validate",
    {
      description: "Validate presentation deck integrity, checking PPTX file synchronization, collection slide references, and element geometry.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the deck to validate"),
      },
    },
    async ({ deckId }) => json(await deckService.validate(deckId))
  );
}
