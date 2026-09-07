# ChatPPT

**ChatPPT** is a Model Context Protocol (MCP) server for programmatic, AI-assisted PowerPoint creation and editing. Built on Node.js 20+ and `@office-kit/pptx`, ChatPPT exposes a safe, structured, resource-oriented CRUD API over stdio for connected LLMs in Visual Studio Code and other MCP-compatible clients.

---

## Key Features

- **Stable Opaque IDs**: Every presentation deck, slide, slide collection, and slide element is tracked with a stable UUID.
- **Dual Storage Model**:
  - Presentation files are stored under `presentations/<deckId>.pptx`.
  - Server metadata, slide collections, and element mapping are tracked in `.chatppt/registry.json`.
- **Atomic Operations & Consistency**: All file writes use temporary files and atomic renames to prevent partial file corruption.
- **Vectorized / Batch Operations**: Create, update, or delete multiple slides or elements in a single tool call to optimize LLM interactions.
- **Rich Elements**: Create and update text boxes, preset shapes (180+ DrawingML geometries), lines, tables, charts (column, bar, line, pie, doughnut, area), and images.
- **Full Typography & Styling**: Custom fonts, font sizes, bold, italic, text colors, fills, borders/strokes, alignment, and z-index ordering.

---

## Installing & Configuring in VS Code

### Option 1: Workspace MCP Configuration (`.vscode/mcp.json`)

To use ChatPPT in your VS Code workspace, add or update `.vscode/mcp.json` in the root of your workspace:

```json
{
  "servers": {
    "chatppt": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"]
    }
  }
}
```

### Option 2: Published Package or `npx` Execution

When running via `npx` or published binary, ChatPPT can be configured to target a specific workspace using the `--workspace` flag or environment variables:

```json
{
  "servers": {
    "chatppt": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chatppt", "--workspace", "${workspaceFolder}"]
    }
  }
}
```

---

## Workspace Behavior & Security Boundaries

ChatPPT operates on a deterministic workspace root resolved in the following priority order:
1. Command line argument: `--workspace <path>` or `-w <path>`
2. Environment variable: `CHATPPT_WORKSPACE_ROOT` or `WORKSPACE_ROOT`
3. Fallback: `process.cwd()` (current working directory)

### Files & Directories Managed
- **Presentations**: `<workspace>/presentations/<deckId>.pptx`
- **Registry & Metadata**: `<workspace>/.chatppt/registry.json`

### Security & Trust Boundaries
- **Path Isolation**: All deck paths, temporary write buffers, and image element paths are strictly checked to ensure they reside within the configured workspace.
- **Path Traversal Protection**: Deck IDs must match `^[a-zA-Z0-9_-]+$`. Absolute paths or relative paths attempting directory traversal (`..`) outside the workspace root are caught and rejected with `ValidationError`.

---

## Known Limitations

- **Encrypted Presentations**: Encrypted or password-protected `.pptx` presentations are detected and rejected.
- **Master / Theme Layout Authoring**: Slide creation uses layouts built into the deck template; creating custom slide master themes from scratch is deferred to post-1.0.

---

## Available MCP Tools

### Deck Management (`deck_*`)
- `deck_create`: Create a new blank presentation deck.
- `deck_list`: List all managed decks in the workspace.
- `deck_read`: Read metadata and slide/collection list for a deck.
- `deck_update`: Update deck metadata (title) with optional optimistic revision check (`expectedRevision`).
- `deck_delete`: Permanently delete a deck and its `.pptx` file.
- `deck_validate`: Run diagnostic invariant checks across PPTX content and registry metadata.

### Slide Management (`slide_*`)
- `slide_create`: Add one or multiple slides in batch (supports `title` and `notes`).
- `slide_list`: List slides in presentation order with 0-based `position` indexes.
- `slide_read`: Read slide metadata and its element listing.
- `slide_update`: Update slide title and speaker notes in batch.
- `slide_delete`: Permanently delete slides and clean up collection references.
- `slide_move`: Move a slide or reorder slides by providing a `slideOrder` array.
- `slide_duplicate`: Duplicate a slide with new stable IDs for the slide and all elements.

### Slide Collection Management (`slide_collection_*`)
- `slide_collection_create`: Create a named ordered group of existing slides.
- `slide_collection_list`: List collections in a presentation.
- `slide_collection_read`: Read collection details and slide membership.
- `slide_collection_update`: Rename a collection or replace slide membership.
- `slide_collection_delete`: Delete a collection without deleting the slides.

### Slide Element Management (`element_*`)
- `element_create`: Create text boxes, preset shapes, lines, tables, charts, or images in batch (supports optional `clientId` correlation).
- `element_list`: List all elements on a slide in z-index order.
- `element_read`: Read element metadata and styling properties.
- `element_update`: Update position, size, text, fill, font, size, bold, italic, text color, stroke, and alignment in batch.
- `element_delete`: Delete elements from a slide in batch.
- `element_reorder`: Adjust element z-index (`bringToFront`, `sendToBack`, `bringForward`, `sendBackward`).

---

## Development & Testing

### Prerequisites
- Node.js >= 20
- npm >= 10

### Setup & Build
```sh
npm install
npm run build
```

### Running Tests
```sh
npm test
```

### Development Mode
```sh
npm run dev
```

---

## License

[MIT](LICENSE)
