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

const PAGE = new URL('./web/index.html', import.meta.url);

/** The page at `/`; `GET /api/scan?repo=<GitHub URL | directory>` answers the scan as JSON. */
export function createWebServer({ open }: WebOptions): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json', JSON.stringify(body));

    if (request.method !== 'GET') return json(405, { error: `Method not allowed: ${request.method}` });
    if (url.pathname === '/') return send(200, 'text/html', await readFile(PAGE, 'utf8'));
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
