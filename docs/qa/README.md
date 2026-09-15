# Current QA: round three

Current evidence is in [r3/](r3/). Older reports and reusable scripts remain, but their historical images were removed from the working tree: **214 images/videos, 43,971,015 bytes**. Those historical captures remain recoverable from Git at `d8d7b4b`. This prunes the checkout; it does not rewrite Git history.

`overlap-audit.js` walks the clubhouse, courses, locker (including scroll bottom), local setup, online, help, HUD, **open ten-entry throw sheet**, leave dialog and scorecard. It rejects overlapping controls, offscreen controls and clipped button labels. It also asserts that exactly ten throw choices exist and that the sheet opens.

Run `capture-round2.mjs --all` with `QA_PREFIX=r3/after` and the installed `PLAYWRIGHT_MODULE`, with the app served at `http://localhost:8093`. The runner evaluates the audit at **360×740, 430×932, 812×375, 568×320, 768×1024, 1366×768** and saves results and screenshots. Every result must read `ov:- off:- clipped:-`. It fails on audit findings or application errors; screenshot-induced GPU ReadPixels warnings remain recorded separately.

Physical Android/iPhone performance is tracked in [the device report](r3/sound-device-report.md); desktop browser checks do not establish phone frame rates.
