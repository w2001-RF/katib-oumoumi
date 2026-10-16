// Copy this file to `supabase-config.js` (repo root) for local development.
// `supabase-config.js` is git-ignored — in production it is generated
// automatically by .github/workflows/deploy-pages.yml from the
// SUPABASE_URL / SUPABASE_ANON_KEY repository secrets.
window.SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT.supabase.co',
  anonKey: 'YOUR-PUBLIC-ANON-KEY',
};

// Optional: Google Ad Manager rewarded ad before downloads (docs/google-ads.md).
// Leave it out and the app shows no ads. Google's test ad unit below shows a
// sample rewarded ad, handy to try the flow locally.
// window.ADS_CONFIG = {
//   provider: 'gpt-rewarded',
//   adUnitPath: '/22639388115/rewarded_web_example',
//   nonPersonalized: true,
// };
