# Full-media and audio update

7 November 2026 · version 3.1.1

1. Restore the selected 35 operator/weapon/terrain/prop graphics from the local game. Include only runtime files with relative names and hashes; exclude original source installations and the private import manifest.
2. Restore the selected ocean, boat, weapon, footstep, operator and bot recordings in one compiled audio bank, retaining their third-party notices. The bank is a game runtime asset, not an original source sound-pack directory.
3. Add the supplied EXFIL menu title score after user activation. Loop it in menu/briefing flows, fade on deployment, return on menu navigation and pause it when the browser tab is hidden. Remove embedded tags from the published copy.
4. Add quiet, throttled UI feedback for mouse hover, confirmation, Back, toggles and unavailable actions. Editor dragging and repeated taps must not spam audio.
5. Expose separate, persistent Audio and Music controls in the top bar and Settings. Audio controls effects/voices/ambience; Music controls the menu score. Keep phone controls reachable with the extra button.
6. Keep the optional replacement-media build available. Make GitHub Pages deploy the full-media build by default; audit assets/hashes and scan for sensitive files before upload.
7. Verify bank decoding and original sprite loading, ambience/voice playback, title-score lifecycle, independent toggles, saved preferences and mobile layouts. Build both editions, deploy, check the hosted media and update downloadable release files.

Physical-phone audio behavior remains a separate manual verification step. Original notices are retained; included game media is not represented as CC0 or an unrestricted stock asset pack.
