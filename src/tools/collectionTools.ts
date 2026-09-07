import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { collectionService } from "../domain/collectionService.js";

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export function registerCollectionTools(server: McpServer): void {
  server.registerTool(
    "slide_collection_create",
    {
      description: "Create a named ordered collection/group of existing slides within a presentation deck.",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        name: z.string().min(1).max(200).describe("Collection name"),
        description: z.string().max(1000).optional().describe("Optional description"),
        slideIds: z
          .array(z.string().uuid())
          .default([])
          .describe("Ordered list of slide IDs belonging to this collection"),
      },
    },
    async ({ deckId, name, description, slideIds }) =>
      json({ collection: await collectionService.create({ deckId, name, description, slideIds }) })
  );

  server.registerTool(
    "slide_collection_list",
    {
      description: "List all slide collections in a presentation deck.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
      },
    },
    async ({ deckId }) => json({ collections: await collectionService.list(deckId) })
  );

  server.registerTool(
    "slide_collection_read",
    {
      description: "Read details and slide ID membership of a specific slide collection.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideCollectionId: z.string().uuid().describe("Stable ID of the slide collection"),
      },
    },
    async ({ deckId, slideCollectionId }) =>
      json({ collection: await collectionService.read(deckId, slideCollectionId) })
  );

  server.registerTool(
    "slide_collection_update",
    {
      description: "Rename a slide collection, update its description, or replace its ordered slide membership.",
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideCollectionId: z.string().uuid().describe("Stable ID of the slide collection"),
        name: z.string().min(1).max(200).optional().describe("New collection name"),
        description: z.string().max(1000).optional().describe("New collection description"),
        slideIds: z
          .array(z.string().uuid())
          .optional()
          .describe("Replacement ordered list of slide IDs"),
      },
    },
    async ({ deckId, slideCollectionId, name, description, slideIds }) =>
      json({ collection: await collectionService.update({ deckId, slideCollectionId, name, description, slideIds }) })
  );

  server.registerTool(
    "slide_collection_delete",
    {
      description: "Delete a slide collection without deleting its referenced slides.",
      annotations: { destructiveHint: true },
      inputSchema: {
        deckId: z.string().uuid().describe("Stable ID of the presentation deck"),
        slideCollectionId: z.string().uuid().describe("Stable ID of the slide collection to delete"),
      },
    },
    async ({ deckId, slideCollectionId }) =>
      json({ deleted: await collectionService.delete(deckId, slideCollectionId) })
  );
}
