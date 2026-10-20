/** A skill found in a repository: its SKILL.md, its name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** Where agents keep a repository's own skills, at its root; the first one holds the main copy. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/**
 * The repository's own skills: a SKILL.md directly in a directory of a skill root, named after
 * that directory. Anywhere else, a SKILL.md is part of the product or test data, not a skill.
 * The same directory name in several roots is one skill, whatever the contents: the first
 * root's file, with the others as its copies.
 */
export function findSkills(paths: string[]): SkillFile[] {
  const skills = new Map<string, SkillFile>();
  for (const root of SKILL_ROOTS) {
    for (const path of paths.filter((path) => isSkillIn(root, path)).sort()) {
      const name = path.split('/').at(-2)!;
      const skill = skills.get(name);
      if (skill) skill.copies.push(path);
      else skills.set(name, { path, name, copies: [] });
    }
  }
  return [...skills.values()];
}

/** `<root>/<name>/SKILL.md`, nothing deeper. */
function isSkillIn(root: string, path: string): boolean {
  if (!path.startsWith(`${root}/`)) return false;
  const rest = path.slice(root.length + 1).split('/');
  return rest.length === 2 && rest[1] === 'SKILL.md';
}
