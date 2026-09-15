# Sound and feedback critic

Reviewed `src/audio.js`, `src/main.js`, `src/physics.js`, `tools/generate-sfx.py`, `assets/manifest.json`, `docs/qa/capture-round2.mjs`, and `docs/qa/11-feedback-430.png`.

## Sound — biggest gap: the requested recordings are absent

**FAIL / externally blocked.** `manifest.sfx` is `{}` and `assets/sfx` does not exist. All twelve requested effects therefore use synthesized fallback. The generation script is useful preparation, but is not delivery of ElevenLabs audio. A read-only invocation of the script's key lookup returned `ELEVENLABS_API_KEY available: False`; no API request was made. No generated-file peak measurement, listening assessment, or provider provenance can honestly be reported.

**Concrete fix:** supply the authorized ElevenLabs credential, run `tools/generate-sfx.py`, listen to all twelve WAV files, independently measure each peak at approximately -6 dBFS, and verify all twelve `manifest.sfx` URLs fetch and decode successfully. Preserve the current honest blocked status until this succeeds.

The normalization math targets -6 dBFS for newly created mono 24 kHz PCM. Existing WAVs are reused without measuring their peak, so revalidation must include reused files. Having normalization code is not evidence that nonexistent audio is normalized.

## Feedback — biggest gap: disappointment plays for successful ricochets

**FAIL.** `onFlightEvent()` immediately calls `sfx.ohh()` for each `chainout`, `band`, or `rim` event, even when the already-computed flight result says the disc ultimately holes. Basket physics can catch the disc in the tray after a contact. This creates an emotionally contradictory sequence: sympathetic failure sound, then Chains!, then applause and a reward tune. Repeated contacts can also stack multiple Ohhh sounds.

**Concrete fix:** retain the physical collision sounds at contact time; play the crowd Ohhh only when the flight result is not holed, and at most once per throw. Because the result is already available during playback, this does not need to delay collision audio. Reset the reaction guard when constructing a new flight.

Focused VM test extracted the actual `onFlightEvent` function, set `G.flight.result.holed = true`, then dispatched `rim` followed by `drop`. Observed audio calls: `["ohh", "band", "drop"]`. This confirms the handler fails to suppress disappointment for a known make; it is a handler test, not an end-to-end simulated shot.

## Requested supporting checks

- **Fallback independence:** structurally sound for the requested effects. Each entry loads inside `Promise.allSettled`; one failed fetch/decode does not prevent other entries loading. A missing buffer returns false and triggers the corresponding synthesizer. No real-file runtime decode test is possible with the current empty library.
- **Timing:** collision events dispatch against simulation time, which also drives the rendered flight. The make slowdown uses that shared clock. Reward jingle and applause start together at `resolveThrow`; result UI lasts 2 seconds, whereas planned jingle/applause last 2.7/3 seconds, so the transition begins while those samples would still be playing. This overlap needs an actual listening pass once audio exists.
- **Mute:** loaded samples, synthesizers, and reverb all feed the same master gain, so ordinary mute covers all effects. There is a small initialization edge: `setMuted(true)` before `unlock()` records mute state, but `unlock()` sets master gain to `VOL` unconditionally. Initialize master gain from `muted`. Normal first-pointer unlock precedes the mute button handler, but keyboard or programmatic activation can expose this edge.
- **Three chain speeds:** the routing exists, but it selects by original throw power rather than velocity at basket contact. That is a weak proxy for impact speed, especially across throw types and flight distances.
- **Visual evidence:** the 430px screenshot shows readable cheerful Chains! text with a clear subtitle. However `capture-round2.mjs` explicitly injects `ui.toast('Chains!', 'Birdie · one under par', 10000)` while the player is still on the tee. It proves styling only, not actual make feedback, score accuracy, collision timing, audio playback, or result transition quality.

No production code changed in this review. No claim of completed generated sound delivery.
