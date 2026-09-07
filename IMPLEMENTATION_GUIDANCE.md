# ChatPPT MCP Implementation Guidance

## Objective

Continue evolving ChatPPT as a local-first, VS Code-compatible stdio MCP server for programmatic PowerPoint creation and editing.

### Status Overview
- **Completed**: Sections 1–25, 27–29 (Architecture, Refactoring, Dual Storage, Invariants, Batch/Vectorized Tools, Optimistic Revisioning, Testing, Move/Duplicate, Typography/Stroke, Images/Icons).
- **Pending / Future**: Section 26 (`slide_render` / `deck_render_preview` visual rendering support).

The existing architecture is fundamentally sound and should be retained:

* TypeScript / Node 20+
* `@modelcontextprotocol/server` v2
* Zod v4 schemas
* `@office-kit/pptx` as the PowerPoint document engine
* stdio transport for VS Code
* `.pptx` files under `presentations/`
* ChatPPT metadata under `.chatppt/registry.json`
* stable IDs for decks, slides, collections, and elements

Do **not** redesign this as an HTTP service or replace the explicit MCP tool surface with a generic action API.

---

# 1. Preserve the Existing MCP Architecture [x] Completed

The MCP server should remain a thin interface over the actual presentation/domain implementation.

Conceptually:

```text
VS Code / MCP Client
        │
        ▼
MCP stdio transport
        │
        ▼
MCP tool registrations
        │
        ▼
Domain/service layer
        │
        ▼
Presentation + storage layer
        │
        ├── presentations/<deckId>.pptx
        └── .chatppt/registry.json
```

The majority of application behavior should not live directly inside `registerTool()` callbacks.

---

# 2. Refactor `src/index.ts` [x] Completed

The current `src/index.ts` contains server setup, tool registrations, and handlers. Split these responsibilities before adding substantially more functionality.

Recommended structure:

```text
src/
├── index.ts
├── server.ts
│
├── tools/
│   ├── deck.ts
│   ├── slide.ts
│   ├── collection.ts
│   └── element.ts
│
├── domain/
│   ├── models.ts
│   ├── deckService.ts
│   ├── slideService.ts
│   ├── collectionService.ts
│   └── elementService.ts
│
└── storage/
    ├── registry.ts
    └── presentationStore.ts
```

The exact filenames are flexible; the separation is not.

Tool handlers should ideally look approximately like:

```ts
server.registerTool(
  "slide_create",
  slideCreateDefinition,
  args => slideService.create(args)
);
```

MCP handlers should be responsible for:

* MCP schema definition
* MCP-facing descriptions
* input validation
* invoking the appropriate domain operation
* translating domain results/errors into MCP results

They should not directly contain substantial PPTX manipulation or persistence logic.

---

# 3. Use the Current stdio MCP Entry Point [x] Completed

For the current MCP SDK, prefer the v2 stdio helper:

```ts
serveStdio(() => createServer());
```

rather than manually wiring the server to a `StdioServerTransport` unless there is a specific compatibility reason to do so.

Ensure the server never writes ordinary logs to stdout.

stdout is reserved for MCP protocol communication.

Use stderr or an appropriate logger configured for stderr:

```ts
console.error("...");
```

---

# 4. Treat Stable IDs as Fundamental [x] Completed

Stable identifiers are one of the most important parts of the ChatPPT abstraction.

Continue using stable IDs for:

* decks
* slides
* slide collections
* elements

Do not make mutable positions the primary identity of an object.

For example:

```json
{
  "slideId": "slide_K8FX2",
  "position": 5
}
```

`slideId` identifies the slide.

`position` describes its current location.

Mutations should therefore generally use:

```json
{
  "slideId": "slide_K8FX2"
}
```

rather than:

```json
{
  "position": 5
}
```

The exception is an explicitly positional operation such as:

```text
slide_move(slideId, newPosition)
```

Apply the same principle to elements and z-order.

---

# 5. Clarify the Dual Storage Model [x] Completed

ChatPPT currently stores:

```text
presentations/<deckId>.pptx
```

