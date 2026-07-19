source visual truth path: `C:\Users\shaolijiang\.codex\generated_images\019ebc2e-da9e-7462-8e90-c8ddd4d7ca0a\ig_09ff2ff1aab324b7016a2c1e3a1ba08191896b9cd984c3a338.png`
source requirements path: `D:\workspace\zcyl_training\docs\superpowers\specs\2026-06-12-computer-organization-training-platform-design.md`
implementation screenshot path: `D:\workspace\zcyl_training\prototype\qa-artifacts\desktop-home.png`
implementation screenshot path: `D:\workspace\zcyl_training\prototype\qa-artifacts\desktop-lab-data-flow.png`
implementation screenshot path: `D:\workspace\zcyl_training\prototype\qa-artifacts\desktop-lab-pass.png`
implementation screenshot path: `D:\workspace\zcyl_training\prototype\qa-artifacts\desktop-lab-multi-adder.png`
implementation screenshot path: `D:\workspace\zcyl_training\prototype\qa-artifacts\desktop-records.png`
implementation screenshot path: `D:\workspace\zcyl_training\prototype\qa-artifacts\mobile-home.png`
viewport: `1440 x 1040 desktop, 390 x 900 mobile`
state: `course homepage with circuit route map, fullscreen lab screens with draggable component instances, explicit component drag handles, drag-wire circuit interaction, removable connection chips, visible target slots with auto-snap placement, explicit wire target indicator, internal-structure study cards, distinct lab canvases for data-flow/full-adder/multi-adder, learning records after pass, mobile homepage with vertical route flow`
full-view comparison evidence: `Compared the selected Guided Path visual direction, the requirements document, the public Turing Complete product references, and the latest user feedback against the rendered homepage, three different fullscreen experiment workbenches, draggable component placement behavior, explicit drag-handle affordances, drag-wire connection behavior, removable/reconnectable wires, visible target-slot overlays with auto-snap, explicit wire-target guidance, placement-plus-connection grading, internal-structure study guidance, records, notes/settings smoke flow, and mobile layout. The prototype keeps the ivory surface, navy/mint palette, serif-led hierarchy, guided educational cards, and full Chinese product copy while shifting the homepage from generic lesson cards to a circuit-route learning map and the lab area from one repeated board to challenge-specific fullscreen circuit workspaces.`
focused region comparison evidence: `Focused checks covered the homepage hero without personal-name callout, six-stage circuit route map, desktop route connectors, mobile vertical route flow, the single-channel data-flow canvas, the branched full-adder canvas with floating component instances, explicit component drag handles, drag-wire endpoint interaction, removable connection chips, target slots, explicit wire target indicator copy, internal structure study card copy, the chained multi-adder canvas, fullscreen lab chrome, pass feedback, learning metrics, saved note flow, and profile/settings modal.`

**Findings**
- No actionable P0, P1, or P2 issues remain.

**Open Questions**
- The current implementation is a frontend prototype with local mock student state. Real account persistence, server-side auth, and teacher/admin APIs remain out of scope for the first-version requirements document.

**Implementation Checklist**
- Done: implemented Chinese course homepage, six guided arithmetic-unit challenges, experiment workbench, dynamic signal steps, connection grading, error localization, pass summary, learning records, notes, and profile/settings flow.
- Done: reshaped the homepage into a circuit route map so each challenge now reads as a distinct assembly stage rather than uniform course cards.
- Done: removed the student's personal name from the homepage hero and switched the header account chip to a neutral learning-archive label.
- Done: rebuilt the lab canvas so each challenge now has its own circuit skeleton, signal path, and node placement instead of reusing one generic board.
- Done: promoted the challenge experience into a fullscreen lab screen so the canvas, controls, palette, and guidance no longer compete for the same cramped dashboard space.
- Done: made palette components placeable on the board as draggable floating instances and added automated verification for placement plus repositioning.
- Done: added visible target slots, duplicate-component instance labels, auto-snap placement, and placement-aware grading so students can tell where each component belongs before wiring it.
- Done: replaced the old click-to-connect flow with drag-wire endpoint interaction so the lab feels closer to a real circuit-building workspace.
- Done: added removable connection chips, reconnect verification, and live valid/invalid wire preview states so wiring edits are understandable instead of brittle.
- Done: added explicit component drag handles so placed parts have an obvious place to grab instead of competing with the pin interaction area.
- Done: added an explicit wire-target indicator plus endpoint target highlighting so students can see which endpoint they are currently aiming at.
- Done: added an internal-structure study card linked to the selected full-adder stage so students can connect external wiring with internal logic roles.
- Done: added Playwright UI smoke coverage for homepage, multiple lab variants, records, note saving, settings update, and mobile layout.
- Done: fixed the desktop lab layout so the inspector panel no longer overlaps the workbench at 1440px, and converted the mobile route map into a vertical flow instead of a squeezed horizontal strip.

