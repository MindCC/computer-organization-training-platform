# Quest Learning Map Platform Redesign

## Status

Approved on 2026-07-19. This specification supersedes conflicting visual guidance for the login experience, student home, teacher home, onboarding, and shared navigation. Existing laboratory interaction contracts and backend APIs remain authoritative unless this document explicitly changes their presentation.

## Sources and selected direction

- Competitive references: EduCoder/HeadGo classroom joining, explicit start/continue actions, task-to-workspace progression, and evaluation feedback; Lanqiao Cloud Course role-based learning and institution entry points.
- Selected visual direction: option C, "Quest Learning Map".
- Product interpretation: engineering adventure rather than a children's game. The interface may use maps, stages, unlocks, settlements, and guided prompts, but it must keep the visual seriousness of a computer architecture laboratory.
- Installed implementation guidance: `design-taste-frontend` and the official GSAP skills for core, timeline, React, plugins, utilities, performance, frameworks, and ScrollTrigger.

## Product outcome

Every user should understand the next useful action within five seconds of entering a screen.

Students should be able to:

1. Identify their current course stage and why it is active.
2. Understand the objective and completion condition before opening a lab.
3. Continue the previous task without searching through navigation.
4. Receive specific, actionable evaluation feedback.
5. See how a completed task unlocks the next part of the course.

Teachers should be able to:

1. Complete first-time class setup through a visible checklist.
2. Understand where the class is distributed across the course route.
3. Identify actionable blockers rather than browse decorative metrics.
4. Start, pause, resume, and end a classroom challenge from a clear command surface.
5. Move from a detected problem directly to an intervention.

## Experience architecture

The product uses one shared progression language across both roles:

`course map -> current mission -> workbench -> evaluation -> settlement -> next unlock`

The student experience emphasizes personal progression. The teacher experience emphasizes cohort distribution and intervention. Shared terminology is limited to concepts that genuinely match both roles: stages, missions, blockers, completion, and reports.

The platform retains the current authentication, classroom, assignment, submission, and progress contracts. The redesign derives route and guidance states from existing data rather than introducing a parallel progression system.

## Visual language

### Character

- Engineering-adventure tone with clear circuitry, chip, signal, and workstation references.
- Deep aubergine and charcoal navigation surfaces, warm parchment or very light violet work surfaces, and amber primary actions.
- Violet indicates route identity and active learning context. Amber indicates the primary action or newly unlocked state. Teal remains available for verified success. Red is reserved for errors requiring action.
- Avoid glossy fantasy art, cartoon mascots, noisy particle fields, neon cyberpunk treatments, and generic dashboard card walls.

### Typography and shape

- Manrope remains the primary UI typeface for legibility and continuity.
- Headings may use stronger scale contrast, but operational screens remain compact enough for 1366 x 768 classroom displays.
- Surfaces use deliberate grouping, varied composition, and restrained borders. Repeated equal cards are not the default layout.
- Route nodes may use distinct silhouettes for completed, current, locked, and optional stages, but must pair shape and color with visible labels.

### Motion

GSAP is used only when motion explains state:

- Login entrance establishes the product and then settles immediately.
- The course map moves focus to the current stage.
- A completed evaluation travels into a short settlement sequence and unlocks the next node.
- Signal flow may animate along real circuit connections during simulation.
- Teacher distribution changes may reposition markers without obscuring their new values.

Animations must use transform and opacity where possible, clean up on React component unmount, respect `prefers-reduced-motion`, and avoid infinite decorative movement. Reduced-motion mode replaces travel and scale sequences with direct state changes or short fades.

## Login and role entry

### Layout

Desktop uses a two-part composition:

- The story panel explains the course promise, the short progression sequence, and current classroom context.
- The authentication panel contains role guidance, credentials, recovery help, and the primary action.

Mobile places the course promise above the form and collapses supporting detail so the credentials and primary action remain above the first scroll boundary.

