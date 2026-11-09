export const studioURL = `http://localhost:${process.env.E2E_PORT || '47831'}`;
export const fixtureURL = `http://localhost:${process.env.E2E_FIXTURE_PORT || '47832'}`;
/** Fixed Launch token for the packaged CLI under test (ADR-0007); real launches print a random one. */
export const studioToken = process.env.E2E_TOKEN || 'e2e-launch-token-0123456789abcdefghij';
