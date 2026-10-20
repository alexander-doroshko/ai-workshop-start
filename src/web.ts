// The local web view: a page to type a repository into, and one JSON endpoint that scans it.
// Listens on localhost only; nothing is stored.
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { skillLink } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

export type WebOptions = {
  /** Opens what the user asked to scan, as the CLI does. */
  open(input: string): Promise<Source>;
};

/** What the server answers besides the scan: the page and its script. */
const FILES: Record<string, { file: URL; type: string }> = {
  '/': { file: new URL('./web/index.html', import.meta.url), type: 'text/html' },
  '/page.js': { file: new URL('./web/page.js', import.meta.url), type: 'text/javascript' },
};

/**
 * The page at `/`; `GET /api/scan?repo=<GitHub URL | directory>` answers the scan as JSON.
 * Only for a Host of 127.0.0.1 or localhost on its own port: another name that resolves to
 * 127.0.0.1 (DNS rebinding) would let any web page read the user's directories and repositories.
 */
export function createWebServer({ open }: WebOptions): Server {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json', JSON.stringify(body));

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : undefined;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(request.headers.host?.toLowerCase() ?? '')) {
      return json(403, { error: `Forbidden host: ${request.headers.host ?? '(none)'}` });
    }
    if (request.method !== 'GET') return json(405, { error: `Method not allowed: ${request.method}` });
    const file = FILES[url.pathname];
    if (file) return send(200, file.type, await readFile(file.file, 'utf8'));
    if (url.pathname !== '/api/scan') return json(404, { error: `Not found: ${url.pathname}` });

    const input = url.searchParams.get('repo')?.trim();
    if (!input) return json(400, { error: 'Enter a GitHub URL or a directory' });
    try {
      const { repository, skills, warnings } = await scan(await open(input));
      json(200, { repository, skills: skills.map((skill) => ({ ...skill, link: skillLink(repository, skill) })), warnings });
    } catch (error) {
      if (error instanceof AtlasError) json(400, { error: error.message });
      else json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  });
  return server;
}

/** Starts the server on localhost; resolves to its address once it listens. */
export function serve(options: WebOptions & { port: number }): Promise<{ server: Server; url: string }> {
  const server = createWebServer(options);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}
