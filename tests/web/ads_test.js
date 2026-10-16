import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { AdResult, adsConfig, adsEnabled, GPT_SRC, loadScript, resetScriptCache, showGptRewarded, showRewardedAd } from '../../js/utils/ads.js';

const CONFIG = { provider: 'gpt-rewarded', adUnitPath: '/22639388115/rewarded_web_example', nonPersonalized: true, timeoutMs: 8000 };

// A stand-in for Google Publisher Tag: records calls and lets a test fire its events.
function fakeGpt({ supported = true } = {}) {
  const listeners = new Map();
  const calls = [];
  const slot = { addService: () => calls.push('addService') };
  const pubads = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
    setPrivacySettings: (s) => calls.push(['privacy', s]),
  };
  const googletag = {
    cmd: [],
    enums: { OutOfPageFormat: { REWARDED: 'REWARDED' } },
    defineOutOfPageSlot: (path, format) => {
      calls.push(['define', path, format]);
      return supported ? slot : null;
    },
    pubads: () => pubads,
    enableServices: () => calls.push('enableServices'),
    display: () => calls.push('display'),
    destroySlots: (slots) => calls.push(['destroy', slots.length]),
  };
  // Like the real library once loaded: commands run as they are pushed.
  const win = { googletag };
  const load = () => {
    win.googletag.cmd = { push: (fn) => fn() };
    return Promise.resolve();
  };
  const fire = (type, extra = {}) => listeners.get(type)?.({ slot, ...extra });
  return { win, load, fire, calls, listeners, slot };
}

function manualTimers() {
  const timers = [];
  return {
    timers,
    setTimer: (fn, ms) => timers.push({ fn, ms, cleared: false }) - 1,
    clearTimer: (id) => {
      if (timers[id]) timers[id].cleared = true;
    },
    runAll: () => timers.filter((t) => !t.cleared).forEach((t) => t.fn()),
  };
}

Deno.test('ads configuration: off unless a rewarded ad unit is set', () => {
  assertEquals(adsConfig(undefined), { provider: 'none' });
  assertEquals(adsConfig({ provider: 'gpt-rewarded' }), { provider: 'none' }, 'no ad unit');
  assertEquals(adsConfig({ provider: 'gpt-rewarded', adUnitPath: 'no-leading-slash' }), { provider: 'none' });
  assertEquals(adsConfig({ provider: 'adsense', adUnitPath: '/1/x' }), { provider: 'none' });
  assertEquals(adsConfig({ provider: 'gpt-rewarded', adUnitPath: ' /1/x ' }), { provider: 'gpt-rewarded', adUnitPath: '/1/x', nonPersonalized: true, timeoutMs: 8000 });
  assertEquals(adsConfig({ provider: 'gpt-rewarded', adUnitPath: '/1/x', nonPersonalized: false, timeoutMs: '5000' }).nonPersonalized, false);
  assertEquals(adsConfig({ provider: 'gpt-rewarded', adUnitPath: '/1/x', timeoutMs: -1 }).timeoutMs, 8000);
  assertEquals([adsEnabled({ provider: 'none' }), adsEnabled(adsConfig({ provider: 'gpt-rewarded', adUnitPath: '/1/x' }))], [false, true]);
});

Deno.test('rewarded ad: shown when ready, reward granted, then closed', async () => {
  const gpt = fakeGpt();
  const t = manualTimers();
  const pending = showGptRewarded(CONFIG, { win: gpt.win, load: gpt.load, setTimer: t.setTimer, clearTimer: t.clearTimer });
  await Promise.resolve();
  assertEquals(gpt.calls.slice(0, 2), [['define', CONFIG.adUnitPath, 'REWARDED'], 'addService']);
  assertEquals(gpt.calls.includes('display'), true);
  assertEquals(gpt.calls.some((c) => c[0] === 'privacy' && c[1].nonPersonalizedAds), true);

  let visible = false;
  gpt.fire('rewardedSlotReady', { makeRewardedVisible: () => (visible = true) });
  assertEquals(visible, true, 'the user already chose to watch it');
  t.runAll(); // the ad is on screen: the timeout no longer applies
  gpt.fire('rewardedSlotReady', { slot: {}, makeRewardedVisible: () => { throw new Error('other slot'); } });
  gpt.fire('rewardedSlotGranted');
  gpt.fire('rewardedSlotClosed');
  assertEquals(await pending, AdResult.GRANTED);
  assertEquals(gpt.listeners.size, 0, 'listeners removed');
  assertEquals(gpt.calls.at(-1), ['destroy', 1]);
});

