# ChatPPT Agent Guide

## Project Purpose

ChatPPT is an MCP server that lets a connected LLM create, inspect, modify, and delete PowerPoint decks, slide collections, and individual slides. Use the `@office-kit/pptx` library as the primary PowerPoint document API.

## Core Design Rules

- Treat the deck as the source of truth. Tool responses must describe the state persisted after the requested operation.
- Give every deck, slide collection, and slide a stable opaque ID. Do not expose array indexes as identifiers.
- Keep tools resource-oriented and small. Prefer separate CRUD tools to a single action-dispatch tool.
- Make destructive operations explicit. Require a resource ID, return what was deleted, and never delete adjacent resources implicitly.
- Validate all tool inputs at the MCP boundary using a runtime schema library.
- Return compact, structured JSON. Put large artifacts such as rendered previews behind MCP resources or explicit read tools.
- Preserve unknown PowerPoint content when editing a deck. Do not reconstruct unaffected slides or shapes unnecessarily.
- Use transactions or write-to-temp-and-rename semantics for deck writes. Never leave a partially written `.pptx` file at the target path.

## MCP Contract Conventions

- Name tools as `<resource>_<verb>`, for example `deck_create`, `slide_read`, and `slide_collection_delete`.
- Inputs use camelCase; IDs use `<resource>Id` such as `deckId` and `slideId`.
- Mutation responses include the mutated resource and its parent identifiers.
- Reads accept an optional field projection or detail level when the payload could be large.
- Report expected operational problems as structured tool errors with stable codes, including `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `UNSUPPORTED_CONTENT`, and `IO_ERROR`.
- Define slide ordering with `position`, a zero-based index only for placement and display. IDs remain authoritative.

## PowerPoint Editing Rules

- Use `@office-kit/pptx` APIs instead of editing OOXML ZIP entries directly unless the library lacks a required capability.
- Centralize library adaptation in a PowerPoint gateway module so tool handlers do not depend on library-specific object shapes.
- Use a normalized internal model for deck metadata, slide summaries, elements, notes, and collections.
- Preserve slide dimensions, themes, layouts, master references, notes, media, and relationships whenever supported by the library.
- Validate references before mutation: a slide belongs to its supplied deck, destination positions are in range, and collection membership contains unique slide IDs.
- For content updates, support targeted operations such as replacing text, adding/removing shapes, moving elements, and changing styles rather than requiring full-slide replacement.

## Suggested Code Boundaries

- `src/server`: MCP transport, server initialization, registration.
- `src/tools`: input schemas and thin handlers, grouped by deck, collection, slide, and element.
- `src/domain`: normalized models, IDs, errors, and use-case services.
- `src/pptx`: `@office-kit/pptx` gateway, conversion, import/export, and atomic persistence.
- `src/storage`: workspace path resolution, deck registry, and optional metadata persistence.
- `src/resources`: MCP resources for previews, deck files, and larger read-only payloads.
- `tests`: unit tests for domain services and schemas, integration tests using fixture `.pptx` files, and MCP contract tests.

## Quality Bar

- Add or update focused tests for each behavior change.
- Ensure validation errors identify the input path and expected shape without leaking local filesystem details.
- Keep filesystem access within a configured workspace root; reject traversal and arbitrary absolute paths.
- Use deterministic fixture files and stable IDs in tests where practical.
- Run formatting, type checking, unit tests, and the focused integration test suite before considering a change complete.

## Documentation Expectations

- Document every MCP tool with purpose, input schema, response schema, side effects, and error codes.
- Keep the tool contract and project outline synchronized when adding or changing resource operations.
- Record gaps in `@office-kit/pptx` support and the selected fallback rather than silently omitting requested functionality.