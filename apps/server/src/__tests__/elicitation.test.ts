import { expect, test } from 'bun:test';
import { SessionHarness, stdioFixture } from './fixtures/session-harness';

for (const action of ['accept', 'decline', 'cancel'] as const) {
  test(`Session elicitation ${action} continues the Call`, async () => {
    const session = new SessionHarness();
    try {
      await session.send(stdioFixture);
      const request = session.waitFor('elicitation_request');
      const call = session.send({ type: 'invoke', tool: 'elicit', params: {} });
      const elicitation = await request;
      expect(elicitation.requestedSchema).toMatchObject({ required: ['name'] });
      await session.send({ type: 'elicitation_response', elicitationId: elicitation.elicitationId, action, ...(action === 'accept' ? { content: { name: 'Ada' } } : {}) });
      await call;
      const result = await session.waitFor('result');
      expect(result.data).toMatchObject({ content: [{ type: 'text', text: JSON.stringify(action === 'accept' ? { action, content: { name: 'Ada' } } : { action }) }] });
    } finally { await session.close(); }
  });
}

test('disconnect closes pending elicitation and the Session can reconnect', async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    const request = session.waitFor('elicitation_request');
    const call = session.send({ type: 'invoke', tool: 'elicit', params: {} });
    const { elicitationId } = await request;
    await session.send({ type: 'disconnect' });
    expect(await session.waitFor('elicitation_closed')).toEqual({ type: 'elicitation_closed', elicitationId });
    await call;
    await session.send({ type: 'elicitation_response', elicitationId, action: 'accept', content: { name: 'stale' } });
    await session.send(stdioFixture);
    await session.send({ type: 'invoke', tool: 'echo', params: { text: 'reconnected' } });
    expect(await session.waitFor('result', m => JSON.stringify(m.data).includes('reconnected'))).toMatchObject({ data: { content: [{ text: 'reconnected' }] } });
  } finally { await session.close(); }
});
