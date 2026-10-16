// "Watch a short ad to download": rewarded ads from Google Ad Manager
// (Google Publisher Tag, https://developers.google.com/publisher-tag/samples/display-rewarded-ad).
//
// Rules this module follows:
//   - opt-in: Google's script is loaded only after the user taps the button,
//     so visiting the app loads no ad code and sets no ad cookie;
//   - the reward (the download) is given when Google grants it;
//   - a citizen is never blocked from their document: when no ad can be shown
//     (not configured, ad blocker, no ad available, unsupported device,
//     timeout), the result is 'unavailable' and the caller unlocks anyway.
//
// Configuration (generated at deploy time, see .github/workflows/deploy-pages.yml):
//   window.ADS_CONFIG = {
//     provider: 'gpt-rewarded',             // or 'none' (default): no ads
//     adUnitPath: '/1234567/katib_rewarded', // Ad Manager ad unit
//     nonPersonalized: true,                // default; false only with a consent tool (CMP)
//     timeoutMs: 8000,                      // waiting for an ad to be ready
//   };

import { loadScript } from './loadScript.js';

export { loadScript, resetScriptCache } from './loadScript.js';

export const GPT_SRC = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
const DEFAULT_TIMEOUT_MS = 8000;

/** 'granted' (reward earned) | 'dismissed' (closed before the reward) | 'unavailable' (no ad could be shown). */
export const AdResult = Object.freeze({ GRANTED: 'granted', DISMISSED: 'dismissed', UNAVAILABLE: 'unavailable' });

/** The ads configuration, normalised; provider 'none' when missing or incomplete. */
export function adsConfig(raw = globalThis.ADS_CONFIG) {
  const provider = String(raw?.provider ?? 'none');
  const adUnitPath = String(raw?.adUnitPath ?? '').trim();
  if (provider !== 'gpt-rewarded' || !adUnitPath.startsWith('/')) return { provider: 'none' };
  return {
    provider,
    adUnitPath,
    nonPersonalized: raw.nonPersonalized !== false,
    timeoutMs: Number(raw.timeoutMs) > 0 ? Number(raw.timeoutMs) : DEFAULT_TIMEOUT_MS,
  };
}

export function adsEnabled(config = adsConfig()) {
  return config.provider !== 'none';
}

/**
 * Shows one Ad Manager rewarded ad. The user already chose to watch it, so it
 * is made visible as soon as it is ready. Never rejects.
 */
export async function showGptRewarded(config, { win = globalThis, load = loadScript, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  win.googletag = win.googletag || { cmd: [] };
  try {
    await load(GPT_SRC);
  } catch {
    return AdResult.UNAVAILABLE;
  }
  return new Promise((resolve) => {
    win.googletag.cmd.push(() => runRewardedSlot(win.googletag, config, { resolve, setTimer, clearTimer }));
  });
}

function runRewardedSlot(gt, config, { resolve, setTimer, clearTimer }) {
  // null when this page or device cannot show the format (e.g. inside an iframe).
  const slot = gt.defineOutOfPageSlot(config.adUnitPath, gt.enums.OutOfPageFormat.REWARDED);
  if (!slot) {
    resolve(AdResult.UNAVAILABLE);
    return;
  }
  const pubads = gt.pubads();
  let granted = false;
  let shown = false;
  let done = false;

  const listeners = {
    rewardedSlotReady: (e) => {
      if (e.slot !== slot) return;
      shown = true;
      clearTimer(timer); // the user is watching: no time limit any more
      e.makeRewardedVisible();
    },
    rewardedSlotGranted: (e) => {
      if (e.slot === slot) granted = true;
    },
    rewardedSlotClosed: (e) => {
      if (e.slot === slot) finish(granted ? AdResult.GRANTED : AdResult.DISMISSED);
    },
    slotRenderEnded: (e) => {
      if (e.slot === slot && e.isEmpty) finish(AdResult.UNAVAILABLE); // no ad to show
    },
  };

  function finish(result) {
    if (done) return;
    done = true;
    clearTimer(timer);
    for (const [type, fn] of Object.entries(listeners)) pubads.removeEventListener(type, fn);
    gt.destroySlots([slot]);
    resolve(result);
  }

  const timer = setTimer(() => {
    if (!shown) finish(AdResult.UNAVAILABLE);
  }, config.timeoutMs);

  for (const [type, fn] of Object.entries(listeners)) pubads.addEventListener(type, fn);
  slot.addService(pubads);
  if (config.nonPersonalized) pubads.setPrivacySettings({ nonPersonalizedAds: true });
  gt.enableServices();
  gt.display(slot);
}

/** The ad gate's single entry point: resolves to an AdResult, never rejects. */
export function showRewardedAd(config = adsConfig(), deps = {}) {
  if (!adsEnabled(config)) return Promise.resolve(AdResult.UNAVAILABLE);
  return showGptRewarded(config, deps).catch(() => AdResult.UNAVAILABLE);
}
