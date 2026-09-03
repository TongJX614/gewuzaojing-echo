# Architecture

## Modules

- Echo owns the pixel RPG, scenes, dialogue, saves, system menu and in-game web container.
- QuillForge owns worldbook generation, review, sessions, GALGAME pages and generated mini-games.
- `shared/contracts` owns the only cross-application environment and iframe message interfaces.

## Seam and adapters

Echo never imports QuillForge Python modules; it opens the configured local URL in an iframe and consumes the shared message vocabulary. QuillForge never reads Echo game state; its browser adapter announces readiness, requests the Echo pause menu on Escape, and receives pause/resume notifications. Both environment adapters resolve the same absolute root `.env`.

## Experience sequence

`Echo VR researcher → iframe → QuillForge worldbook review → GALGAME`
