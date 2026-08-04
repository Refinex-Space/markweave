---
owner: refinex
updated: 2026-08-04
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

## AI Pre-edit Hunk Visual Polish QA (2026-08-04)

### Visual evidence

- User reference without desired tooltip styling: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-12a7ebe5-84db-4d36-9a6a-673249382bb2.png`
- User reference highlighting the proposal rail: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-3194b8da-bc90-4518-8407-fbf3f5a29794.png`
- Final dark implementation: `C:/Users/Administrator/AppData/Local/Temp/markweave-ai-edit-tooltip-dark-clean-final.png`
- Viewport: 1308 x 912 CSS px, React playground, dark theme, document-scope review

### Findings and repair

- Removed the proposal's 3 px left border. Browser-computed `border-left-width` is now `0px`.
- Removed native `title` attributes from AI review icon buttons to prevent unstyled browser tooltips.
- Added a shared dark tooltip surface matching the selection toolbar: `#2f3135` background, white text, 9 px radius, 13 px medium text, and compact 7 x 10 px padding.
- Local hunk tooltips align from the right edge so labels expand inward instead of leaving the editor frame. Navigation tooltips remain centered over their icon buttons.
- Hover and keyboard-focus selectors share the same visible state; each tooltip is connected with `aria-describedby` and `role="tooltip"`.
- The final reference/implementation comparison shows no left rail and replaces the white native tooltip with the compact dark product tooltip. No actionable P0, P1, or P2 findings remain.

final result: passed

## Ask AI Review Flow QA (2026-07-29)

### Source truth and implementation evidence

- Input reference: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-10cf8509-adf7-41c4-b4c6-c9231a5460f1.png` (1368 x 514)
- Generating reference: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-194a2740-9cff-4e08-9ef2-5c0bd08cc9fa.png` (1312 x 394)
- Result reference: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-3ca977a1-0288-4b72-b9a6-7b1faf8e9050.png` (1306 x 376)
- Input implementation: `.playwright-cli/ask-ai-input.png` (1060 x 360)
- Generating implementation: `.playwright-cli/ask-ai-generating.png` (1060 x 320)
- Result implementation: `.playwright-cli/ask-ai-result.png` (1060 x 570)
- Browser viewport: 1603 x 1261 CSS px at device pixel ratio 2; captures are focused CSS-pixel crops.
- State: React playground production stylesheet, light theme, selected text retained, with input, generating, and result/review states captured separately.

The implementation states were rendered through an isolated browser visual fixture using the production Ask AI DOM classes and shared stylesheet. The fixture was removed after capture. Real component lifecycle, Promise/stream transitions, retry, discard, apply, focus, and adapter parity are covered by the focused DOM and session tests.

### Same-state comparison

- Input: selected text remains visible above the panel; the composer is a single integrated surface with no nested card outline; the send button sits inside the lower-right corner.
- Generating: the compact status surface uses neutral Sparkles/dot motion and a right-aligned stop control without purple accents.
- Result: generated Markdown preview, follow-up composer, and the retry/discard/apply action row remain within one review surface; Apply is the only high-emphasis action and uses charcoal rather than purple.
- Typography and spacing: controls use the existing system font and Lucide icon language; text is vertically centered, spacing is compact, and the panel keeps a 10 px visual gap from the mapped selection.
- Colors: the target decoration is the existing low-opacity blue-gray selection treatment; cards, borders, labels, and controls use neutral white/gray/charcoal tokens.
- Responsive and theme coverage: placement is clamped to the editor frame and viewport, can flip above when lower space is insufficient, and retains the shared narrow-screen and dark-theme rules.
- Intentional difference from the references: Tone and other preset actions are omitted because Ask AI v1 explicitly supports only custom prompts.

### Repair history

- Initial implementation rendered a separate textarea card beneath the floating toolbar and could drift away from the selected content.
- First repair anchored the panel to the mapped target selection and introduced the integrated input, generating, and review states.
- Visual comparison exposed a double outline in the input state; the final repair removed the outer card chrome for that phase and retained the composer as the single visible surface.
- No actionable P0, P1, or P2 visual findings remain in the approved scope.

final result: passed

## Host-driven AI Pre-edit Review QA (2026-08-04)

### Visual evidence

- Cursor reference: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-27785605-3614-4cc6-84a6-2c78c53f4a1e.png`
- Cursor local-action reference: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-1885474f-ba37-4435-8ccc-93f40aace280.png`
- Markweave dark implementation: `C:/Users/Administrator/AppData/Local/Temp/markweave-ai-edit-review-dark.png`
- Markweave light implementation: `C:/Users/Administrator/AppData/Local/Temp/markweave-ai-edit-review.png`
- Markweave full-page check: `C:/Users/Administrator/AppData/Local/Temp/markweave-ai-edit-review-dark-full.png`
- Browser: Codex In-app Browser
- Viewport: 1308 x 912 CSS px at the browser default pixel density
- State: React playground, dark theme, document scope, multi-hunk review, current `1 / 7`

### Same-state comparison

- The global decision dock is bottom-centered and preserves the reference hierarchy: previous, current/total, next, discard all, and accept all.
- Original content uses the existing deletion treatment, while proposal blocks use the shared blue review border and background in both light and dark themes.
- The current or hovered hunk exposes compact discard and accept icon controls at the lower right. Non-current hunks hide their controls to avoid repeating visual noise.
- Completing a proposal now scrolls the first hunk into view. Navigation and per-hunk decisions scroll to the next target.
- Full-page capture was executed. The in-app browser compositor repeated chunks of the internal scrolling document, so the final visual judgment uses the state-matched 1308 x 912 reference and implementation viewport captures plus measured DOM positions.

### Interaction evidence

- Next updates `1 / 7` to `2 / 7` and centers the target hunk in the viewport.
- Accepting one hunk only stages its `accepted` disposition; the document remains unchanged and the next pending hunk becomes active.
- Accept all applies the proposal and removes all review UI.
- Discard all removes all review UI and preserves the original document.
- The behavior contract test verifies that mixed per-hunk decisions apply the accepted subset in one undoable transaction.
- The console showed only the existing Bilibili embed's third-party request failures; no Markweave AI pre-edit error was observed.

### Repair history

- The first browser pass found that starting a review from the bottom of the long playground document left hunk 1 outside the viewport.
- The final implementation scrolls the first hunk after the complete proposal refresh. Its measured rectangle was `y = 110.8`, height `62.5`, inside the 912 px viewport.
- No actionable P0, P1, or P2 visual findings remain in this scope.

final result: passed
