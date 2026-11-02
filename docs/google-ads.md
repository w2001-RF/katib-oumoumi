# Google ads before downloads

App: <https://katiboumoumi.online/>

On the "document ready" screen (`js/views/ready.js`) the user can watch a short **rewarded ad** to unlock the Word
and PDF downloads. The ad is served by **Google Ad Manager** through the Google Publisher Tag
(`js/utils/ads.js`). This replaced the old simulated 4-second countdown.

**Why Ad Manager and not AdSense?** Google's "watch an ad, get a reward" format for web pages is the
[Ad Manager rewarded ad](https://developers.google.com/publisher-tag/samples/display-rewarded-ad). AdSense's
rewarded format (`adBreak`, H5 Games Ads) is reserved for HTML5 games. An AdSense account can be linked to Ad
Manager (Ad Manager for small businesses is free).

## How it behaves

| Situation | What the user sees |
|---|---|
| Ads not configured | Downloads right away, no ad button |
| Taps "watch a short ad" | Google's script loads **only now**: no ad code or cookie before this tap |
| Ad watched to the end (reward granted) | Downloads unlocked |
| Ad closed before the end | Back to the button, with a note to watch it to the end |
| No ad available, ad blocker, unsupported device, nothing ready within 8 s | Downloads unlocked anyway, with a short notice |

A citizen is never blocked from their document because of an ad.

> **AdSense Auto ads.** `index.html` also loads AdSense's `adsbygoogle.js` on every visit (Auto ads). That
> tag is separate from the rewarded ad above: with it, Google's ad code and cookies are present from the first
> page view, not only after the tap. It has no `integrity` attribute on purpose: Google changes the file
> continuously without publishing hashes, so an SRI hash would block the ads (SonarQube hotspot S5725, reviewed
> as safe). Remove the tag to go back to ads that load only on demand.

## Setup

1. **Ad Manager**: create a network, then an **ad unit** (e.g. `katib_rewarded`) and a line item or campaign
   that accepts rewarded web inventory. The ad unit path looks like `/1234567/katib_rewarded`
   (network code / ad unit code).
2. **GitHub → Settings → Secrets and variables → Actions → Variables** (variables, not secrets: these values
   end up in the public page anyway):

   | Variable | Example | Meaning |
   |---|---|---|
   | `GOOGLE_AD_UNIT_PATH` | `/1234567/katib_rewarded` | enables the ads; empty = no ads |
   | `ADS_PERSONALIZED` | `true` | personalised ads; leave unset (non-personalised) unless you run a consent tool (below) |
   | `ADS_TXT` | `google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0` | written to `ads.txt` |

3. Push to `main`. The workflow `.github/workflows/deploy-pages.yml` adds `window.ADS_CONFIG` to the generated
   `supabase-config.js` and writes `ads.txt`.

**Try it locally** with Google's public test unit, in your local `supabase-config.js`:

```js
window.ADS_CONFIG = { provider: 'gpt-rewarded', adUnitPath: '/22639388115/rewarded_web_example', nonPersonalized: true };
```

## Things to know before going live

- **`ads.txt` must be at the domain root.** `https://<user>.github.io/katib-oumoumi/ads.txt` does not count. The
  site uses the custom domain `katiboumoumi.online`, so the file is served at <https://katiboumoumi.online/ads.txt>.
  In Ad Manager / AdSense, the site to declare is `katiboumoumi.online`.
  Without a valid `ads.txt`, Google may serve few or no ads.
- **Consent and privacy.** By default the ads are **non-personalised** (`nonPersonalizedAds`), the
  privacy-friendly choice for a public service (law 09-08 / CNDP). For personalised ads, especially if users come
  from the EEA, UK or Switzerland, Google requires a certified consent tool (CMP): set one up first (e.g. Ad
  Manager's *Privacy & messaging*), then set `ADS_PERSONALIZED=true`.
- **Ad Manager policies.** The ad must stay opt-in (the user taps the button) and the reward must be stated
  clearly, as it is today ("watch a short ad to download the document"). Don't reward users for clicking an ad.
- **Some devices or pages can't show this format.** Google then returns no slot, and the user simply downloads.
- **Measuring.** Revenue, fill rate and impressions are in Ad Manager reports. Ad events are not sent to the
  app's own database.
