# Diagrams

Interactive diagrams of the project, generated with [Archify](https://github.com/tt-a1i/archify)
from the JSON files in this folder. Each `.html` file is self-contained: open it in a browser
(dark/light theme, node details, links to the exact source lines on GitHub).

| Diagram | Shows |
|---|---|
| [System architecture](system-architecture.html) | The two ways in (web app on GitHub Pages, Telegram bot), the Supabase project (Postgres + RLS, Auth, Edge Function, agent tables) and the external services (AI providers, Gotenberg) |
| [Agent conversation workflow](agent-workflow.html) | What happens to a Telegram message: webhook → consent → choose document → collect + validate → read-back → generate, with the AI calls and database writes |

Every node cites the source lines it describes, pinned to commit `f091949`
(`meta.repository` in the JSON). When the code changes, update the JSON and regenerate.

## Regenerate

Requires Node ≥ 18 and the Archify skill (`npx skills add tt-a1i/archify -g`, or a copy in
`~/.claude/skills/archify`). From the repository root:

```bash
ARCHIFY=~/.claude/skills/archify/bin/archify.mjs
node $ARCHIFY finalize workflow     docs/diagrams/agent-workflow.json      docs/diagrams/agent-workflow.html      --repo-root . --quality showcase
node $ARCHIFY finalize architecture docs/diagrams/system-architecture.json docs/diagrams/system-architecture.html --repo-root . --quality showcase
```

`finalize` validates the JSON, checks every cited source line against the pinned commit and
renders the HTML. Its last gate opens the diagram in Chrome/Chromium (`ARCHIFY_CHROME=<path>`);
it was skipped for the current files because headless Chrome was not available. The receipts it
writes (`*.finalize.json`, `*.delivery.json`, …) contain local paths and are git-ignored.
