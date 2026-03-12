# Design: Restore Compact Repeat Dropdowns And Tighten Hint Hitboxes

## Decisions

- Introduce a field shell component that separates the title row from the input control.
- Associate titles with controls through `htmlFor`/`id` instead of wrapping the whole field in a native `<label>`.
- Keep the visual order `title -> i -> trailing repeat control`.
- Restore the existing compact dropdown primitive for main-hand and off-hand repeat counts only.
- Keep the template repeat control as a native `select`.
- Render tooltip content only while the `i` icon is hovered or focused.

## UI Structure

Each form field is rendered as:

1. a field shell container
2. a title row containing the title label, the `i` button, and optional trailing controls
3. the field control itself

This removes the accidental hitbox expansion caused by putting the info button inside a wrapping `<label>`.

## Interaction Rules

- Hovering the title text, title-row whitespace, or the input must not show a tooltip.
- Hovering or focusing the `i` icon shows the tooltip.
- Main-hand and off-hand repeat dropdowns must close when:
  - an option is clicked
  - the trigger is clicked again
  - the user clicks outside the dropdown
  - the user presses `Escape`

## Validation

- DOM interaction tests must cover tooltip hitboxes and dropdown close behavior.
- Existing compute tests must continue to pass, especially the rule that empty off-hand damage disables off-hand contribution.
