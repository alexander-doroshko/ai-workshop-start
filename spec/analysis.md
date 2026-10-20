# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
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