### Behavior

- Student and teacher tabs adjust labels and guidance, not the authentication API contract.
- Student copy asks for the school-issued student identifier. Teacher copy asks for the teacher account.
- Successful returning users continue to their last meaningful destination.
- First-time students enter a skippable guided route: enter classroom, inspect the current mission, open the first lab.
- First-time teachers enter a persistent setup checklist: choose or create a class, import students, choose a mission, start the classroom.
- Login errors preserve entered values, associate the message with the invalid state, and focus the relevant recovery action.

## Student experience

### Student home

The course route is the dominant visual object. It shows completed stages, the current stage, locked stages with visible requirements, optional branches, and total course progress.

Only one dominant action appears in the first viewport: `Enter current stage` or `Continue experiment`. The current mission summary includes objective, estimated effort, prerequisites, completion conditions, deadline when present, and the learning reward or capability unlocked.

Secondary content includes recent evaluation feedback, notes, and upcoming assignments. It must not compete with the current mission.

### Lab entry and workbench

The lab retains a three-part information architecture:

1. Task and reference context.
2. Primary interactive workbench.
3. Evaluation, hints, and state feedback.

The first-use guide highlights one real control at a time and exits permanently after completion or explicit dismissal. It teaches: read the mission, place or manipulate a component, run the simulation, and submit an evaluation.

Evaluation failures name the affected component, connection, input, or expected result when the existing evaluator provides that evidence. Generic failure copy is used only when no specific evidence exists.

### Settlement

Passing a stage triggers a concise settlement view containing what was verified, the capability or next stage unlocked, the next recommended action, and an option to review the completed solution or continue.

The settlement is never a blocking celebration. Keyboard and reduced-motion users can continue immediately.

## Teacher experience

### Classroom command view

The teacher home is a cohort version of the course route. Each stage shows reached students, completion rate, average time where meaningful, and the dominant blocker. The route is paired with a compact classroom status summary, not a broad analytics dashboard.

The classroom lifecycle remains:

`draft -> live -> paused/resumed -> ended`

The primary action changes with lifecycle state. Destructive or terminal transitions require clear confirmation and describe their effect on student submissions.

### Actionable groups

Students are grouped by conditions that support intervention: not entered, stalled beyond the configured threshold, repeated evaluation failure, disconnected during a live session, and completed and ready for extension.

Each group exposes an appropriate action such as push a hint, open an explanation, assign make-up work, or inspect individual evidence. The UI does not invent recommendations when supporting data is absent.

### First-use and empty states

The first-use checklist persists until the teacher has a class, students, a selected mission, and one started session. Empty classes, missing imports, no live session, and no recorded progress each show one clear next action and the prerequisite needed to enable it.

## Component boundaries

The implementation should create or extract focused components with explicit inputs:

- `LoginPortal`: owns layout, role guidance, and authentication form presentation.
- `RoleEntryTabs`: switches labels and onboarding copy without changing credentials or API behavior.
- `StudentQuestMap`: renders the route from course and progress data.
- `CurrentMissionPanel`: renders the single recommended student action.
- `FirstUseGuide`: renders persisted student guidance from a small ordered step model.
- `MissionSettlement`: renders verified result and next unlock.
- `TeacherQuestMap`: aggregates classroom progress onto the same route model.
- `TeacherSetupChecklist`: derives setup completion from current class data.
- `InterventionGroups`: groups supported evidence and exposes existing teacher actions.
- `MotionProvider` or small motion utilities: centralizes reduced-motion detection and GSAP lifecycle cleanup.

The existing `App.jsx` may coordinate role and route state, but these presentation units should not be implemented as additional large inline render functions.

## Data derivation

No new backend endpoint is required for the initial redesign.

- Student route state derives from existing course definitions, authoritative completion evidence, assignments, and the current selected challenge.
- Teacher route distribution derives from existing class overview, student progress, live-session state, submissions, and available analytics.
- First-use state derives from meaningful existing evidence where possible. A small local preference may store dismissal of purely presentational guidance, but must not claim task completion.
- Locked states derive from real prerequisites. They are not decorative sequencing.

