---
owner: refinex
updated: 2026-07-17
status: active
referenced_by: product-design:image-to-code
---

# Image Controls Design QA

- Source visual truth: `/Users/refinex/Library/Application Support/PixPin/Temp/PixPin_2026-07-17_19-07-44.png`
- Implementation screenshot: `/tmp/markweave-design-qa-jnFD4u/markweave-image-controls-after.png`
- Full-view comparison: `/tmp/markweave-design-qa-jnFD4u/markweave-image-controls-full-comparison.png`
- Focused comparison: `/tmp/markweave-design-qa-jnFD4u/markweave-image-controls-focused-comparison.png`
- Viewport: requested 1578 x 1258; browser screenshot 1580 x 1253
- State: React playground, light theme, Live mode, image selected, center alignment

## Findings

- No actionable P0, P1, or P2 findings remain.
- The toolbar keeps the existing icon family and control order while changing from a pill-like 38 px surface to a compact 34 px rectangular surface. Its measured width moved from 303 px to 254 px, radius from 17 px to 8 px, buttons from 30 px to 26 px, and icons from 20 px to 16 px.
- The resize handles keep an 18 x 64 px transparent hit target, while the visible mark is reduced from 8 x 58 px dark charcoal to a 4 x 34 px translucent white mark with a neutral gray border.
- Fonts and typography: editor typography and toolbar icon strokes remain unchanged apart from the requested icon-size reduction; no wrapping regression is visible.
- Spacing and layout rhythm: toolbar placement stays centered above the image, its spacing is tighter, and neither the image nor caption shifts.
- Colors and visual tokens: the handle no longer uses a heavy black fill; contrast remains visible over both light sky and dark terrain.
- Image quality and asset fidelity: the existing source image, crop, border, caption, and Lucide icon assets are unchanged.
- Copy and content: labels, tooltips, caption text, and document content are unchanged.

## Interaction Evidence

- Selecting the image shows the toolbar and both resize handles.
- Clicking right alignment changes the node to `right`; clicking center restores it to `center`.
- Automated pointer-resize coverage passes in the React and Vue adapter test suites.
- System-save, user-cancel, unavailable-picker fallback, and failed-fetch fallback paths pass focused tests.
- The in-app browser does not expose `showSaveFilePicker`, so its rendered download path correctly remains the browser fallback; supported Chromium desktop browsers use the system save picker.
- Browser console errors checked: none.

## Comparison History

- Initial source review identified the oversized pill toolbar and heavy black resize handles as the requested P1 visual issues.
- The first post-build full-view and focused comparisons confirm both issues are resolved. No additional P0/P1/P2 repair iteration was required.

## Follow-up Polish

- No P3 visual follow-up is required for the approved scope.

final result: passed
