# Command line
`./skill-atlas scan <GitHub URL | directory>`: a repository, an organization or a directory
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*
## An organization
```
JetBrains · 2 repositories · 3 skills
JetBrains/edge-cases · 2 skills
mps-tests — Run the MPS tests.
  https://github.com/JetBrains/edge-cases/blob/<commit>/…
JetBrains/example · 1 skill
…
```
- The organization, the repositories scanned and all their skills; then each repository *with skills*, sorted by id, as above
- A warning names its repository: `warning: JetBrains/kotlin: …`