**Follow-up Polish**
- [P3] If this moves beyond prototype, replace the large generated avatar/illustrations with optimized production assets to reduce build size.
- [P3] Add a real persistence layer so user settings and notes survive browser refresh across devices.

patches made since the previous QA pass:
- Rebuilt `App.jsx` from homepage-only into a full student-side interactive platform.
- Added `platformLogic.js` and tests for simulation, grading, progress, structural conflicts, and study-time summaries.
- Replaced `styles.css` with responsive full-platform styling.
- Added `scripts/verify-ui.mjs` and saved QA screenshots in `qa-artifacts`.
- Updated document language metadata and page title to Chinese.
- Reworked the homepage progression area into a circuit-route map with differentiated stage thumbnails and connectors.
- Reworked the lab workbench into challenge-specific canvases with dedicated node positions, branch paths, and multi-stage verification screenshots.
- Split the lab out into a dedicated fullscreen screen with a large dropzone, side guidance rail, and draggable placed-component layer on top of the circuit skeleton.
- Added pure wiring helpers, drag-wire smoke coverage, removable wire verification, and component study-card logic for full-adder stages.
- Adjusted the mobile breakpoint so the route map becomes a vertical learning flow instead of causing horizontal overflow.

final result: passed

## 2026-07-19 Precision Workshop redesign

Reference: `C:\Users\shaolijiang\.codex\generated_images\019f7516-3c10-7020-a8cf-9e38f0d43a5c\exec-7045b40c-41f5-459f-a366-cccb44d39cac.png`

Implementation captures:
- `qa-artifacts/product-design-desktop.png`
- `qa-artifacts/product-design-mobile.png`
- `qa-artifacts/precision-workshop-desktop.png`

Viewports and state:
- Reference comparison: 1488 x 1058
- Desktop acceptance: 1366 x 768
- Mobile acceptance: 390 x 844
- Demo student, office PC challenge, memory catalog open, 16GB memory selected

Comparison findings:
- [P1 fixed] The profile menu stayed open across navigation and obscured the parts catalog. It now closes on navigation, challenge entry, and logout.
- [P2 fixed] The student overview did not use the shared metric-card contract and retained its old eyebrow label. It now exposes four shared metric cards and the localized task label.
- [P2 fixed] The mobile bottom navigation exposed a native horizontal scrollbar. Touch scrolling remains available while the native scrollbar is hidden.
- [Pass] The final full and focused views have no cropped hardware, overlapping panels, placeholder boxes, broken spacing, or blocking interaction defects.

Functional evidence:
- Four numbered hotspots select CPU, memory, storage, and GPU catalogs.
- Catalog choices update selection state, budget use, score, quote, and profit.
- The workbench uses a real raster assembly asset and contains no placeholder canvas boxes.
- Desktop and mobile layouts have no document-level horizontal overflow.
- The mobile navigation remains fixed and reachable.
- The profile menu does not persist into the hardware challenge.

final result: passed

## 2026-07-19 Quest Learning Map redesign

Reference: `D:\workspace\zcyl_training\docs\superpowers\specs\2026-07-19-quest-learning-map-platform-redesign.md`

Viewports and state:
- Desktop acceptance: 1366 x 768
- Mobile acceptance: 390 x 844
- Demo student with no progress, teacher with one imported student

Implementation evidence:
- Login portal with student/teacher role tabs and guided copy
- Student home shows CurrentQuestPanel with dominant action, QuestMap with horizontal route track, FirstUseGuide with dismissible steps
- QuestSettlement overlay appears after passing challenge with next-unlock and continue actions
- Teacher dashboard shows cohort quest overview with progress bars, setup checklist, intervention groups
- Unit tests: 239 passing (questExperience 10, questMotion 2, teacherQuest 6, courseRoute 7, +214 existing)
- Build passes with no errors
- Motion primitives respect prefers-reduced-motion

Pending full UI QA verification:
- [ ] Run `npm run qa:ui` to verify complete browser flows
- [ ] Verify first-use guide dismisses and persists
- [ ] Verify settlement continues to next challenge
- [ ] Verify teacher quest overview renders correctly
- [ ] Verify mobile layout at 390 x 844
- [ ] Verify reduced-motion behavior
- [ ] Run `npm run qa:classroom` and `npm run qa:classroom-load` for regression

final result: pending browser verification
