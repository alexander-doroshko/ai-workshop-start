# Repository analysis
## Input
A **GitHub repository** URL, a **GitHub organization** URL (`https://github.com/<organization>`; a user's account too), or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI and web view: *thin clients*.
Skill: id = `repo:path`, name, description, commit, the SKILL.md text
## A project skill
- A `SKILL.md` in `<root>/<directory>/`, at the repository root: `.agents/skills`, `.claude/skills`, `.github/skills`, `agent/skills`
- Anywhere else, *not* a skill, silently: part of the **product** (`plugins/…/resources/…`), **test data** (`src/jvmTest/resources/…`), a nested root (`fixture/.claude/skills/…`)
- The same directory name in several roots → **one skill**, the others its *copies*; contents not compared
- The main copy: the first root in the list above
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
## An organization
- All its repositories, forks included; each one scanned as above, at its own commit
- The skills of all of them, each with its repository
- A repository that cannot be scanned → a *warning*, the scan goes on
- Unknown organization → a clear message, exit code 1; the rate limit or a rejected token stops the whole scan the same way
