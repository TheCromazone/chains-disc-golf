# Codex round three — textures, per-throw animation, left-handers, devices

Paste everything between the rules into Codex in the game folder.

---

You are continuing Chains. Round two is verified: the Wii Sports direction, the Mii golfer, the glass clubhouse and locker room, the Lite budget and every test all hold. Start by reading the uncommitted working tree from the last review pass and committing it as its own commit. It contains painted-grain detail slots in src/materials.js (a mid-grey 256px tile listed in the manifest as textures.grass_detail, leaf_detail, bark_detail, concrete_detail or water_detail replaces the canvas grain), a corrected right-handed backhand and a blade pose in src/player.js, inside-out and outside-in presets and the blade in the THROWS table of src/physics.js with tests, a throwing-hand choice in the locker (avatar.hand; the procedural rig mirrors its pose, the GLB rig is scale-flipped for now), and waiting players parked at their own lies out of the thrower's line.

Three pieces this round. For each, run a builder and a separate harsh critic with fresh context; the critic puts ours next to Nintendo Switch Sports golf footage at phone size, blind, and names the single biggest gap. Loop until ours wins.

Textures. The world is flat toon colour plus canvas grain. Paint real tiles: fairway grass with mow stripes, rough, green, sand, bark, pine and deciduous canopy, tee rubber, basket metal, water ripples, and jersey fabric and skin for the golfer. Ship them as small KTX2 or JPEG tiles into the manifest slots above, keep the toon ramp and the bright palette, keep Lite under 2 MB at startup.

Animation. Author one Blender clip per throw for the GLB golfer from real footage: backhand with the reach-back across the chest, forehand flick from the hip, hammer (our tomahawk), scoober, blade, putt, and inside-out and outside-in as bank variants of the base clips. Export a mirrored left-handed set so the jersey print stays readable and replace the runtime scale flip in src/gltf-player.js. Keep the eleven bone names and the phase contract (0 to 0.5 windup, 0.62 release, 0.5 to 1 follow-through), and match the procedural rig's timing so Lite and Full read the same throw.

Sound and devices. Generate the twelve ElevenLabs effects if ELEVENLABS_API_KEY is present, otherwise leave synthesis alone. Measure Lite and Full on a real Android phone and an iPhone and record the frame rates; desktop numbers do not count.

Keep the physics test green and extend test/physics.test.mjs for any throw you touch. Rerun docs/qa/overlap-audit.js at all six viewports with the ten-entry throw sheet open. Commit per piece with before and after screenshots, and prune docs/qa to the current milestone's images so the repository stops carrying 43 MB of old screenshots and reference captures. Ask nothing; record decisions in docs/decisions.md.

---
