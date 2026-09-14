# Layout QA

`overlap-audit.js` walks every screen (hub, courses, locker room, pass & play setup, online, help, in-game HUD with the waiting pill shown, scorecard) and reports any two visible controls whose boxes overlap, plus anything off screen.

Run it in the browser devtools console on http://localhost:8093 after the menu has loaded, at each viewport you care about (the ones we check: 360×740, 430×932, 812×375, 568×320, 768×1024, 1366×768). Paste the file contents into the console; the last expression prints a JSON summary. Every line should read `ov:- off:-`. Scrollable rows (throw and disc chips) can report a clipped last chip on very small screens; that is a scroll, not an overlap.
