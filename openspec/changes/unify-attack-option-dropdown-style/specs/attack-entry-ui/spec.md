# attack-entry-ui

## ADDED Requirements

### Requirement: Compact Enum Dropdowns

Attack-entry enum controls MUST use the same compact dropdown presentation as the newer critical-threshold controls instead of native `<select>` elements.

#### Scenario: Opening attack-state dropdowns

- **WHEN** the user opens the attack-roll-state, target-damage-modifier, or damage-dice-mode control
- **THEN** the control is rendered as a compact trigger button
- **AND** a compact listbox-style menu is shown instead of a native browser select popup

#### Scenario: Selecting an enum option

- **WHEN** the user clicks an option in one of those compact enum dropdowns
- **THEN** the selected label is shown on the trigger
- **AND** the dropdown closes immediately
- **AND** the stored enum value still maps to the same computation input as before
