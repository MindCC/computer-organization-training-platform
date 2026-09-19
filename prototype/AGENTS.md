# Prototype Instructions

Run the local server yourself and verify previews with standalone Playwright by default. Minimize the in-app browser because this project is known to trigger memory pressure. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current durable prototype preferences (the scope map below resolves overlap):
- First-level component exploration shares the assembly lab Blender asset and camera controls; allow dragging components out for inspection and returning them, while retaining guided steps and completion grading.
- Assembly lab camera: middle-button drag pans the view; left-button drag on empty space rotates, and the wheel zooms.
- First-login password changes are optional. Do not block login or course access with a mandatory password-change gate; retain voluntary password changes in personal settings.
- The approved UI direction is the bright "Precision Workshop" concept: compact navy navigation, light neutral work surfaces, teal interaction states, realistic identifiable computer parts, and dense but breathable operational layouts.
- Hardware assembly must never fall back to unlabeled primitive boxes as its primary experience; every selectable part needs a recognizable visual, a clear hotspot/list state, and immediate compatibility, budget, and outcome feedback.
- Homepage should not display the student's personal name in the main visual area.
- Course progression should read like a circuit assembly route, closer to a Turing Complete style learning path than uniform lesson cards.
- Responsive behavior must be deliberate; avoid squeezing desktop layouts into smaller widths without reflowing the information architecture.
- Student and teacher experiences have equal product priority.
- Approved 2026-09-14: the teacher dashboard follows the supplied light analytics reference—pale primary rail, white secondary navigation, a slim class/export toolbar, flat white data sections, thin dividers, and pale-blue selected states—while preserving the platform identity and existing teaching data and actions.
- Approved 2026-09-19: all quest/lab experiment listings are organized by the eight textbook chapters (courseChapters.js is the single source); the standalone "关卡实验" student nav entry is removed—students enter experiments only from the course home page chapter cards (refresh-restore, classroom missions, and contextual deep links such as mistake-book/records still land in the lab directly). Every chapter keeps at least one usable experiment built on the existing circuit-workbench stack (ch6 cpu-datapath, ch7 system-bus, ch8 io-transfer were added for this).
- Approved 2026-09-19: the student records page is a blue tech "big screen" (deep navy, grid glow). Center: a zoomable canvas with a REAL botanical-style tree (pure SVG, organicTreeLayout.js: tapered S-curve trunk growing from the bottom, eight chapter main branches alternating sides bottom-up by chapter number, one twig per experiment with a leaf at the tip—completed lights cyan, in-progress amber, untouched dim bud; wheel zoom centered on cursor, drag pan, zoom controls; click a leaf to enter that experiment; no setPointerCapture—it breaks leaf/controls clicks). Side: hand-rolled SVG stats (donut for lit distribution, per-chapter score/completion line, per-chapter lit bars) with no chart library (protect the build budget). Keep the QA contract: "个人学情记录" title and .record-table/.record-row chapter-grouped detail list below the screen. Do NOT regress the tree to a mind-map/box-node layout.
- Performance acceptance targets ordinary classroom Windows 10/11 PCs: four-core x86-64 CPU, 8 GB memory, integrated graphics, 1366×768, and a supported stable Edge release.
- Apply the approved specification for the affected module from the scope map below. New user decisions override earlier design guidance within their stated scope. Preserve unrelated user changes; use regression coverage appropriate to affected behavior and retain explicit acceptance gates.
- Browser QA should use one headless Chromium instance and one worker unless a specific test requires otherwise.
- Visual design must borrow both interaction patterns and visible UI language from strong engineering games, without copying their copyrighted assets: use Turing Complete and Factorio for progression maps, SHENZHEN I/O and Opus Magnum for the lab workbench, while True: learn() for data-flow feedback, and a strategy-game command-room treatment for the teacher view.
- Classroom sessions use a four-stage mission loop: teacher creates draft → starts live → (pause / resume) → ends. Student auto-discovers, enters, submits with idempotent clientSubmissionId UUIDs. Polling: 15s, visibility-gated. Load gate: 150 students, ≤30 concurrent, P95 ≤ 2000ms, zero SQLITE_BUSY.
- Use `npm run qa:classroom-load` for the 150-student API load gate. Use `npm run qa:classroom` for the two-context Playwright classroom flow. Classroom QA artifacts go to `prototype/qa-artifacts/` (gitignored).
- The approved platform-wide direction is the "Quest Learning Map": a professional engineering-adventure presentation with explicit maps, stages, mission objectives, evaluation settlement, and role-specific onboarding. Student and teacher experiences share progression language; the teacher view emphasizes cohort blockers and interventions.
- Approved 2026-09-05: hardware assembly is a guided 3D workbench game with recognizable modeled parts, direct pick/drag/socket installation, removal and boot verification. Keep the 3D scene primary; configuration cards must not be the main gameplay. Integrated graphics is not a physical card. Screw and cable physics are outside this iteration.
- Approved 2026-09-06: use PC Building Simulator as an interaction reference. First improve production loading, camera closeups, target previews and per-student/order local assembly recovery; then replace the compound models through a Blender-to-GLB asset pipeline. Keep existing teaching layout and grading. Local draft recovery must never restore successful boot/grade status. Blender asset source and conventions are documented in docs/blender-asset-contract.md.


## Active specification scope

- Login, student/teacher home, onboarding, and shared navigation: [Quest Learning Map](../docs/superpowers/specs/2026-07-19-quest-learning-map-platform-redesign.md).
- Workshop visual foundations (navy navigation, light surfaces, teal states), where compatible with the module-specific specification: [Precision Workshop](docs/superpowers/specs/2026-07-19-precision-workshop-redesign.md).
- Hardware assembly interactions and Blender migration: [approved 3D proposal](../docs/superpowers/specs/2026-09-06-pc-simulator-3d-proposal.md). Phase 1 and the first Blender teaching asset are implemented; see the asset contract for regeneration and current interaction scope. Preserve the teaching layout, grading, and recovery restrictions above.
- Blender asset authoring/export requirements: [asset contract](docs/blender-asset-contract.md).
- Classroom lifecycle and load acceptance: retain the explicit mission-loop contract and commands above.

Specification dates alone do not authorize unrelated redesign or replacement of existing work. Read only the specifications needed for the current module. Historical alternatives and implementation history live in the linked documents; they are not additional universal workflow gates.

## Execution and verification

Continue clear, authorized work without repeating approval for routine implementation choices. Ask only for material unresolved decisions or missing permissions. This does not grant publication, data-transfer, destructive-operation, or sandbox permissions.

Choose verification for the affected behavior and preserve required acceptance gates. For changes to classroom concurrency or lifecycle, run the relevant classroom gates; for production 3D loading or assembly behavior, run the relevant production/browser checks. Documentation-only changes need link and diff checks. Reuse evidence for unchanged code and relevant environment; repeat tests when changes, failures, or unresolved concerns justify it.
