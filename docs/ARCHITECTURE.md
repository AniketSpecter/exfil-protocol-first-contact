# Architecture

This is a static client-side game. Vite bundles Phaser and ES modules; GitHub Pages serves the output. No application server or secret is required.

| Module                        | Responsibility                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `src/main.js`                 | Bootstraps Phaser, browser storage, audio, UI, visibility and rotation handling  |
| `src/scenes/Boot.js`          | Generates browser gameplay textures and prepares the island                      |
| `src/scenes/Raid.js`          | Raid lifecycle, input, combat, objectives, pickups, recovery, travel and results |
| `src/data/mission.js`         | Authored walkable polygons, cover, docks, missions, patrol routes and loot       |
| `src/data/weapons.js`         | Weapon definitions, slot assignments and starting loadout                        |
| `src/systems/geometry.js`     | Collision, movement, line of sight, ray impacts and pathfinding                  |
| `src/systems/enemy.js`        | Patrol, suspicion, investigation, engagement and cover behavior                  |
| `src/systems/companion.js`    | Follow, spacing, combat support and safe revival                                 |
| `src/systems/progression.js`  | Versioned save validation, unique evidence rewards and mission unlocks           |
| `src/systems/touch-layout.js` | Validated normalized preferences and drag/resize/opacity editor                  |
| `src/systems/audio.js`        | Web Audio effects, ambience and mute preference                                  |
| `src/systems/display.js`      | Fullscreen requests, failure feedback and viewport resizing                      |
| `src/ui.js`                   | Screen navigation, briefing, touch controls, HUD, Credits and results            |
| `src/ui-journey.js`           | Scripted ocean crossing presentation and progress                                |

## Main decisions

- The map is authored data so collision and pathfinding share the same walkable space. The recon map and its markers use common coordinates.
- Evidence banking and settlement are idempotent. Completing a transmission does not itself unlock the next mission; successful extraction does.
- Three weapon slots retain separate magazines and reserves. Pickups replace the matching slot rather than adding an unbounded inventory.
- Boat travel preserves in-raid state, moves surviving passengers and blocks combat input until the transition completes. Pause freezes the crossing.
- UI controls use DOM pointer events and pointer capture for simultaneous thumb input. Cancel/lost-capture handlers release held actions. Editing freezes the raid.
- Touch-layout centers are stored as normalized coordinates. Controls are clamped to the viewport and keep a minimum target size; users may create overlaps intentionally.
- Saves are local and schema-validated. Storage failure falls back to session memory rather than blocking play.
- The development QA harness requires both a development build and an explicit `?qa=1` URL; production dead-code elimination removes it.

## Tradeoffs and future work

Raid orchestration and presentation remain relatively centralized for this prototype. Future work should split combat, inventory and screen templates into smaller modules as content grows. The current companion recovery may reform a stuck follower to protect mission flow. Two contracts are implemented; later cargo/blacksite missions remain concepts. Physical-device testing and human balancing should precede a claim of broad mobile support.
