#!/usr/bin/env node
// DEVELOPMENT ONLY. The owner's self-serve ChatGPT client accepts only a loopback redirect
// (http://127.0.0.1:<port>/auth/callback), and an app cannot receive one without its own HTTP listener. On the
// simulator 127.0.0.1 is this Mac, so this relay answers that redirect by sending the browser on to
// justcalorie://auth/callback with the query unchanged; the app's auth session catches it and redeems the code with
// its own PKCE verifier. The relay never sees that verifier, so the code it forwards is useless to anything else.
// It never prints the query: it carries a one-time authorization code.
//
// Usage: node scripts/chatgpt-loopback-relay.mjs   (reads CHATGPT_DEV_REDIRECT_URI from .env; Ctrl-C to stop)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const APP_CALLBACK_URL = 'justcalorie://auth/callback';
const DEFAULT_REDIRECT = 'http://127.0.0.1:1455/auth/callback';

function redirectFromEnvFile() {
  try {
    const line = readFileSync('.env', 'utf8')
      .split('\n')
      .find((entry) => entry.startsWith('CHATGPT_DEV_REDIRECT_URI='));

    return line?.slice('CHATGPT_DEV_REDIRECT_URI='.length).trim();
  } catch {
    return undefined;
  }
}

const redirect = new URL(process.env.CHATGPT_DEV_REDIRECT_URI ?? redirectFromEnvFile() ?? DEFAULT_REDIRECT);

if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || redirect.pathname !== '/auth/callback') {
  console.error(`[relay] refusing ${redirect.origin}${redirect.pathname}: OpenAI accepts only http://127.0.0.1:<port>/auth/callback`);
  process.exit(1);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', redirect.origin);

  if (request.method !== 'GET' || url.pathname !== redirect.pathname) {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(302, { Location: `${APP_CALLBACK_URL}${url.search}`, 'Cache-Control': 'no-store' }).end();
  console.log(`[relay] forwarded one sign-in callback to ${APP_CALLBACK_URL} at ${new Date().toISOString()}`);
});

server.listen(Number(redirect.port), '127.0.0.1', () => {
  console.log(`[relay] listening on ${redirect.origin}${redirect.pathname}, forwarding to ${APP_CALLBACK_URL}`);
});
