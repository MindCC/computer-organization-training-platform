# Prototype Instructions

Run the local server yourself and verify previews with standalone Playwright by default. Minimize the in-app browser because this project is known to trigger memory pressure. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current durable prototype preferences:
- Homepage should not display the student's personal name in the main visual area.
- Course progression should read like a circuit assembly route, closer to a Turing Complete style learning path than uniform lesson cards.
- Responsive behavior must be deliberate; avoid squeezing desktop layouts into smaller widths without reflowing the information architecture.
- Student and teacher experiences have equal product priority.
- Performance acceptance targets ordinary classroom Windows 10/11 PCs: four-core x86-64 CPU, 8 GB memory, integrated graphics, 1366×768, and a supported stable Edge release.
- The latest approved design specification takes precedence over conflicting committed or uncommitted implementation; compatible behavior still requires regression coverage.
- Browser QA should use one headless Chromium instance and one worker unless a specific test requires otherwise.
