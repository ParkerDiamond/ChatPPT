# Changelog

All notable changes to ChatPPT will be documented in this file.

## [0.1.4] - 2026-09-23

### Security
- Reject image paths that resolve outside the workspace, including symlink escapes.
- Bound image file reads and element request payload sizes.
- Upgrade Vitest to resolve the reported npm security advisory.

## [0.1.0] - 2026-09-07

### Added
- **MCP Server Architecture**: Programmatic stdio Model Context Protocol (MCP) server for PowerPoint presentation creation and editing.
- **Standalone Package & CLI**: Executable Node.js binary entry (`bin: chatppt`) with `--workspace <path>` and `CHATPPT_WORKSPACE_ROOT` support.
- **Deck Management (`deck_*`)**: `deck_create`, `deck_list`, `deck_read`, `deck_update` (with optimistic revision concurrency control), `deck_delete`, and `deck_validate` diagnostic tool.
- **Slide Management (`slide_*`)**: Vectorized `slide_create`, `slide_list`, `slide_read`, `slide_update`, `slide_delete`, `slide_move` (array or position based), and `slide_duplicate`.
- **Slide Collection Management (`slide_collection_*`)**: `slide_collection_create`, `slide_collection_list`, `slide_collection_read`, `slide_collection_update`, and `slide_collection_delete`.
- **Slide Element Management (`element_*`)**: Vectorized batch operations for `element_create` (text, preset shape, line, table, chart, image), `element_list`, `element_read`, `element_update` (position, size, text, fill, font family, font size, bold, italic, text color, stroke, align), `element_delete`, and `element_reorder`.
- **Security & Workspace Isolation**: Strict subpath enforcement preventing directory traversal and workspace escapes.
- **Package & Automated Testing**: Integrated unit tests and end-to-end MCP client package smoke testing against built npm artifacts.
