---
owner: refinex
updated: 2026-07-28
status: active
referenced_by: product-design:image-to-code
---

# Markweave Design QA

## Image Controls QA (2026-07-17)

- Source visual truth: `/Users/refinex/Library/Application Support/PixPin/Temp/PixPin_2026-07-17_19-07-44.png`
- Implementation screenshot: `/tmp/markweave-design-qa-jnFD4u/markweave-image-controls-after.png`
- Full-view comparison: `/tmp/markweave-design-qa-jnFD4u/markweave-image-controls-full-comparison.png`
- Focused comparison: `/tmp/markweave-design-qa-jnFD4u/markweave-image-controls-focused-comparison.png`
- Viewport: requested 1578 x 1258; browser screenshot 1580 x 1253
- State: React playground, light theme, Live mode, image selected, center alignment

### Findings

- No actionable P0, P1, or P2 findings remain.
- The toolbar keeps the existing icon family and control order while changing from a pill-like 38 px surface to a compact 34 px rectangular surface. Its measured width moved from 303 px to 254 px, radius from 17 px to 8 px, buttons from 30 px to 26 px, and icons from 20 px to 16 px.
- The resize handles keep an 18 x 64 px transparent hit target, while the visible mark is reduced from 8 x 58 px dark charcoal to a 4 x 34 px translucent white mark with a neutral gray border.
- Fonts and typography: editor typography and toolbar icon strokes remain unchanged apart from the requested icon-size reduction; no wrapping regression is visible.
- Spacing and layout rhythm: toolbar placement stays centered above the image, its spacing is tighter, and neither the image nor caption shifts.
- Colors and visual tokens: the handle no longer uses a heavy black fill; contrast remains visible over both light sky and dark terrain.
- Image quality and asset fidelity: the existing source image, crop, border, caption, and Lucide icon assets are unchanged.
- Copy and content: labels, tooltips, caption text, and document content are unchanged.

### Interaction evidence

- Selecting the image shows the toolbar and both resize handles.
- Clicking right alignment changes the node to `right`; clicking center restores it to `center`.
- Automated pointer-resize coverage passes in the React and Vue adapter test suites.
- System-save, user-cancel, unavailable-picker fallback, and failed-fetch fallback paths pass focused tests.
- The in-app browser does not expose `showSaveFilePicker`, so its rendered download path correctly remains the browser fallback; supported Chromium desktop browsers use the system save picker.
- Browser console errors checked: none.

### Comparison history

- Initial source review identified the oversized pill toolbar and heavy black resize handles as the requested P1 visual issues.
- The first post-build full-view and focused comparisons confirm both issues are resolved. No additional P0/P1/P2 repair iteration was required.

### Follow-up polish

- No P3 visual follow-up is required for the approved scope.

Historical result: passed

## Table Interaction QA (2026-07-28)

### Scope

Tiptap Notion-Like table controls were compared with the shared Markweave implementation rendered by the React, Vue 3, and Vue 2 playgrounds. The retained Markweave merge/split commands and Chinese/English labels are intentional product extensions.

### Visual evidence

- Reference capture: [`design-qa/reference-tiptap-color-menu.png`](design-qa/reference-tiptap-color-menu.png)
- Intermediate React capture: [`design-qa/implementation-react-color-menu.png`](design-qa/implementation-react-color-menu.png)
- Intermediate side-by-side comparison: [`design-qa/reference-vs-implementation-color-menu.png`](design-qa/reference-vs-implementation-color-menu.png)
- Intermediate row-menu capture: [`design-qa/implementation-react-row-menu.png`](design-qa/implementation-react-row-menu.png)

The supplied reference screenshot and the local implementation screenshot use different browser viewport scales, so this pass is a state-matched visual comparison rather than a numerical Pixelmatch result. The implementation captures preserve the earlier purple-selection and letter-icon stage; the final blue-gray selection, neutral handles, compact menu geometry, and circular color swatches are verified by the current stylesheet contract and adapter tests.

### Comparison results

| Surface | Evidence | Result |
| --- | --- | --- |
| Layout and shape | The final main menu is 232 px wide with a 10 px radius; submenus are 228 px wide with the same radius and a layered shadow. Row/column handles and last-edge add controls retain their compact edge geometry. | Passed |
| Color and selection | Selected row/column/cell surfaces use the approved blue-gray treatment, handles stay neutral in light and dark themes, and both text and background palettes preview their effective colors. | Passed |
| Typography and icons | Menus preserve the product font stack and use the existing Lucide icon family in all three adapters. Disabled and active states remain visually distinct. | Passed |
| Interaction states | Row, column, and selection menus open from the matching edge handle; color and alignment submenus remain open during pointer travel; last row/column hover reveals full-edge add controls. | Passed |
| Commands | Move, insert, sort, color, alignment, clear, duplicate, delete, drag reorder, merge, split, and copy are available in their corresponding scopes. Merged-span sorting/duplication is disabled to preserve structure. | Passed |
| Framework parity | React, Vue 3, and Vue 2 render equivalent handles, add controls, menu structure, icons, and localized labels. | Passed |
| Accessibility | Controls expose button/menu/menuitem/menuitemradio semantics, accessible names, keyboard navigation, disabled states, and visible selection/focus feedback. | Passed |

### Browser evidence

- React: color/alignment formatting, last-edge add row/column, native row drag, and native column drag were executed in Chrome and reflected in the document.
- Vue 3: row menu, color submenu, handles, selection control, and both add controls were rendered and inspected in Chrome without local console errors.
- Vue 2: row menu and color submenu were opened, the last-edge add controls were measured, and the add-row action increased the target table from four to five rows without local console errors.

### Residual notes

- The task targets desktop authoring. Touch-specific drag reordering was not added.
- The live Tiptap reference URL did not complete a fresh navigation during the final pass, so the final comparison uses the user-provided reference capture plus the measurements already taken from the live reference during implementation.
- Existing playground bundle-size warnings are unrelated to the table controls.

final result: passed
