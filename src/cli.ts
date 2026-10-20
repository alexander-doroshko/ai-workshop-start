#!/usr/bin/env node
// The Node client: a GitHub repository or organization through the GitHub API, or a local
// directory; stdout and stderr, or the local web view. Nothing is stored.
import { run } from './commands.ts';
import { AtlasError } from './core/errors.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import type { OrganizationSource, Source } from './core/scan.ts';
import { openDirectory } from './local.ts';
import { serve } from './web.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string): Promise<Source | OrganizationSource> =>
  parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input);

process.exitCode = await run(process.argv.slice(2), {
  open,
  print: (text) => console.log(text),
  error: (text) => console.error(text),
  serve: (port) =>
    serve({ open, port }).then(
      ({ url }) => url,
      (error: Error) => Promise.reject(new AtlasError(`Cannot start the web view: ${error.message}`)),
    ),
});
