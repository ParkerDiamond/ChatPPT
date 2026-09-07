# ChatPPT Implementation Notes

This repository is a stdio MCP server built with the official TypeScript SDK:

- https://github.com/modelcontextprotocol/typescript-sdk
- https://ts.sdk.modelcontextprotocol.io/v2/
- https://office-kit.github.io/pptx/llms-full.txt

Register LLM-facing operations using `McpServer.registerTool`. Keep handlers thin, validate their inputs with Zod, and put PowerPoint file mutations behind the project gateway. The project uses `@office-kit/pptx` for PowerPoint document access.