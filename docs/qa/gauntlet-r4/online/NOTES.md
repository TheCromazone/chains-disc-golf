# Gauntlet r4: multiplayer and robustness

Branch `r4-online` from `7e1e53a`. Everything here was played in muted headless Chrome: a host on an emulated desktop
(1440x900, mouse) and a guest on an emulated iPhone (390x844 @3x, touch, iOS UA), each in its own Chrome, through a local
PeerServer. With `--relay`, the guest's WebRTC cannot open (relay-only ICE, no TURN), so it plays over the public MQTT
brokers the way a phone on cellular does. Every throw is a real swipe on the thrower's own screen, to the power the shot
guide suggests. `tools/qa/live-room.mjs` is that playtest, rerunnable.

## What was broken, and what changed

### 1. Desktop: picking another course left a black screen (and a room on that course could not start)
- **Problem:** in the clubhouse on Desktop, choosing Cedar Meadows faded to black and stayed there. Pine Hollow stayed
  loaded underneath, half torn down. `verify-rounds` failed on it (`r?.dispose is not a function`).
- **Cause:** Desktop has no sky panorama, so `applyCourse` passed `pano = false` (`panoUrl && await ...`), and
  `course.dispose()` called `false?.dispose()`, which throws. Every later `loadCourse` threw the same way, so a live room
  set to any course but the first could not start on a Desktop client.
- **Fix:** `pano` is `null` when there is none (`src/main.js`, one line).
- **Measured:** the course-switch probe went from a black screen with `TypeError: pano?.dispose is not a function` to
  Cedar Meadows with no errors (`1-desktop-course-switch-before-after.jpg`). `verify-rounds` went from failing to passing
  on all four courses with no browser errors.

### 2. Watching someone else's throw showed the swipe hint and an empty power ring
- **Problem:** while the guest wound up, the host's screen said "LONGER SWIPE = MORE POWER" and showed an empty POWER
  ring, as if it were the host's turn. The same happened when watching a bot.
- **Cause:** `body.thrown[data-phase='windup'] #pad .hint` outranked `#pad.idle .hint`. A remote throw's windup also had
  no progress callback, so the ring never filled. A bot's windup has one.
- **Fix:** the windup rule skips an idle pad (`src/ui.css`). `applyRemoteThrow` fills the ring to the thrower's power the
  way a bot's windup does (`src/main.js`). Only the hint's visibility and the ring's fill changed, not the HUD layout.
- **Measured:** `2-watcher-hud-before-after.jpg`, host watching the guest's run-up. Before: the hint and "POWER". After:
  no hint, and the ring reads 60% mid run-up.

### 3. A late throw request sent the guest through a resync mid-flight (and verify-relay case 3 was racing)
- **Problem:** `verify-relay` failed case 3 on every run (3 of 3): "1 tries, strokes 0 → 1".
- **Cause (harness):** the test held the first throw request for a fixed 9 s. The guest asks for its turn back at 7 s, but
  in verify-relay's software-GL Chrome the snapshot rebuild hits the 6 s shader warm-up cap (measured: `loading` from
  7483 ms to 13501 ms). The late copy therefore arrived first and counted, correctly, once.
- **Cause (game), found once the harness let the late copy arrive after the second throw:** the host answered the late
  copy with `throw-denied`. The guest, mid-flight on its own throw, showed "Round synchronizing" and rebuilt the round.
  This happens for real over the relay, which delivers frames queued while a phone was locked once the phone is back.
- **Fix:** the host silently drops a request for a turn already thrown: the one it took (`G.thrownTurn`), or an earlier
  stroke or hole of that guest. A guest that is genuinely behind still resyncs on its own (watchConfirm, turn markers).
  No message shape changed. The case-3 harness now holds the request until the guest has thrown again (30 s at most) and
  also checks that no resync toast appeared.
- **Measured:** case 3 PASS, 2 tries. Guest toasts went from `["Back in the round","Round synchronizing","Back in the
  round","Nice shot!"]` to `["Back in the round","Nice shot!"]`. Full `verify-relay`: 12/12.

### 4. iPhone Safari invitees were never told to open the link in their Home Screen app
- **Cause:** in `src/match.js`, the `matchJoinApp` toggle sat inside the comment on the line above it from the day the
  feature landed.
- **Fix:** the toggle is its own statement again.

### 5. Boot: a dropped request on a cold first load left a dead screen or a black athlete
The lead's iOS first load ended on "The course could not load", and a reload fixed it. I could not reproduce that exact
failure in headless Chrome. With a cold cache (cache disabled and cleared each time), CPU throttled 4-6x and a 4 Mbps /
150 ms network, all 6 boots succeeded (3 at 27-30 s on the old code, 3 at 30-48 s on the new). Failing requests through
CDP's Fetch domain did reproduce the general kind of failure, in two worse forms:
- **One dropped game file:** any module of the graph, or the bundle on the live site. The module stopped before main.js
  ran, and the page sat on "Growing the course…" for good: `stuck` after 45 s and after 240 s, no message, no button.
- **One dropped texture or GLB:** it stayed broken for the session. A lost body albedo drew the athlete's skin black. A
  lost grass map left the turf blank.

