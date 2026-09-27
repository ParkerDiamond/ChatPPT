---
name: create-deck-skeleton
description: "Use when asked to create a PowerPoint deck skeleton, presentation outline, title slide, or empty titled slides from a list of topics. Creates a cover slide, an outline slide, and one title-only slide for each outline item."
---

# Create Deck Skeleton

Create a presentation structure from a user-provided title and outline using the ChatPPT MCP tools. Do not write body content for the outline-item slides.

## Workflow

1. Collect the presentation title and the ordered outline items. If either is missing or ambiguous, ask a concise question rather than inventing content. Preserve the user's wording and order.
2. Call `deck_create` with the presentation title.
3. Call `slide_create` once with slides in this order:
   - A cover slide titled with the presentation title.
   - An `Outline` slide.
   - One title-only slide for each outline item, using that item's wording as the slide title.
4. On the `Outline` slide, call `element_create` to add a text box containing the outline items in order, one item per line. Use a simple `- ` prefix for each line. Position and size the text box to fit below the slide title, within the slide canvas.
5. Call `slide_list` and confirm the slide count, order, and titles match the requested skeleton. Render the outline slide with `slide_render` and check that its list is visible. Make only necessary corrections.
6. Report the deck ID and a concise summary of the cover, outline, and title-only slides created.

## Constraints

- Keep each outline-item slide empty apart from its title.
- Do not add or infer extra sections, body text, speaker notes, images, or styling unless requested.
- Use the stable IDs returned by the tools for all follow-up calls; do not use slide positions as IDs.
- If the outline exceeds a tool's batch limit, split creation into valid batches while preserving the requested order.
- Do not delete or overwrite an existing deck. If a creation step fails, report the failure and the resources already created.