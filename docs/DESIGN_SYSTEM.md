# Desktop design system

The page and modal references in [screenshots/README.md](screenshots/README.md) define the visual language: quiet green surfaces, inset fields, raised controls, segmented tabs, and bounded dialogs. Desktop views share the tokens and components below.

## Material and type

Geist is the interface font; Geist Mono is reserved for technical facts, checksums, and selected numeric displays. Use one green accent, a charcoal primary action, and muted green-gray text. Status colors communicate outcomes rather than decoration.

Light comes from above. Raised buttons and icon tiles use a top highlight, a small bottom edge, and a short green-tinted shadow. Fields and segmented-control trays use an inset shadow. Large panels have softer elevation than controls. Pressing a control moves it down one pixel and compresses its shadow. Disabled controls retain their material treatment with muted text and fill.

All single-line inputs and selects fill their field width and share the 40 px control-height token. Selects disable native appearance so macOS cannot shrink their box, and use a bundled chevron while retaining the native option menu and keyboard behavior.

Date filters use the shared `DatePicker` calendar rather than the operating-system date popup. Its inset 40 px trigger opens a raised calendar with month/year selectors, selected and current-day states, Today/Clear actions, and range limits. Arrow keys navigate days, Home/End navigate the week, Page Up/Down navigate months (Shift changes years), and Escape returns focus to the trigger without closing the filter. The popup avoids viewport edges; its day grid scrolls at short heights while its header and footer stay visible. Dates are stored as local `YYYY-MM-DD` keys without UTC conversion. Light/dark materials and reduced motion follow the shared tokens.

Shared material, color, and motion tokens live at the beginning of [App.css](../src/App.css). Use `Button`, `Field`, `Badge`, `Modal`, and `ModalTabs` from [ui.tsx](../src/components/ui.tsx) when adding interface elements.

Dark materials live in [theme.css](../src/theme.css): a deep green canvas, raised green-charcoal surfaces, inset fields, light top edges, readable muted text, and distinct status colors. Dialogs, drawers, tables, filters, and native select menus follow the active appearance. Image content keeps its original colors. Settings offers System, Light, and Dark; the top bar toggles Light/Dark. The preference persists on this device and updates native window appearance. System mode follows operating-system changes.

## Dialog families

| Family         | Maximum width | Structure                                                                                                                                                                                                                  |
| -------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmation   | 512 px        | Title and explanation, optional request details, compact actions; no redundant close button or empty body.                                                                                                                 |
| Filter         | 448 px        | Fixed title, scrolling conditions, Clear all / Cancel / Apply footer. Edits are staged; Cancel discards them. Applied conditions appear as individually removable chips under search.                                      |
| Method chooser | 576 px        | Title, description, two raised manual/AI tiles.                                                                                                                                                                            |
| Form           | 768 px        | Two-column fields where space permits, fixed header and footer.                                                                                                                                                            |
| Brief editor   | 1024 px       | Fixed Commercial direction / Prompt / Adobe metadata tabs. Controlled values survive section changes.                                                                                                                      |
| Image review   | 1152 px       | Technical badges and asset title, fixed Quality review / Same brief / Metadata tabs, preview and review columns, nine individual human checks, explicit AI disclosure review, and a persistent download/save/close footer. |

Provider request details use a 640 px drawer attached to the right edge.

Dialogs keep a 24 px viewport gutter (12 px on narrow previews). Only the body scrolls. Header, tabs, and footer remain accessible at short window heights. Nested confirmations preserve the underlying editor; Escape closes one layer and restores focus. Fields expose the label as their accessible name and hints as descriptions.

## Responsive behavior

The native minimum window remains 1120 × 720. The browser preview also adapts down to narrower widths. Content layouts use the actual main-content container width so expanding or collapsing the sidebar changes the available space correctly.

- Below 1100 px of content width, metrics form two columns and heading actions wrap.
- Below 800 px of content width, settings and generation panels stack; settings navigation becomes a compact grid.
- Below 520 px of content width, form and asset grids use one column.
- Review dialogs stack preview and review sections below 760 px of dialog width. Other form dialogs stack fields below 520 px; filter dates stay paired when at least 380 px is available.
- Tables scroll horizontally inside their card, keeping the workspace itself within the viewport. Long paths and metadata wrap within their own containers.

## Micro interactions

Hover, focus, selection, and pressed feedback use a shared 180 ms curve. Raised method and metric tiles lift two pixels on hover; image previews zoom slightly. Segmented tabs transition between inset and raised surfaces. Page entry, dialog entry/exit, toast entry, and selection-bar appearance use short opacity/transform transitions. Existing job indicators animate only while work is active.

Keyboard focus remains visible, arrow keys navigate segmented tabs, and the operating-system reduced-motion setting disables animation and hover transforms.

## Verification

Browser checks cover all pages at widths 1440, 1120, 900, and 720 px, expanded and collapsed sidebar layouts, brief/review dialogs at 720 px height, editor state across tabs, nested confirmation dismissal, staged filters, and reduced motion. Review generated screenshots alongside the reference images after changing shared components.

The desktop review queue uses five columns at the standard and minimum native sizes. Each card places its decision beside the title and uses three icon badges for resolution, human review, and metadata readiness. Narrow previews reduce the column count.

Research records persist topic behavior, result-count estimates, and four signals in an optional `details` object. Briefs persist supporting subjects, environment, style, orientation, copy space, composition, lighting, and planned Adobe metadata in `details`. Existing records without these objects still decode. New manual briefs create a starter prompt when the prompt is left blank.

## Selection actions and table sorting

Review image selection uses 28 px square checkboxes; the zoom tile is 40 × 40 px. Selection actions are fixed 20 px above the workspace viewport bottom, centered within the area beside the sidebar. The raised panel contains a selection summary, Approve selected, Generate AI metadata, Reject selected, and an icon button to clear selection. At narrow widths the actions wrap, then stack; the scrolling content reserves room beneath its last row. Brief selection uses the same shared panel.

Data table column headings are keyboard-accessible sort buttons with directional indicators and `aria-sort`. A first click sorts ascending; another click reverses the direction. Numeric values sort numerically, text uses natural ordering, and dates use their original timestamps. Sorting applies to the full filtered set before pagination and returns to the first page. Action and selection columns do not sort. The date-order toolbar restores chronological sorting.
