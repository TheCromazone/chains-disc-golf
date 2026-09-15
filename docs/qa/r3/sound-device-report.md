# Round 3 — sound and physical devices

## Result

The existing generator resolves **no `ELEVENLABS_API_KEY`**, including its nearest `.env` / `.env.local` lookup. Its twelve prompts are present, and `manifest.sfx` is empty. In accordance with this round's conditional instruction, no generation request was sent and all audio and synthesis code was left unchanged. There are no new recordings to audition or compare blind.

**Physical Android and iPhone frame rates remain unmeasured.** Windows exposes seven Bluetooth/audio endpoints for a paired iPhone, but no USB/WPD/ADB phone endpoint or browser debugging bridge. A Bluetooth audio connection cannot instrument Safari. No Android device was found. No desktop or emulated result is reported as a phone result.

Machine-readable findings: [sound-device-detection.json](sound-device-detection.json).

## Reproduce discovery

The key check imports the existing generator and prints only `bool(generator.key())`, never its contents. It also checks `len(generator.PROMPTS)` and the manifest's `sfx` entry count.

```powershell
Get-Command adb, idevice_id, ideviceinfo, iproxy, usbmuxd -ErrorAction SilentlyContinue
Test-Path "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
Test-Path 'C:/Program Files (x86)/Common Files/Apple/Mobile Device Support'
Test-Path 'C:/Program Files/Common Files/Apple/Mobile Device Support'
Get-PnpDevice -PresentOnly | Where-Object {
  $_.Class -eq 'WPD' -or $_.FriendlyName -match 'Android|ADB|Apple Mobile Device USB|iPhone USB'
} | Measure-Object
Get-PnpDevice -PresentOnly | Where-Object {
  $_.FriendlyName -match 'Android|iPhone|Apple Mobile|ADB|Samsung|Pixel|MTP|Portable Device'
} | Select-Object Status,Class,FriendlyName
Get-Service | Where-Object { $_.Name -match 'usbmux|Apple Mobile|adb' }
Get-NetTCPConnection -State Listen | Where-Object {
  $_.LocalPort -in @(5037,9222,9223,27753,8100)
} | Select-Object LocalAddress,LocalPort
```

Discovery did not install tooling, pair a device, enable debugging, change the firewall, or scan the network.

## Physical measurement procedure

1. Use an actual Android phone with Chrome remote inspection and an actual iPhone with Safari Web Inspector on a connected compatible host. Record model, OS, browser version, display refresh setting, battery level, and thermal state. Device emulation does not qualify.
2. Open this exact build on the phone, with no desktop CPU/GPU throttling or browser device emulation. Keep the browser visible. Use the same Pine hole and the same portrait orientation on both phones.
3. Select Lite, reload, and allow a 30-second warmup. Start the hole, then paste [device-benchmark.js](device-benchmark.js) into that phone's remote browser console. Run a 60-second sample while aiming, throwing, and following the disc. The helper reads the game's renderer frame counter and reports frame intervals; it never changes physics or graphics settings.
4. Repeat three times, then repeat all runs in Full after its assets load. Retain raw JSON for every run. Report each run's average rendered FPS and p95 frame time, plus the three-run median; do not replace poor runs silently. Document invalid runs separately (backgrounding or a quality switch invalidates a run).
5. Include a photo or remote-inspector device identification record establishing the physical device, and a screenshot of the scenario. Keep personal identifiers out of the committed evidence. Record the renderer pixel ratio, since Chains adapts render resolution to performance.

No benchmark was run on this workstation as a substitute. The helper is prepared for a future attached-device run; its existence is not evidence of measured phone performance.
