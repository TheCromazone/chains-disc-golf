# Final sound and feedback critique

## Verdicts

| Area | Verdict | Basis |
| --- | --- | --- |
| Requested ElevenLabs sound library | **FAIL / BLOCKED** | `assets/manifest.json` still contains `"sfx": {}`. None of the twelve requested recordings is delivered through the manifest. The API credential remains unavailable; generation is explicitly pending. |
| Synth fallback and sample integration | **PASS by code review, limited runtime evidence** | Missing samples fall back independently; all effect output shares the master gain; pre-unlock mute now initializes that gain correctly. |
| Outcome-dependent reactions | **PASS for the reviewed fixes** | Successful ricochets suppress Ohhh; multiple contacts in a missed throw produce one Ohhh; Chains! still fires. The focused handler test passes. |
| Final audible polish | **NOT VERIFIED** | No generated recordings exist to audition, balance against gameplay, or verify in-browser decoding and timing. |

## Sound: single biggest remaining gap

The actual requested ElevenLabs assets are missing. A working generator and pleasant synthetic fallbacks do not satisfy delivery of generated chains at three speeds, band, tray, tree, grass, splash, whoosh, applause, Ohhh, and birdie jingle under `manifest.sfx`. This remains the deciding sound failure; it should not be obscured by passing code tests.

**Concrete completion step:** when an authorized credential becomes available, generate the twelve files, inspect their provenance and measured peaks, listen to every effect, then verify the manifest URLs decode and play in the game. Until then, report the library as blocked.

The normalization implementation is now meaningfully tested: `python test/sfx-normalization.py` completed successfully and measured **-6.0 dBFS**, with a **48,044-byte** WAV. This verifies the real normalizer on a local sine fixture. It does **not** verify any ElevenLabs recording. Existing target WAVs are still reused without measuring their peak; any future resumed run should independently validate reused files before claiming all delivered files meet the target.

## Feedback: prior biggest defect is fixed

The previous unconditional disappointment reaction is gone. `onFlightEvent` now checks the already-known `G.flight.result.holed` and uses `G.flight.missReaction` to suppress duplicate crowd reactions. Physical collision effects remain audible. A new flight object naturally resets the guard.

`node test/feedback.test.mjs` passed these checks:

- Rim followed by tray on a made shot produces zero Ohhh calls.
- Rim, band, and chainout on a missed shot produce one Ohhh call.
- Chains receives the throw-power argument and displays Chains!.

`resolveThrow` still visibly routes made shots to fanfare plus applause and successful approaches to Nice shot! plus applause. Birdie/eagle/ace fanfare routing selects the requested birdie sample when available. The result camera is now updated immediately so the reaction can begin in frame; this final review did not perform a new visual capture and does not claim visual verification of that camera change.

**Single biggest remaining feedback gap:** audible pacing is still unverified with the intended assets. The planned applause and jingle last 3.0 and 2.7 seconds, but the result begins fading after 2.0 seconds and changes turn after approximately 2.32 seconds. Their tails will cross the transition. This is an objective timing mismatch, not proof that it sounds bad; once recordings exist, audition a birdie and either hold its result long enough for the cadence or intentionally fade/duck the reaction across the transition. Do not call the final audio feedback polished based on the handler test alone.

## Scope and remaining technical limits

- **Independent fallback:** `Promise.allSettled` isolates fetch/decode rejection for each sample. Absent buffers return false and retain their matching synth path. Reviewed structurally; no real-library decode test was possible.
- **Mute:** `unlock()` now uses `muted ? 0 : VOL`. Synth, sample, and reverb routes feed the master gain. The pre-unlock state bug is fixed by inspection; neither provided focused test exercises Web Audio mute behavior.
- **Impact timing:** flight position and collision event dispatch share simulation time, including chain slowdown. Samples themselves retain ordinary playback speed. Whether their tails fit the slowed visual requires listening.
- **Chain speed labels:** selection still uses launch power, not velocity at basket contact. The test description says speed-class input, but it actually verifies a power value of 0.9. This is an approximation, not measured contact-speed routing.
- **Screenshot evidence:** the earlier `11-feedback-430.png` was created by injecting a toast. It supports text styling only and cannot establish sound quality, live scoring, or result pacing.

Production code was not changed. Only this final review document was written. No Git operations and no external generation requests were performed.
