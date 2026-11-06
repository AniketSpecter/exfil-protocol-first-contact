# Release validation

## 3.1.1 full-media update

The current default build restores 35 selected tactical graphics, 31 runtime sound cues and the supplied EXFIL title soundtrack. Original source installations and private import manifests remain excluded. A path-free catalog validates the exact media hashes. Audio and Music preferences are independent and saved; UI sounds are throttled. The original third-party notices accompany the runtime media.

Eleven media/audio checks passed for user activation, restored textures, 31 non-silent cues, ocean looping, UI confirmation/Back/hover, hover throttling, independent saved Audio/Music toggles, score fades, voice cues and returning to the menu. Phone launch/layout/screen/editor checks also passed with the additional Music control. Both full-media and replacement builds passed eight production checks below a repository-style path. A browser-level playback probe passed eight additional checks both locally and on the live GitHub Pages deployment, including actual soundtrack playback, independent mute controls, persistent preferences, deploy/menu transitions and phone button reachability. GitHub Actions build and deploy succeeded for the full-media release.

The earlier 3.1.0 checks below document the replacement-media release. Full-media validation adds bank decoding, non-silent cues, restored texture loading, operator/enemy voices, menu music fades and independent audio/music controls.

7 November 2026 · version 3.1.0

The public edition was installed and built from a separate allowlisted checkout before publication. No imported game media or workstation history is required.

| Check                               | Result                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public inventory scan               | Passed; no matched credentials, private keys, workstation paths, personal email patterns, imported media or PNG metadata                         |
| Locked install                      | `npm ci` passed; npm reported zero known vulnerabilities                                                                                         |
| Unit tests                          | 21 passed                                                                                                                                        |
| Production build                    | Public edition compiled with relative assets                                                                                                     |
| Nested-path production browser test | 8 checks passed: title/menu, creator credit, no development harness, desktop input, phone editor save, knife selector, pause and resource errors |
| Public home and Credits             | 15 launch checks passed across desktop/tablet/phone, including first-touch activation                                                            |
| Public non-combat screens           | 20 responsive checks passed; primary actions initially visible without auto-scrolling                                                            |
| Public touch editor                 | 7 checks passed, including actual movement from a relocated stick, save, Cancel, resize and Defaults                                             |
| Public full touch campaign          | Both missions completed with live guards using real touch events and read-only route inspection; no actor repositioning or invulnerability       |

The inventory scan is a bounded automated check, not a claim that any scanner can prove the absence of every possible secret. Publication uses only the reviewed file list and a fresh Git history. Physical Android/iOS Safari, human balance, ergonomics and accessibility testing remain pending.

## Hosted verification

The public repository is [AniketSpecter/exfil-protocol-first-contact](https://github.com/AniketSpecter/exfil-protocol-first-contact). GitHub Actions' build and deploy jobs completed successfully. The game is live at [EXFIL PROTOCOL: FIRST CONTACT](https://aniketspecter.github.io/exfil-protocol-first-contact/).

Six hosted browser checks passed:

1. HTTPS title/menu load at the standard Pages URL; development harness absent.
2. Credits show Aniket [UGZ], Auto Sprite AI and AI-assisted programming, without internal file/edition instructions.
3. Desktop raid renders and accepts input, knife selection, Q switch and pause.
4. The 800x360 menu fits, and touch-layout preferences save without click-through.
5. Actual touch firing reduces ammunition; the phone selector equips the knife and pause responds.
6. No failed resources or uncaught exceptions; the tested game runtime requested only its own GitHub Pages origin.

These are browser-automation checks of the hosted release. They do not replace physical-device or human usability testing.
