# Web view
`./skill-atlas serve [--port <port>]`: a page on **localhost** (port 4173 by default).
Scans the same inputs as the CLI; *nothing is stored*. Listed by `help`; the browser terminal: *Node CLI only*.
- Only for a Host of `127.0.0.1:<port>` or `localhost:<port>`; any other → **403** (DNS rebinding)
## Page
- A field for the repository, the **Scan** button to its right
- On the left, the skills, sorted by **name**, each with its description
- A description over **300** characters: its first 300 and `...`; the full one on hover
- Above them, a **filter** field: shows only the skills whose name *or* description contains its text (the *full* description), ignoring case and surrounding spaces; empty → all
- The filter is kept for the next scan; a selected skill filtered out stays on the right
- Select one → its **SKILL.md** on the right, with the pinned link and `also in <paths>` for copies
- The skills of [analysis.md](analysis.md#a-project-skill): a skill in several roots is *one item*
- The repository and the skill count above; warnings *under them*, the scan goes on
- Unreachable repository → the CLI's message, *no list*
## API
`GET /api/scan?repo=<GitHub URL | directory>` → `{ repository, skills, warnings }`;
each skill with its `link` and `text`. A failure → `{ error }`, status 400.
