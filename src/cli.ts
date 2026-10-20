#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr. Nothing is stored. `serve` starts the local web view instead.
import { run } from './commands.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import type { Source } from './core/scan.ts';
import { openDirectory } from './local.ts';
import { serve } from './web.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string): Promise<Source> =>
  parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input);
const [command, ...rest] = process.argv.slice(2);

if (command === 'serve') {
  const [flag, value, ...extra] = rest;
  const port = flag === undefined ? 4173 : flag === '--port' && /^\d+$/.test(value ?? '') && !extra.length ? Number(value) : NaN;
  if (Number.isNaN(port)) {
    console.error('Usage: skill-atlas serve [--port <port>]');
    process.exitCode = 1;
  } else {
    try {
      const { url } = await serve({ open, port });
      console.log(`Skill Atlas at ${url}`);
    } catch (error) {
      console.error(`Cannot start the web view: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
} else {
  process.exitCode = await run(process.argv.slice(2), { open, print: (text) => console.log(text), error: (text) => console.error(text) });
}
