# Testing

Use `npm ci` before running checks. Browser scripts use an installed Google Chrome and Playwright. Start `npm run dev` in another terminal for development browser tests. Reports and captures go to ignored `qa/`; create that directory if needed. `EXFIL_LIVE_QA=1` runs supported campaign/touch scripts visibly with the Canvas fallback.

| Command                        | Scope                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                     | Save validation, once-only rewards, geometry, mission reachability and touch-layout bounds                                   |
| `npm run audit:public`         | Public file inventory, secret patterns, local paths and PNG metadata                                                         |
| `npm run test:browser`         | Complete two-mission keyboard/mouse routes with live enemies, plus explicitly marked edge-case fixtures                      |
| `npm run test:touch-route`     | Complete two-mission CDP touch routes with live enemies; no teleportation or invulnerability                                 |
| `npm run test:mobile`          | Simultaneous sticks, reload, slots, TX, objectives, extraction, boats, revival and rotation; focused objectives use fixtures |
| `npm run test:touch-editor`    | Real dragging, persistence, actual movement from a relocated stick, size/opacity, Cancel and Defaults                        |
| `npm run test:touch-ux`        | Touch-only instructions, rotation, paused map state, cancellation and medkit                                                 |
| `npm run test:launch`          | Home, recon alignment, Credits and first-touch activation across desktop/tablet/phone                                        |
| `npm run test:layouts`         | Ten HUD controls inside the viewport, unobstructed and at least 44px                                                         |
| `npm run test:mobile-pages`    | Five non-combat screens at four sizes, including initial action visibility without auto-scrolling                            |
| `npm run test:weapons-journey` | Focused drops, ammo/slots, pickup, knife movement/melee, Q and boat retention/arrival                                        |
| `npm run test:recovery`        | Focused bleed-out, threat blocking, lost-squad and passenger cases                                                           |
| `npm run test:presentation`    | Supplied title aspect ratios and settings/controls                                                                           |

Build and test the release below a repository-style URL:

```sh
npm run build:portable
```

Set `EXFIL_BUILD_DIR=dist-portable`, then run `npm run test:production`. This test serves the built game under `/games/first-contact/`, checks the menu, creator credit, missing resources, production harness exclusion, input, phone layout editor and knife selector.

The main working build passed complete desktop and touch-emulated campaign routes. The clean public checkout is also installed, audited and built independently before publication. Deployment and hosted checks are recorded in [Release validation](RELEASE_VALIDATION.md).

Physical phones, Safari, human balance, session length, retention and accessibility have not been certified. Fixtures isolate correctness; they must not be presented as human play-test results. No claims of measured retention or company endorsement are made.