and:

```text
.chatppt/registry.json
```

These have different responsibilities.

Treat the conceptual model as:

```text
PPTX
    canonical Office presentation content

Registry
    ChatPPT identity and domain metadata
        ├── stable IDs
        ├── collections
        ├── mappings
        └── ChatPPT-only metadata
```

Slide collections are particularly important here because they are ChatPPT domain concepts rather than ordinary PowerPoint slide content.

Document this distinction explicitly.

---

# 6. Address Cross-File Consistency [x] Completed

Atomic replacement of a `.pptx` file does not make an operation involving both the PPTX and registry transactional.

A failure sequence such as:

```text
PPTX updated
    ↓
process terminates
    ↓
registry not updated
```

can leave ChatPPT in an inconsistent state.

The reverse can also happen.

Design persistence operations around this risk.

At minimum:

* validate both representations before committing
* write temporary representations first
* minimize the interval between commits
* detect inconsistencies on load
* fail with actionable errors rather than silently continuing
* make reconstructable metadata reconstructable where practical

Longer-term, investigate whether stable ChatPPT IDs can safely be embedded into the PowerPoint document itself through facilities exposed by `@office-kit/pptx`.

Do not make that a prerequisite for current development if the library does not provide an appropriate mechanism.

---

# 7. Audit `slide_delete` [x] Completed

Verify the current implementation carefully.

The documented behavior currently says that `slide_delete`:

* deletes the registry slide
* removes references from slide collections

It must also remove the actual slide from the `.pptx`.

The logical operation should be:

```text
slide_delete
    │
    ├── remove PPTX slide
    ├── remove registry slide
    └── remove collection references
```

These should behave as one logical mutation.

Audit the other mutation tools for equivalent PPTX/registry synchronization issues.

---

# 8. Keep Explicit CRUD Tools [x] Completed

Do not collapse the API into generic tools such as:

```text
slide_action(action, ...)
```

Keep explicit tools such as:

```text
deck_create
deck_list
deck_read
deck_update
deck_delete

slide_create
slide_list
slide_read
slide_update
slide_delete

slide_collection_create
slide_collection_list
slide_collection_read
slide_collection_update
slide_collection_delete

element_create
element_list
element_read
element_update
element_delete
element_reorder
```

Explicit tools give the LLM:

* clearer intent boundaries
* better descriptions
* tighter argument schemas
* fewer ambiguous tool choices

The current tool naming convention is predictable and should be retained.

---

# 9. Make Existing Mutation Tools Batch-Capable [x] Completed

Do **not** introduce parallel APIs such as:

```text
element_batch_create
element_batch_update
element_batch_delete
```

unless a future operation has genuinely different semantics.

Instead, vectorize the existing APIs.

## Creation

Prefer:

```json
{
  "deckId": "deck_123",
  "slideId": "slide_456",
  "elements": [
    {
      "type": "textbox",
      "x": 0.7,
      "y": 0.5,
      "w": 6.0,
      "h": 0.6,
      "text": "Q3 Results"
    },
    {
      "type": "chart",
      "x": 0.7,
      "y": 1.5,
      "w": 5.0,
      "h": 3.8,
      "data": {}
    }
  ]
}
```

The same `element_create` tool should support creating one or many elements.

## Update

Prefer:

```json
{
  "deckId": "deck_123",
  "slideId": "slide_456",
  "updates": [
    {
      "elementId": "element_A",
      "text": "Revenue"
    },
    {
      "elementId": "element_B",
      "x": 2.1,
      "y": 3.4
    }
  ]
}
```

## Delete

Prefer:

```json
{
  "deckId": "deck_123",
  "slideId": "slide_456",
  "elementIds": [
    "element_A",
    "element_B",
    "element_C"
  ]
}
```

---

# 10. Prefer Consistent Array-Based Schemas [x] Completed

Avoid schemas such as:

```ts
element: Element | Element[]
```

The schema should not change shape depending on cardinality.

Prefer:

```ts
elements: Element[]
```

even when creating only one element:

