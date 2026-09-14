# Chains — mobile-first 3D disc golf (design)

## Goal
A polished, GitHub-worthy disc golf game that plays like "8 Ball Pool for disc golf": aim by dragging the scene, pick a disc and throw type, swipe in the throw pad (gesture shape differs per throw), power bar fills with the swipe, disc flies with realistic turn/fade physics. Single player vs bots, pass-and-play, and online rooms.

## Stack
- Three.js 0.170 via CDN import map, ES modules, no build step (GitHub Pages friendly).
- PeerJS (public signalling) for online rooms; turn-based so we only exchange throws + trajectories.
- Web Audio synthesized sounds (no asset files). All textures procedural (canvas).

## Rules implemented (PDGA stroke play, simplified)
- 9 holes with par 3/4; score = throws + penalties, shown relative to par (ace/eagle/birdie/par/bogey…).
- Tee order: honors (best score on previous hole). After tee: player farthest from the basket throws next.
- Holed when the disc comes to rest in the tray or is caught by the chains (fast putts can "chain out").
- Out of bounds (water, course boundary): +1 stroke, play from last in-bounds point.
- Circle 1 (10 m) indicator for putting range. Pick-up cap at par+4 to keep rounds moving.

## Modules
- `src/physics.js` — pure math flight model (lift/drag vs angle of attack, gyroscopic roll = turn/fade based on speed vs the disc's stable speed, skips, rollers, tree kicks, basket catch logic, water/OB). Used by the renderer, bots, and the Node test.
- `src/course.js` — seeded terrain heightmap, fairway corridors, instanced trees/bushes, ponds, tee pads, baskets, sky/lighting. Exposes the `world` object physics needs.
- `src/player.js` — procedural rigged humanoid + keyframed throw animations (backhand, forehand, tomahawk, scoober, putt). Windup is scrubbed by the swipe, release plays on lift.
- `src/input.js` — pointer events: scene drag = aim yaw/pitch, pad swipe = throw gesture (direction validated per throw type, power from length, hyzer/yaw from lateral offset, wobble adds error).
- `src/bot.js` — candidate throws simulated with the physics model, scored by distance/OB, then noised by difficulty.
- `src/net.js` — PeerJS host/guest; host relays throws in order, everyone replays trajectories.
- `src/ui.js`, `src/audio.js`, `src/main.js` — HUD/menus, sounds, game state machine.

## Gestures
| Throw | Swipe | Lateral axis |
|---|---|---|
| Backhand | → | down = hyzer |
| Forehand | ← | down = hyzer |
| Tomahawk | ↓ | left/right = aim |
| Scoober | ↖ | across = hyzer |
| Putt | ↑ | left/right = aim |
