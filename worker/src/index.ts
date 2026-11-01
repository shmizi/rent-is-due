export { RoomObject } from './room.ts';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE = '([A-HJKMNP-Z2-9]{6})';

function newCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

function room(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        if (await room(env, code).init(code)) return json({ code }, 201);
      }
      return json({ error: 'Could not create a room. Try again.' }, 503);
    }

    const info = path.match(new RegExp(`^/api/rooms/${CODE}$`));
    if (info && request.method === 'GET') return json(await room(env, info[1]).info());

    const debug = path.match(new RegExp(`^/api/rooms/${CODE}/debug$`));
    if (debug && String(env.DEV) === 'true') return json(await room(env, debug[1]).debugState());

    const socket = path.match(new RegExp(`^/ws/${CODE}$`));
    if (socket) return room(env, socket[1]).fetch(request);

    if (path.startsWith('/api/') || path.startsWith('/ws/')) return json({ error: 'Not found' }, 404);

    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
