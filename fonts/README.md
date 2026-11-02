# Fonts

Self-hosted copies of the Google Fonts used by the app, so that `index.html` can check
the font stylesheet with an integrity hash (SRI) and visitors' browsers never contact Google.

| Family | Use | Files | License |
|---|---|---|---|
| [Amiri](https://fonts.google.com/specimen/Amiri) | headings (naskh) | `amiri-*.woff2` | SIL Open Font License 1.1 |
| [IBM Plex Sans Arabic](https://fonts.google.com/specimen/IBM+Plex+Sans+Arabic) | text | `ibm-plex-sans-arabic-*.woff2` | SIL Open Font License 1.1 |
| [Tajawal](https://fonts.google.com/specimen/Tajawal) | document preview and exported PDF | `tajawal-*.woff2` | SIL Open Font License 1.1 |

- `fonts.css`: every family, loaded by `index.html`.
- `tajawal.css`: Tajawal only, embedded into PDFs by `js/utils/docGenerator.js`.

Only the `arabic`, `latin` and `latin-ext` subsets are kept; each `@font-face` has a
`unicode-range`, so a browser downloads only the files the page needs.

After editing a `.css` file referenced from `index.html`, update its hash:

```bash
npx deno run --allow-read --allow-write tools/sri.js --write
```

(`tests/web/sri_test.js` fails while a hash is out of date.)
