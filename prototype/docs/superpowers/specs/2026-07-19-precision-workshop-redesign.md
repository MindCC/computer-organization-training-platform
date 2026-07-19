# Precision Workshop UI Redesign Specification

## Source of truth

- Selected Product Design option: the first displayed generated image, ?Precision Workshop?.
- Source image: `C:\Users\shaolijiang\.codex\generated_images\019f7516-3c10-7020-a8cf-9e38f0d43a5c\exec-7045b40c-41f5-459f-a366-cccb44d39cac.png`.
- Generated assembly asset: `src/assets/hardware-assembly-workbench.png`.
- Primary acceptance viewport: 1366 ? 768 on a Windows classroom PC; the design must also remain usable at 390 ? 844.

## Product outcome

Students should understand the active task, recognize every hardware component, make a configuration choice, see compatibility and budget feedback immediately, and submit a build without scrolling through duplicated controls. Teachers should read class status and intervene from the same visual system.

## Visual system

- Compact navy navigation and header, light neutral work surfaces, teal selected/success states, cobalt primary actions, amber warnings, and restrained red errors.
- Manrope remains the UI font; operational headings use the same sans-serif family so the product reads like an engineering workstation.
- Surfaces use 10?14px radii, 1px cool-gray borders, minimal shadows, and 8px-based spacing.
- Use the installed Phosphor icon library. Do not add handcrafted SVG, emoji, CSS drawings, or placeholder geometry.
- Existing avatar and course illustration assets remain valid. The hardware challenge uses the generated realistic assembly raster rather than primitive Three.js boxes as the main interaction surface.

## Global shell

- Desktop: 72?88px navy navigation rail, compact top bar, and a main canvas that begins above the fold.
- Tablet: retain a narrow rail instead of stacking the complete sidebar above the page.
- Mobile: primary navigation becomes a fixed bottom strip; promo/meta sidebar content is hidden so the main task appears immediately after the header.
- The profile menu, notifications, navigation, focus states, and current-view states remain functional and keyboard accessible.

## Hardware challenge

- Layout follows the selected mock: mission/constraints column, central assembly workbench, parts catalog and build summary column.
- The central workbench displays recognizable chassis, PSU, CPU, motherboard, RAM, GPU, and storage. Hotspots are real buttons with accessible names and selected/attention states.
- Clicking a hotspot selects its category. Clicking a catalog card updates the existing `hardwareSelection`, recalculates the existing grade, and updates progress, budget, satisfaction, quote, profit, and unmet constraints immediately.
- The challenge list remains reachable but compact and does not duplicate the catalog.
- ?????? continues to call the existing backend flow. No API or persistence contract changes.
- WebGL may remain available for the overview lab, but the hardware configuration challenge must not depend on WebGL.

## Student and teacher surfaces

- Student home keeps the circuit-route mental model and gains the same rail, typography, tokens, compact status cards, and clear next action.
- Teacher dashboard keeps all current class/session/assignment behavior while adopting the same command-workbench hierarchy, compact metrics, and restrained surfaces.
- Operational copy and data remain unchanged unless the selected mock requires a clearer label.

## Accessibility and responsive behavior

- Minimum interactive target: 40px desktop, 44px mobile.
- Visible focus ring, semantic buttons, `aria-pressed` for selected parts, and descriptive `aria-label` for hotspots.
- No horizontal page overflow at 390px. Persistent navigation must not cover the active primary action.
- Color is not the only selected/error signal; labels and icons accompany state.

## Verification

- Node tests cover the hardware workbench view model and progress calculations.
- Browser QA covers hotspot-to-catalog selection, submit flow, absence of the old primitive builder, desktop layout, and mobile main-content-first navigation.
- Production build, full unit suite, asset-budget QA, UI browser QA, and Product Design visual comparison must pass before handoff.
