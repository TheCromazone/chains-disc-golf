/* Paste into remote DevTools for a physically connected phone running Chains.
 * Usage: await runChainsDeviceBenchmark({device:'Pixel 9',browser:'Chrome 140',scenario:'Pine, hole 1: aim then throw',seconds:60})
 * This observes frames; it does not alter game state or imitate a mobile device.
 */
window.runChainsDeviceBenchmark = async function ({ device, browser, scenario, seconds = 60 } = {}) {
  if (!device || !browser || !scenario) throw new Error('Record the physical device, browser version, and scenario.');
  if (!window.__chains?.renderer) throw new Error('Load Chains before measuring.');
  if (document.hidden) throw new Error('Keep the game visible throughout the measurement.');
  const app = window.__chains;
  const intervals = [], phases = {};
  const initialFrame = app.renderer.info.render.frame;
  const started = performance.now();
  const startQuality = app.G.settings.quality;
  let previous = started, visibilityChanged = false, qualityChanged = false;
  const visibility = () => { if (document.hidden) visibilityChanged = true; };
  document.addEventListener('visibilitychange', visibility);
  await new Promise(resolve => {
    const observe = now => {
      intervals.push(now - previous); previous = now;
      phases[app.G.phase] = (phases[app.G.phase] || 0) + 1;
      if (app.G.settings.quality !== startQuality) qualityChanged = true;
      if (now - started >= seconds * 1000) resolve();
      else requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  document.removeEventListener('visibilitychange', visibility);
  const elapsedMs = performance.now() - started;
  const renderFrames = app.renderer.info.render.frame - initialFrame;
  const sorted = intervals.slice().sort((a,b) => a-b);
  const percentile = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const report = {
    measuredAt: new Date().toISOString(), device, browser, scenario,
    physicalDeviceVerification: 'Operator must attest this was remote DevTools on the named physical phone; user agent is not proof.',
    quality: startQuality, valid: !visibilityChanged && !qualityChanged,
    invalidReasons: [visibilityChanged && 'Document hidden', qualityChanged && 'Quality changed'].filter(Boolean),
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio, renderPixelRatio: app.renderer.getPixelRatio() },
    elapsedMs: +elapsedMs.toFixed(1), renderFrames, averageRenderedFps: +(renderFrames * 1000 / elapsedMs).toFixed(2),
    medianFrameMs: +percentile(.5).toFixed(2), p95FrameMs: +percentile(.95).toFixed(2), p99FrameMs: +percentile(.99).toFixed(2),
    phaseFrameCounts: phases, userAgent: navigator.userAgent,
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
};
