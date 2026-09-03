import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { inspectPort, waitForHttp } from '../scripts/lib/process-supervisor.mjs';

test('detects a listener without terminating it', async () => {
  const server = createServer((_request, response) => response.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    assert.equal((await inspectPort('127.0.0.1', port)).occupied, true);
    assert.equal((await waitForHttp(`http://127.0.0.1:${port}/`, 1000)).status, 200);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