```json
{
  "elements": [
    {
      "type": "textbox",
      "text": "Hello"
    }
  ]
}
```

This makes tool calls more predictable for both models and implementation code.

Apply this principle to other vectorized operations where appropriate.

---

# 11. Batch Semantics Should Default to Atomic [x] Completed

Mutation batches should initially use all-or-nothing semantics.

For example:

```text
element_create with 8 elements

all 8 valid
    → commit

one invalid
    → commit nothing
```

Avoid partial success unless there is a compelling use case.

Partial mutation creates difficult recovery behavior for agents:

```text
8 requested
6 created
2 failed
```

The model must then discover and reason about partially changed state.

Atomic behavior instead allows:

```text
request
    ↓
validation failure
    ↓
no mutation
    ↓
correct request
    ↓
retry
```

This is much easier for an LLM to handle reliably.

A future API could support:

```ts
mode: "atomic" | "best_effort"
```

but do not add `best_effort` until there is a concrete need.

---

# 12. Add Client Correlation IDs Where Useful [x] Completed

Batch creation benefits from allowing callers to correlate requested objects with generated stable IDs.

For example:

```json
{
  "elements": [
    {
      "clientId": "title",
      "type": "textbox",
      "text": "Q3 Results"
    },
    {
      "clientId": "revenue-chart",
      "type": "chart"
    }
  ]
}
```

Response:

```json
{
  "created": [
    {
      "clientId": "title",
      "elementId": "element_ABC"
    },
    {
      "clientId": "revenue-chart",
      "elementId": "element_DEF"
    }
  ]
}
```

`clientId` should be optional and scoped only to the request. It is not a replacement for the server-generated stable ID.

This can substantially improve agent ergonomics during complex slide construction.

---

# 13. Vectorize Operations Selectively [x] Completed

The general rule should be:

```text
Create
    → arrays are useful

Update
    → arrays are useful

Delete
    → arrays are useful

Read
    → optionally support multiple IDs

List
    → already naturally returns multiple records

Reorder
    → prefer expressing desired final order
```

Reordering deserves special treatment.

Avoid batches such as:

```json
{
  "moves": [
    { "slideId": "A", "position": 2 },
    { "slideId": "B", "position": 4 }
  ]
}
```

because sequential position mutations can have ambiguous semantics.

Prefer APIs that declare final order where appropriate:

```json
{
  "slideOrder": [
    "slide_A",
    "slide_C",
    "slide_B"
  ]
}
```

For simple movement, an explicit:

```text
slide_move(slideId, newPosition)
```

is also acceptable.

---

# 14. Use Structured MCP Results [x] Completed

Mutation tools should return structured data rather than relying primarily on prose such as:

```text
Slide created successfully.
```

Prefer:

```json
{
  "created": [
    {
      "slideId": "slide_ABC",
      "position": 3
    }
  ]
}
```

Likewise, element creation should return generated element IDs.

Use MCP `structuredContent` and appropriate output schemas where practical.

Human-readable `content` can still be supplied, but structured results should contain the information an agent will need for subsequent calls.

---

# 15. Improve Tool Descriptions [x] Completed

Tool descriptions are part of the agent-facing API.

Avoid minimal descriptions such as:

```text
Update a slide.
```

Prefer descriptions that explain semantic boundaries:

```text
Update metadata or properties of one or more existing slides.
Use element_update to modify individual text boxes, images,
shapes, charts, tables, or other slide elements.
```

Descriptions should help the model answer:

* when should I use this tool?
* when should I use a neighboring tool instead?
* can I submit multiple operations?
* what is mutated?
* what identifiers should I retain?

Do not rely only on tool names.

---

# 16. Keep Zod Schemas Specific [x] Completed

Avoid generic payloads such as:

```ts
data: z.record(z.any())
```

Prefer strongly typed schemas with descriptions:

```ts
z.object({
  deckId: z.string()
    .describe("Stable ID of the deck"),

  slideId: z.string()
    .describe("Stable ID of the slide containing the element"),

  updates: z.array(
    ElementUpdateSchema
  ).min(1)
});
```

