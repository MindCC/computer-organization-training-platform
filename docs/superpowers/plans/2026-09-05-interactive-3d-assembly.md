# Interactive 3D assembly implementation plan

**Approved goal:** Replace image/catalog-driven assembly with a guided 3D workbench: pick up recognizable modeled parts, drop into sockets, undo installation, and run a boot check before submitting the existing order score. Improve the shared computer exploration scene.

**Architecture:** React owns installation and boot state. Three.js renders existing compound models, rack positions, target sockets, and movement. Scene callbacks request state transitions; pure functions validate actions. Existing configuration scoring and submission remain authoritative for customer requirements.

**Constraints:** Light Precision Workshop surfaces, navy framing, teal interactions; classroom integrated GPUs; no external model dependency. GPU integrated option is logical configuration, never a physical expansion card. No screw/cable physics in this iteration. Keyboard alternatives and explicit WebGL fallback are required.

- [x] Add `hardwareAssembly.js` and behavioral tests for wrong sockets, missing components, integrated graphics, removal and configuration changes invalidating boot readiness.
- [x] Improve recognizable model proportions/details and add a reusable lit workshop environment. Keep resource ownership explicit.
- [x] Extend native scene with assembly rack/slot coordinates, ray picking, screen-plane dragging, snap animations, labels, view reset and pointer cancellation.
- [x] Switch `HardwareGamePage` from `HardwareBuilderView` to `HardwareAssemblyWorkbench`: 3D viewport, compact configuration controls, installation checklist, removable parts, and boot sequence. Gate order submission on the current tested configuration.
- [x] Run unit tests and build. Use one headless browser to verify actual drag/drop, wrong drop, removal/reinstall, boot/submission gating, configuration invalidation, overview and mobile layout. Save screenshots locally.

**Acceptance:** Parts cannot be installed into another component's socket; changing a variant clears its installation and successful boot; integrated graphics requires no GPU installation; the viewport remains primary at 1366×768; unavailable WebGL explains the limitation and provides accessible installation controls; existing customer scoring is preserved.

## Verification, 2026-09-05

- `npm test`: 305 passed, 0 failed.
- Focused assembly/scoring/scene tests: 19 passed, 0 failed (includes scene tests outside the default test glob).
- `npm run build`: passed; existing circular Three.js manual-chunk warning remains.
- `npm run qa:3d`: 32 checks passed, including the nested physical drag/drop, wrong socket, remove/reinstall, POST gating, configuration invalidation, same-case selection, focus/Escape, mobile camera fit, and unavailable-WebGL fallback checks.
- `node --check scripts/verify-ui.mjs`: passed. Legacy hardware assertions updated to the new assembly flow; the full platform UI suite was not run.
- Screenshots: `prototype/qa-artifacts/assembly-desktop.png`, `assembly-focused.png`, `assembly-boot.png`, `assembly-mobile.png`.

The game uses procedural compound models and simplified teaching sockets. Mainboard and PSU are preinstalled; cooling and wiring are abstracted, and assembly state lasts for the current mounted order. Existing order scores/submissions retain their existing persistence. No real hardware compatibility database, screw manipulation, or cable physics is claimed.
