import { McpServer } from "@modelcontextprotocol/server";
import { registerDeckTools } from "./tools/deckTools.js";
import { registerSlideTools } from "./tools/slideTools.js";
import { registerCollectionTools } from "./tools/collectionTools.js";
import { registerElementTools } from "./tools/elementTools.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "chatppt",
    version: "0.2.0",
  });

  registerDeckTools(server);
  registerSlideTools(server);
  registerCollectionTools(server);
  registerElementTools(server);

  return server;
}