Deno.test('rewarded ad: closed early, no ad, unsupported, timeout, blocked script', async () => {
  const run = async (scenario, opts = {}) => {
    const gpt = fakeGpt(opts);
    const t = manualTimers();
    const pending = showGptRewarded({ ...CONFIG, nonPersonalized: false }, { win: gpt.win, load: opts.load ?? gpt.load, setTimer: t.setTimer, clearTimer: t.clearTimer });
    await Promise.resolve();
    await Promise.resolve();
    scenario(gpt, t);
    return { result: await pending, gpt };
  };
  const dismissed = await run((g) => {
    g.fire('rewardedSlotReady', { makeRewardedVisible: () => {} });
    g.fire('rewardedSlotClosed');
    g.fire('rewardedSlotGranted'); // too late: already finished
  });
  assertEquals(dismissed.result, AdResult.DISMISSED);
  assertEquals(dismissed.gpt.calls.some((c) => c[0] === 'privacy'), false, 'personalised when configured so');

  assertEquals((await run((g) => {
    g.fire('slotRenderEnded', { isEmpty: false });
    g.fire('slotRenderEnded', { slot: {}, isEmpty: true });
    g.fire('slotRenderEnded', { isEmpty: true });
  })).result, AdResult.UNAVAILABLE, 'no ad to show');
  assertEquals((await run(() => {}, { supported: false })).result, AdResult.UNAVAILABLE, 'format not supported here');
  assertEquals((await run((_g, t) => t.runAll())).result, AdResult.UNAVAILABLE, 'no ad ready in time');
  assertEquals((await run(() => {}, { load: () => Promise.reject(new Error('blocked')) })).result, AdResult.UNAVAILABLE, 'ad blocker');
});

Deno.test('showRewardedAd: no config means no ad, and it never rejects', async () => {
  assertEquals(await showRewardedAd({ provider: 'none' }), AdResult.UNAVAILABLE);
  const gpt = fakeGpt();
  const pending = showRewardedAd(adsConfig({ ...CONFIG }), {
    win: gpt.win, load: gpt.load, setTimer: () => 0, clearTimer: () => {},
  });
  await Promise.resolve();
  await Promise.resolve();
  gpt.fire('rewardedSlotReady', { makeRewardedVisible: () => {} });
  gpt.fire('rewardedSlotGranted');
  gpt.fire('rewardedSlotClosed');
  assertEquals(await pending, AdResult.GRANTED);
  const broken = { win: { get googletag() { throw new Error('boom'); } } };
  assertEquals(await showRewardedAd(adsConfig(CONFIG), broken), AdResult.UNAVAILABLE);
});

Deno.test('loadScript: one tag per source, retried after a failure', async () => {
  resetScriptCache();
  const added = [];
  const doc = { createElement: () => ({}), head: { appendChild: (el) => added.push(el) } };
  const first = loadScript(GPT_SRC, doc);
  const again = loadScript(GPT_SRC, doc);
  assertEquals(added.length, 1);
  assertEquals([added[0].src, added[0].async], [GPT_SRC, true]);
  added[0].onload();
  await first;
  await again;

  const failing = loadScript('https://blocked.example/x.js', doc);
  added[1].onerror();
  await assertRejects(() => failing, Error, 'could not load');
  loadScript('https://blocked.example/x.js', doc);
  assertEquals(added.length, 3, 'a later tap tries again');
  resetScriptCache();
});
