# Prototype Instructions

Run the local server yourself and verify previews with standalone Playwright by default. Minimize the in-app browser because this project is known to trigger memory pressure. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current durable prototype preferences:
- The approved UI direction is the bright "Precision Workshop" concept: compact navy navigation, light neutral work surfaces, teal interaction states, realistic identifiable computer parts, and dense but breathable operational layouts.
- Hardware assembly must never fall back to unlabeled primitive boxes as its primary experience; every selectable part needs a recognizable visual, a clear hotspot/list state, and immediate compatibility, budget, and outcome feedback.
- Homepage should not display the student's personal name in the main visual area.
- Course progression should read like a circuit assembly route, closer to a Turing Complete style learning path than uniform lesson cards.
- Responsive behavior must be deliberate; avoid squeezing desktop layouts into smaller widths without reflowing the information architecture.
- Student and teacher experiences have equal product priority.
- Performance acceptance targets ordinary classroom Windows 10/11 PCs: four-core x86-64 CPU, 8 GB memory, integrated graphics, 1366×768, and a supported stable Edge release.
- The latest approved design specification takes precedence over conflicting committed or uncommitted implementation; compatible behavior still requires regression coverage.
- Browser QA should use one headless Chromium instance and one worker unless a specific test requires otherwise.
- Visual design must borrow both interaction patterns and visible UI language from strong engineering games, without copying their copyrighted assets: use Turing Complete and Factorio for progression maps, SHENZHEN I/O and Opus Magnum for the lab workbench, while True: learn() for data-flow feedback, and a strategy-game command-room treatment for the teacher view.
- Classroom sessions use a four-stage mission loop: teacher creates draft → starts live → (pause / resume) → ends. Student auto-discovers, enters, submits with idempotent clientSubmissionId UUIDs. Polling: 15s, visibility-gated. Load gate: 150 students, ≤30 concurrent, P95 ≤ 2000ms, zero SQLITE_BUSY.
- Use `npm run qa:classroom-load` for the 150-student API load gate. Use `npm run qa:classroom` for the two-context Playwright classroom flow. Classroom QA artifacts go to `prototype/qa-artifacts/` (gitignored).
- The approved platform-wide direction is the "Quest Learning Map": a professional engineering-adventure presentation with explicit maps, stages, mission objectives, evaluation settlement, and role-specific onboarding. Student and teacher experiences share progression language; the teacher view emphasizes cohort blockers and interventions.
