# attack-entry-ui

## ADDED Requirements

### Requirement: Descending Critical Threshold Dropdown

The critical-threshold compact dropdown MUST present bounded threshold values in descending order without changing the underlying `1..20` numeric range or critical-hit semantics.

#### Scenario: Opening the critical-threshold dropdown

- **WHEN** the user opens the critical-threshold dropdown for an attack entry
- **THEN** the first visible options are ordered from higher thresholds to lower thresholds
- **AND** the dropdown still allows selecting any value from `20+` down to `1+`

#### Scenario: Selecting the minimum threshold

- **WHEN** the user scrolls the dropdown window to the bottom and chooses `1+`
- **THEN** the selected value is stored as numeric threshold `1`
- **AND** attack calculation still preserves the natural `1` auto-miss rule

### Requirement: Compact Dropdown Scrollbar Presentation

Compact numeric dropdown menus MUST hide the visible right-side scrollbar while preserving scroll-wheel and scroll-driven window movement.

#### Scenario: Scrolling a compact dropdown

- **WHEN** the user uses the mouse wheel or scroll gesture inside a compact dropdown
- **THEN** the numeric window continues to slide and reveal more options
- **AND** the menu does not show a visible right-side scrollbar
