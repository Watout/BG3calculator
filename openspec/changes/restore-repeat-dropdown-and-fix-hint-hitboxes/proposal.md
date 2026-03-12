# Proposal: Restore Compact Repeat Dropdowns And Tighten Hint Hitboxes

## Summary

This change restores the compact repeat dropdown used by per-hand repeat controls and fixes tooltip hitboxes so hints appear only when the user hovers or focuses the `i` icon.

## Why

The current UI regressed in two ways:

1. Per-hand repeat controls were switched from the compact scrollable dropdown to native selects, which no longer match the intended design.
2. Tooltips can appear when hovering the title row or even the input area because the info icon is still coupled to the field label region.

## Outcome

- Main-hand and off-hand repeat controls use the compact scrollable dropdown again.
- Selecting a repeat value closes the dropdown immediately.
- Only the `i` icon can trigger a tooltip.
- Attack bonus remains a single expression input with no extra dice dropdown.
- Off-hand repeat stays visible even when off-hand damage is empty, while compute behavior remains unchanged.