Schemas should communicate as much of the API contract as possible.

---

# 17. Use MCP Tool Annotations Appropriately [x] Completed

Add MCP behavioral annotations where supported.

Examples:

```text
deck_list
deck_read
slide_list
slide_read
element_list
element_read
    → readOnlyHint: true
```

Destructive operations such as:

```text
deck_delete
slide_delete
element_delete
```

should be annotated appropriately with `destructiveHint`.

Use `idempotentHint` only where the actual semantics justify it.

Do not use MCP annotations to communicate batching.

Batch behavior belongs in:

* the input schema
* the tool description
* the output schema

Annotations describe behavioral characteristics of the tool, not its cardinality.

---

# 18. Consider Optimistic Concurrency [x] Completed

Introduce or design toward a deck revision/version number.

Example:

```json
{
  "deckId": "deck_123",
  "revision": 17
}
```

Mutation operations could optionally accept:

```json
{
  "expectedRevision": 17
}
```

If the deck changed since it was read:

```json
{
  "error": "revision_conflict",
  "expectedRevision": 17,
  "currentRevision": 19
}
```

This prevents stale agent operations from silently overwriting newer state.

This is particularly useful if:

* multiple MCP clients access the workspace
* an agent makes concurrent calls
* a human edits a presentation between agent operations

It does not need to block other near-term work, but the persistence model should not make it difficult to introduce later.

---

# 19. Define and Enforce Domain Invariants [x] Completed

At minimum, enforce these invariants:

```text
Every registered deck has a corresponding PPTX.

Every registered slide corresponds to an actual PPTX slide.

Every element belongs to an existing slide.

Every collection belongs to an existing deck.

Every slide ID referenced by a collection belongs to that deck.

Stable IDs are unique within their required scope.

Registry slide ordering matches PPTX slide ordering.

Element ordering/z-order is consistent with the PPTX representation.

Geometry values are finite numbers.

Element width and height are positive.

Deleted objects cannot remain referenced by other registry objects.
```

Centralize these checks rather than scattering them throughout MCP handlers.

---

# 20. Add `deck_validate` [x] Completed

Introduce a non-destructive validation operation:

```text
deck_validate
```

It should check consistency between:

* PPTX contents
* registry metadata
* slide ordering
* element identities
* collection references
* supported geometry/state invariants

Return structured diagnostics.

Example:

```json
{
  "valid": false,
  "issues": [
    {
      "code": "MISSING_SLIDE",
      "slideId": "slide_XYZ",
      "message": "Registry slide has no corresponding PPTX slide."
    }
  ]
}
```

A future `deck_repair` tool may be useful, but keep validation and mutation separate.

---

# 21. Prioritize Tests Before Large Feature Expansion [x] Completed

Before significantly expanding formatting support, add automated tests.

## Unit tests

Cover:

* registry operations
* stable ID behavior
* path resolution
* collection membership
* validation
* geometry/schema rules
* persistence helpers

## Integration tests

Use fixture `.pptx` files and exercise realistic workflows.

At minimum:

```text
create deck
    ↓
create multiple slides
    ↓
create multiple elements
    ↓
update elements
    ↓
reorder elements
    ↓
move slides
    ↓
delete slides/elements
    ↓
save
    ↓
reopen PPTX
    ↓
reload registry
    ↓
verify IDs/order/content
```

Also test failure cases and verify failed atomic batches leave both the PPTX and registry unchanged.

---

# 22. Recommended Near-Term Feature Order [x] Completed

Prioritize approximately:

1. Persistence correctness and consistency auditing
2. Automated tests
3. Vectorized create/update/delete operations
4. Slide move and duplicate
5. Typography and stroke formatting
6. Images and icons
7. Validation tooling
8. Visual preview/render support

Do not interpret this as requiring every item to be completed before the next one starts. Correctness and tests should simply precede large increases in mutation complexity.

---

# 23. Add Slide Move and Duplicate [x] Completed

Add:

```text
slide_move
slide_duplicate
```

