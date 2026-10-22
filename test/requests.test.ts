import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJSON, DataRequestError } from '../web/src/lib/requests.ts';
import { hasTeamFavorite, teamFavoriteKey } from '../shared/favorites.ts';

test('favorites distinguish teams sharing a club name and preserve original men’s selections', () => {
  const favorites = [teamFavoriteKey('HSG Example', 'F-RL-BW')];
  assert.equal(hasTeamFavorite(favorites, 'HSG Example', 'F-OL-1-BW'), true);
  assert.equal(hasTeamFavorite(favorites, 'HSG Example', 'M-RL-BW'), false);
  assert.equal(hasTeamFavorite(['HSG Example'], 'HSG Example', 'M-VL-1-BW'), true);
  assert.equal(hasTeamFavorite(['HSG Example'], 'HSG Example', 'F-VL-1-BW'), false);
});

test('data requests handle HTTP errors, invalid JSON, and stalled connections', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{"value":0}', { status: 200 });
    assert.deepEqual(await requestJSON('/data'), { value: 0 });
    globalThis.fetch = async () => new Response('Missing', { status: 404 });
    await assert.rejects(requestJSON('/data'), (error: unknown) => error instanceof DataRequestError && error.status === 404);
    globalThis.fetch = async () => new Response('<html>fallback</html>', { status: 200 });
    await assert.rejects(requestJSON('/data'), /nicht gelesen/);
    globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    await assert.rejects(requestJSON('/data', {}, 10), /zu lange/);
  } finally { globalThis.fetch = original; }
});
