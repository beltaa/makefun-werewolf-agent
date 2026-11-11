import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { run } from './main.ts';

const view = {
  day: 1,
  phase: 'voting',
  you: { seat: 1, name: 'Ari', role: 'villager', alive: true, partner: null },
  players: Array.from({ length: 8 }, (_, i) => ({ seat: i + 1, name: `P${i + 1}`, alive: true, role: null })),
  seerResults: null,
  lastProtect: null,
  wolfVotes: null,
  log: [],
  outcome: null,
};
const acts = [];
let observes = 0;
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  res.setHeader('content-type', 'application/json');
  if (req.url === '/observe') {
    observes++;
    if (observes === 1) {
      res.end(JSON.stringify({ games: 2, finished: 0, done: false, pending: [
        { game: 1, decision: 'speak', max_chars: 500, view: { ...view, phase: 'debate' } },
        { game: 2, decision: 'vote', options: [2, 3, 4, 5, 6, 7, 8], view },
      ] }));
    } else {
      res.end(JSON.stringify({ games: 2, finished: 2, done: true, pending: [] }));
    }
    return;
  }
  if (req.url === '/act') {
    acts.push(JSON.parse(body));
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await run({ MAKEFUN_ENV_URL: `http://127.0.0.1:${address.port}` });
  assert.equal(observes, 2);
  assert.equal(acts.length, 2);
  assert.deepEqual(acts.map(a => [a.game, a.decision]), [[1, 'speak'], [2, 'vote']]);
  assert.equal(typeof acts[0].text, 'string');
  assert.ok([2, 3, 4, 5, 6, 7, 8].includes(acts[1].target));
  console.log('integration smoke test passed: /observe -> two /act posts -> done');
} finally {
  await new Promise(resolve => server.close(resolve));
}
