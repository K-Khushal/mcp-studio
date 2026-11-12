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

test('answering an elicitation after its Call was cancelled is ignored', async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    const request = session.waitFor('elicitation_request');
    const call = session.send({ type: 'invoke', tool: 'elicit', params: {}, requestId: 'elicit-call' });
    const { elicitationId } = await request;
    await session.send({ type: 'cancel', requestId: 'elicit-call' });
    expect(await session.waitFor('elicitation_closed')).toEqual({ type: 'elicitation_closed', elicitationId });
    await call;
    expect(await session.waitFor('cancelled')).toEqual({ type: 'cancelled', requestId: 'elicit-call' });
    const before = session.messages.length;
    await session.send({ type: 'elicitation_response', elicitationId, action: 'accept', content: { name: 'late' } });
    expect(session.messages.slice(before)).toEqual([]);
    await session.send({ type: 'invoke', tool: 'echo', params: { text: 'still live' } });
    expect(await session.waitFor('result')).toMatchObject({ data: { content: [{ text: 'still live' }] } });
    expect(session.messages.some(m => m.type === 'result' && JSON.stringify(m.data).includes('late'))).toBe(false);
  } finally { await session.close(); }
});

test('a crash while an elicitation is pending closes it and ends the Call', async () => {
  const session = new SessionHarness();
  try {
    await session.send(stdioFixture);
    const request = session.waitFor('elicitation_request');
    const call = session.send({ type: 'invoke', tool: 'elicit', params: {}, requestId: 'elicit-call' });
    const { elicitationId } = await request;
    const crash = session.send({ type: 'invoke', tool: 'crash', params: {}, requestId: 'crash-call' });
    expect(await session.waitFor('elicitation_closed')).toEqual({ type: 'elicitation_closed', elicitationId });
    expect(await session.waitFor('disconnected')).toMatchObject({ reason: 'MCP Server connection closed unexpectedly' });
    await Promise.all([call, crash]);
    const ended = session.messages.filter(m => m.type === 'error' || m.type === 'cancelled' || m.type === 'result');
    expect(ended).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'error', requestId: 'elicit-call', code: 'CONNECTION_CLOSED' }),
      expect.objectContaining({ type: 'error', requestId: 'crash-call', code: 'CONNECTION_CLOSED' }),
    ]));
    expect(ended).toHaveLength(2);
    const before = session.messages.length;
    await session.send({ type: 'elicitation_response', elicitationId, action: 'accept', content: { name: 'late' } });
    expect(session.messages.slice(before)).toEqual([]);
  } finally { await session.close(); }
});
