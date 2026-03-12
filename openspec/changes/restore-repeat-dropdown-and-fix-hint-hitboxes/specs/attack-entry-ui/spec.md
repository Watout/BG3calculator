# attack-entry-ui

## ADDED Requirements

### Requirement: Tooltip Trigger Hitbox

Attack entry field hints MUST appear only when the user hovers or focuses the `i` icon for that field.

#### Scenario: Hovering the title row

- **WHEN** the user hovers the title text, title-row whitespace, or the input control
- **THEN** the field hint is not shown

#### Scenario: Hovering the info icon

- **WHEN** the user hovers or focuses the `i` icon
- **THEN** the matching field hint is shown

### Requirement: Per-Hand Repeat Dropdowns

Main-hand and off-hand repeat controls MUST use the compact scrollable dropdown presentation.

#### Scenario: Selecting a repeat value

- **WHEN** the user opens a per-hand repeat dropdown and clicks an option
- **THEN** the selected value is applied
- **AND** the dropdown closes immediately

#### Scenario: Dismissing a repeat dropdown

- **WHEN** the user clicks outside the dropdown or presses `Escape`
- **THEN** the dropdown closes

### Requirement: Off-Hand Repeat Visibility

The off-hand repeat control MUST stay visible even when the off-hand damage expression is empty.

#### Scenario: Empty off-hand damage

- **WHEN** the off-hand damage expression is empty
- **THEN** the off-hand repeat control is still rendered
- **AND** off-hand repeat and off-hand attack bonus are ignored by computation