If an existing response does not provide enough evidence for a proposed metric or blocker, the UI omits it instead of estimating it.

## Failure and recovery states

- Authentication: preserve form state, show throttling duration, and provide recovery guidance.
- Network failure: distinguish unreachable service from invalid credentials and offer retry without losing local form or workbench state.
- Locked mission: show the unmet prerequisite and a direct route to it.
- Classroom not started: students see the selected task and waiting state; teachers see the action needed to start.
- Evaluation failure: show specific evidence and a next debugging action when available.
- Motion or WebGL failure: core navigation, route selection, lab controls, and submission remain available without animation or WebGL.
- Empty data: show the missing prerequisite and one primary action, never an unexplained empty chart.

## Responsive behavior

### Desktop and classroom displays

- Primary acceptance viewport: 1366 x 768.
- Login form and primary action remain visible without scrolling.
- Student home shows the current route segment, mission, and primary action in the first viewport.
- Teacher home shows lifecycle state, route distribution, and urgent intervention group in the first viewport.

### Mobile

- Primary navigation moves to a bottom or compact top treatment that does not obscure actions.
- Route maps become vertically stepped or horizontally pannable within a clearly bounded route area; the page itself must not overflow horizontally.
- Student mission and teacher lifecycle action precede secondary analytics.
- Interactive targets are at least 44 px.

## Accessibility

- All route nodes are semantic buttons or links with visible names and state descriptions.
- Locked, completed, active, and optional states do not depend on color alone.
- Focus order follows the visible progression and never enters decorative map geometry.
- Focus rings remain visible on dark and light surfaces.
- Status changes use an appropriate live region without repeatedly announcing decorative motion.
- Keyboard users can open a stage, run evaluation, dismiss guidance, and continue from settlement.
- Reduced-motion mode is covered by automated and manual verification.

## Verification

### Unit and component tests

- Course and progress data produce correct completed, current, locked, and optional states.
- Teacher progress is aggregated into the correct route stages and intervention groups.
- Returning and first-time users receive the correct recommended action.
- Role tabs change presentation without changing authentication payload shape.
- Reduced-motion selection bypasses nonessential GSAP timelines.

### Browser flows

- First-time student: login, understand the current mission, open the first lab, run evaluation, pass, and continue from settlement.
- Returning student: login and continue the last meaningful task.
- First-time teacher: login, select/create class, import students, select mission, and start the session.
- Live teacher: pause, resume, inspect a blocker group, and end the session.
- Authentication failure, network failure, locked mission, evaluation failure, and empty-class recovery.
- Keyboard-only route navigation and reduced-motion mode.
- 1366 x 768 desktop and 390 x 844 mobile visual checks.

### Regression gates

- Existing unit and server tests pass.
- Production build succeeds.
- Existing classroom browser flow and load gate continue to pass.
- UI browser QA asserts that the old isolated login card and unclear first-entry states are no longer the primary experience.
- No horizontal page overflow appears at the mobile acceptance viewport.

## Non-goals

- No points economy, virtual currency, store, leaderboard, avatar system, or social competition.
- No replacement of authoritative course completion with client-only unlock state.
- No redesign of backend authentication or classroom lifecycle contracts.
- No decorative animation that competes with laboratory manipulation or teacher monitoring.
- No copying of EduCoder, Lanqiao, or game assets; only interaction and information-architecture patterns are referenced.

## Acceptance summary

The redesign is accepted when login clearly explains both role paths, students can identify and continue the current stage without searching, teachers can move from route-level class status to a useful intervention, first-time guidance remains visible until its real prerequisite is complete, and the complete experience stays usable on classroom desktops, mobile screens, keyboards, reduced-motion environments, and low-capability integrated graphics.
