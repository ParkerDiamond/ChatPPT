#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
import { parseWorkspaceArgFromArgs, setWorkspaceRoot } from "./storage/registry.js";

async function main(): Promise<void> {
  const wsArg = parseWorkspaceArgFromArgs(process.argv);
  if (wsArg) {
    setWorkspaceRoot(wsArg);
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("ChatPPT Server Error:", error);
  process.exitCode = 1;
});