**Fix:**
- `index.html` catches a module that failed to download (the module script's `error` event) or threw while loading, and
  reloads once by itself. A second failure within a minute shows the reason and a Reload button. main.js's own startup
  failure takes the same path, so a one-off iOS first-load failure now gets that reload without a tap.
- `src/assets.js`: `ImageLoader` and `FileLoader` loads retry after 0.8 s and 2.4 s. That covers textures, GLBs and the
  Draco and Basis decoders. A 4xx is not retried. The loading manager keeps the item open, so the loading screen still
  waits for the retry.

**Measured** (`3-boot-dropped-request-before-after.jpg`; the "before" tree is 296b14b):

| injected failure | before | after |
|---|---|---|
| `src/course.js` fails once | stuck on the loading screen | one auto reload, boots in 2.1 s |
| `src/course.js` always fails | stuck | one auto reload, then the reason ("A game file did not download.") and Reload |
| `src/effects.js` fails once (Desktop) | "The course could not load" | one auto reload, boots in 2.9 s |
| body albedo and grass fail once | boots, athlete's skin black | boots, athlete correct |
| 5% of all requests fail (dev server, ~100 files) | stuck | auto reload, then the reason and Reload |
| 8% of asset requests fail, 6 boots | 6 boots OK, with 3-9 assets missing per boot | not rerun (the fail-once rows show the retry) |

### 6. A guest whose tab reloads mid-round now rejoins by itself
- **Problem:** after a reload, the guest landed on the clubhouse, or on a Join button if they had come in by link. Over
  the relay, rejoining spent another 10 s on a direct attempt, all inside the 30 s the host holds the seat. iOS reloads a
  phone's tab that it put away, so this happens in real rounds.
- **Fix:** the guest's tab keeps `?room=CODE` in the address bar and remembers, in sessionStorage, that it was in the
  room (`chains.inRoom`) and which transport it used (`chains.room.CODE.via`). On reload it joins again by itself, through
  the relay first when that is how it played. Leaving, being rejected or a failed join clears it. These are new keys
  only; existing keys and message shapes are unchanged.
- **Measured** (live-room playtest, guest reloading mid-hole):
  - Relay guest: before, 15.2 s and a tap on Join. After, 6.7 s with no tap (`4-guest-reload-relay-before-after.jpg`).
  - Direct guest, back-to-back A/B on a quiet machine with `--root`: before, back in the round 3.0 s after the reload,
    with the script tapping Join the instant it appeared. After, 4.3 s with no tap; the game itself booted 1.4 s vs
    3.2 s, which is noise. Under load from parallel runs the same check took 14-27 s; that is renderer contention, not
    the rejoin.
  - The screen reads "Back to room CODE" while it reconnects.

## Playtest results, after the fixes
- **Live room, direct, 3 holes:** 14/14 checks. 29 throws, every one with the same path, landing and scores on both
  screens.
  - The watcher sees each remote throw's run-up (drives from more than 40 m with a clear run-up), windup, release and
    follow-through to 1.0, as the thrower does.
  - "Desk is throwing…" / "Phone is throwing…" shows on the watcher's screen.
  - Guest backgrounded 10 s while the host threw: back in sync.
  - Guest reloaded mid-hole: back in the round by itself.
  - A third player knocking after the start is told "This round has started…", and the round is untouched.
  - When the host leaves, the guest gets "The host left" and lands in the clubhouse.
  - No page errors.
- **Live room, forced relay, 2 holes:** 11/11 checks. 17 throws, 0 disagreements. Join through the relay in 11.6 s (the
  10 s direct attempt first, as designed). The background and reload checks pass.
- **Pass & play** (one emulated iPhone, three typed names, two holes, 29 turns): no problems.
  - Names land.
  - Every hand-off shows "<name>'s throw" (checked with a toast observer), and the HUD names the thrower on every turn.
  - Turn order follows tee order on the tee, then farthest away, then honours on the next tee.
  - The scorecard matches each player's strokes.
- **Invite matches:**
  - `verify-matches` passes.
  - Polling audit, two phones, 70 s: the open match asks only `?action=seq` (the CDN-cached one), every 5 s. The full
    match is fetched only on open, on join and once when `seq` moved. No uncached polling.
- **Verify suite:** `verify-matches` PASS, `verify-relay` 12/12, `verify-rounds` 4 courses PASS, `npm test` 13/13.
- **Mobile cost:** the render path is untouched. Draw calls and triangles at 844x390 @3x, Mobile tier, are identical to
  the lead's baseline at every moment:

  | moment | draw calls | triangles |
  |---|---|---|
  | menu | 80 | 972,198 |
  | flyover | 125 | 849,312 |
  | tee | 125 | 925,066 |
  | putt | 111 | 991,471 |
  | scorecard | 111 | 998,906 |

  frameMs was not compared, because the GPU was shared with parallel runs.

## Tools
- `tools/qa/live-room.mjs`: the live-room playtest above (`--relay`, `--holes`, `--root` for an A/B against another
  checkout). It refuses to start when one of its ports is taken. A Chrome already on the debug port would take its pages
  as hidden extra tabs, and they stall.

## Found, not fixed
- **Snapshot restores rebuild the whole round.** `restoreRoom` runs `startGame`: new characters, then `warmShaders`.
  That is fast on a GPU (`startGame` 72-463 ms here), but in software GL it hits the 6 s warm-up cap. A same-session
  restore could keep its players and only reapply state.
- **The Friends list fetches every listed match after a page load.** `openHome` fetches the full match for each one, up
  to 20 Blob reads, because `matchCache` lives in memory only. This is not polling.
- **The chase camera after a watched run-up is low over the turf,** and the disc is hard to find (watcher flight frames).
  That belongs to the camera area.
