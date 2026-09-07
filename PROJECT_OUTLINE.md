# ChatPPT Project Outline

## 1. Goal

Build a local-first MCP server that enables an LLM to manage PowerPoint presentations through safe, structured tools. The server uses `@office-kit/pptx` to read and write `.pptx` files while exposing deck-, collection-, and slide-level CRUD operations.

## 2. Users and Primary Workflows

The connected LLM should be able to:

1. Create a blank deck, set its metadata and dimensions, then add a slide sequence.
2. Inspect a deck’s metadata, slide order, content summaries, notes, and supported shape details.
3. Update an existing deck or slide without disturbing unrelated content.
4. Organize named slide collections such as a campaign section, review set, or reusable sequence.
5. Delete a single slide, a collection, or an entire deck deliberately.
6. Export or retrieve the generated `.pptx` artifact and optional rendered previews.

## 3. Resource Model

### Deck

```ts
type Deck = {
  id: string;
  fileName: string;
  title?: string;
  subject?: string;
  author?: string;
  layout: { width: number; height: number; unit: "in" | "pt" | "emu" };
  slideIds: string[];
  collectionIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

### Slide

```ts
type Slide = {
  id: string;
  deckId: string;
  position: number;
  layout?: string;
  background?: Background;
  elements: SlideElement[];
  speakerNotes?: string;
};
```

### Slide Collection

A named, ordered group of slide references within one deck. Collections never own slides; deleting a collection removes only the grouping, while deleting a slide removes it from all collections in that deck.

```ts
type SlideCollection = {
  id: string;
  deckId: string;
  name: string;
  description?: string;
  slideIds: string[];
};
```

`SlideElement` starts with text, shape, image, table, chart, and group summaries. It should retain an `id`, geometry, style, and type-specific properties so update tools can target a single element.

## 4. MCP Tools

### Decks

| Tool | Purpose |
| --- | --- |
| `deck_create` | Create and persist a new deck. |
| `deck_list` | List available decks and compact metadata. |
| `deck_read` | Read deck metadata, slide order, and optional detail. |
| `deck_update` | Update metadata, dimensions, or deck-level settings. |
| `deck_delete` | Delete a deck and its managed artifacts. |
| `deck_export` | Return a resource reference for the `.pptx` file. |

### Slides

| Tool | Purpose |
| --- | --- |
| `slide_create` | Add a slide at a position using a blank or named layout. |
| `slide_list` | List slides in deck order with summaries. |
| `slide_read` | Read one slide and its supported elements. |
| `slide_update` | Change layout, background, notes, or targeted elements. |
| `slide_move` | Reposition a slide within its deck. |
| `slide_delete` | Delete one slide and remove its collection references. |
| `slide_duplicate` | Copy a slide to a specified position. |

### Slide Collections

| Tool | Purpose |
| --- | --- |
| `slide_collection_create` | Create a named ordered collection of existing slides. |
| `slide_collection_list` | List collections for a deck. |
| `slide_collection_read` | Read a collection and its slide summaries. |
| `slide_collection_update` | Rename a collection or replace/reorder membership. |
| `slide_collection_delete` | Remove the collection without deleting its slides. |

### Slide Elements

Element tools are a second milestone, but the data model should support them from the start:

`element_create`, `element_read`, `element_update`, `element_delete`, and `element_reorder`.

## 5. Architecture

```mermaid
flowchart LR
  LLM[Connected LLM] --> MCP[MCP Server]
  MCP --> Tools[Tool Handlers and Schemas]
  Tools --> Domain[Deck and Slide Services]
  Domain --> Gateway[PowerPoint Gateway]
  Gateway --> OfficeKit[@office-kit/pptx]
  Gateway --> Storage[Workspace Storage]
  MCP --> Resources[MCP Resources]
  Resources --> Storage
```

The PowerPoint gateway owns all `@office-kit/pptx` interactions. Domain services enforce resource ownership, ordering, collection integrity, and mutation semantics. Tool handlers only parse inputs, call a service, and serialize MCP responses.

## 6. Persistence and Safety

- Configure a single workspace root for managed presentations.
- Maintain a registry mapping deck IDs to sanitized relative `.pptx` paths; do not use a client-supplied path as authority.
- Store server-managed metadata needed for stable IDs when the PowerPoint format does not preserve them directly.
- Use a per-deck write lock and atomic save strategy to prevent concurrent mutations from corrupting a presentation.
- Enforce file size, slide count, image size, and tool payload limits.
- Make deletion irreversible only after a clear tool request; optional trash/restore support can be added later.

## 7. Error Model

All tools return a structured error containing a stable `code`, human-readable `message`, and optional input `path` or resource context. Do not return stack traces to the LLM.

| Code | Meaning |
| --- | --- |
| `VALIDATION_ERROR` | Input is malformed or out of allowed bounds. |
| `NOT_FOUND` | Requested resource does not exist. |
| `CONFLICT` | Version, lock, or ordering conflict prevents mutation. |
| `UNSUPPORTED_CONTENT` | Requested PowerPoint feature is not supported by the gateway. |
| `IO_ERROR` | Managed-file read or write failed. |

## 8. Current Implementation

The repository is configured as a VS Code stdio MCP server in `.vscode/mcp.json`. Its TypeScript entry point registers concrete tools through the official `@modelcontextprotocol/server` SDK:

- Decks: `deck_create`, `deck_list`, `deck_read`, `deck_update`, and `deck_delete`.
- Slides: `slide_create`, `slide_list`, `slide_read`, `slide_update`, and `slide_delete`.
- Collections: `slide_collection_create`, `slide_collection_list`, `slide_collection_read`, `slide_collection_update`, and `slide_collection_delete`.
- Elements: `element_create`, `element_list`, `element_read`, `element_update`, `element_delete`, and `element_reorder`.

The managed workspace stores generated presentations under `presentations/` and stable server metadata in `.chatppt/registry.json`. The server requires Node 20+ and npm. Run `npm install`, then `npm run build`; VS Code launches `dist/index.js` through the configured MCP server entry.

## 9. Delivery Plan

1. Scaffold the TypeScript MCP server, configuration, logging, workspace storage, schemas, and error envelope.
2. Implement deck CRUD and file export with atomic persistence.
3. Implement slide CRUD, ordering, duplication, and deck consistency checks.
4. Implement collection CRUD and membership cleanup on slide deletion.
5. Implement supported element CRUD, starting with text boxes and basic shapes.
6. Add preview resources, integration fixtures, contract tests, and capability documentation.

## 10. Early Technical Validation

Before committing to the tool contract, create a small spike against `@office-kit/pptx` that proves:

1. Creating, saving, and reopening a deck works.
2. Slides, text, shapes, images, notes, layouts, and ordering can be read and changed as required.
3. Existing decks retain unsupported or untouched PowerPoint content after a targeted edit.
4. Any library limitations have a documented fallback or an explicitly unsupported tool behavior.

This spike is the gate for moving from scaffolding to production CRUD behavior.