using the appropriate `@office-kit/pptx` utilities.

`slide_move` should preserve the stable slide ID.

`slide_duplicate` should generate:

* a new stable slide ID
* new stable element IDs for duplicated elements

Do not reuse element IDs between the original and duplicate.

Collection membership semantics for duplication should be explicitly defined rather than inferred.

---

# 24. Expand Element Styling [x] Completed

Extend `element_update` rather than creating separate tools for every style property.

Add support for applicable properties such as:

* font family
* font size
* bold
* italic
* text color
* fill color
* stroke color
* stroke width
* alignment
* other supported text/shape formatting

Use `setShapeRunFormat`, `setShapeStroke`, and other appropriate `@office-kit/pptx` capabilities.

Maintain type-specific schemas where properties are not universally applicable.

---

# 25. Add Images and Icons [x] Completed

Extend element creation to support image/icon elements using the appropriate `@office-kit/pptx` image APIs.

Support:

* file-based images where safe and appropriate
* format detection
* dimensions and positioning
* stable element IDs
* subsequent update/delete behavior

Be explicit about workspace path restrictions and avoid arbitrary filesystem access outside the managed workspace unless intentionally supported.

---

# 26. Consider Visual Feedback [ ] Pending / Future

A presentation-generation agent benefits greatly from being able to inspect what it created.

Investigate a future operation such as:

```text
slide_render
```

or:

```text
deck_render_preview
```

that produces a visual representation suitable for inspection.

The ideal editing loop becomes:

```text
construct slide
    ↓
render preview
    ↓
inspect
    ↓
batch update elements
    ↓
render again
```

This is likely to provide more agent capability than continually expanding low-level CRUD operations alone.

---

# 27. Maintain Primitive and Agent-Friendly Operations Together [x] Completed

Do not remove low-level operations.

The long-term API should support both:

```text
Primitive editing

element_create
element_update
element_delete
element_reorder
```

and efficient higher-level behavior through vectorization and selected semantic operations.

For example, creating a slide with ten elements should not require ten separate MCP round trips if all ten elements are already known.

The goal is not to hide PowerPoint structure from the agent.

The goal is to let the agent manipulate that structure efficiently.

---

# 28. Distribution Is Separate From Runtime Architecture [x] Completed

The current development workflow:

```text
clone repository
    ↓
npm install
    ↓
npm run build
    ↓
VS Code reads .vscode/mcp.json
    ↓
node dist/index.js
```

is appropriate for repository development.

Do not confuse `.vscode/mcp.json` with the final product packaging mechanism.

For eventual distribution, design toward a package/executable that VS Code can register and launch directly, for example:

```text
npx <published-package>
```

The internal architecture should not depend on the repository having been manually built from source.

This packaging work can happen independently of the core MCP/domain implementation.

---

# 29. Overall Design Principle [x] Completed

ChatPPT should be treated as:

```text
PowerPoint editing engine
        +
stable ChatPPT document model
        +
thin MCP interface
```

not as:

```text
a collection of MCP callbacks that happen to edit PPTX files
```

Keep the presentation/domain implementation independently testable and reusable.

MCP should remain the adapter that exposes that capability to VS Code and other MCP clients.

---

# Definition of Success

The implementation is moving in the right direction when an agent can reliably perform a workflow such as:

```text
Create deck
    ↓
Create 8 slides in one call
    ↓
Create 5–10 elements per slide efficiently
    ↓
Receive stable IDs for everything created
    ↓
Read selected objects
    ↓
Batch-update formatting and positioning
    ↓
Move/duplicate slides
    ↓
Validate the deck
    ↓
Save/reload
    ↓
Continue editing using the same stable IDs
```

without:

* inconsistent registry/PPTX state
* excessive MCP round trips
* positional identity ambiguity
* partially applied failed batches
* generic/untyped payloads
* substantial business logic inside MCP registration handlers

The existing ChatPPT architecture should therefore be **evolved rather than replaced**. The highest-value immediate work is correctness, separation of concerns, batch-capable schemas, structured results, and automated testing.
