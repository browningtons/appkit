import { describe, it, expect } from 'vitest';
import { parseActivation } from './activation';

describe('parseActivation', () => {
  it('returns all-false for an empty string', () => {
    expect(parseActivation('')).toEqual({
      pro: false,
      sessionId: null,
      admin: false,
    });
  });

  it('detects #pro=1 from a Payment Link redirect', () => {
    expect(parseActivation('#pro=1').pro).toBe(true);
  });

  it('does not treat a substring like pro=12 as pro=1', () => {
    // Guards against loose matching; only the exact token unlocks.
    expect(parseActivation('#pro=12').pro).toBe(false);
  });

  it('extracts a well-formed Checkout Session id from the hash', () => {
    expect(parseActivation('#session_id=cs_test_abc123').sessionId).toBe(
      'cs_test_abc123',
    );
  });

  it('extracts a session id from the query string too', () => {
    expect(parseActivation('?session_id=cs_live_xyz').sessionId).toBe(
      'cs_live_xyz',
    );
  });

  it('rejects a session id that is not cs_-prefixed', () => {
    expect(parseActivation('#session_id=evil_payload').sessionId).toBeNull();
  });

  it('detects the admin token', () => {
    expect(parseActivation('#admin').admin).toBe(true);
  });

  it('parses multiple tokens across hash and search', () => {
    const result = parseActivation('#admin?session_id=cs_test_1&pro=1');
    expect(result).toEqual({
      pro: true,
      sessionId: 'cs_test_1',
      admin: true,
    });
  });

  it('ignores unrelated tokens (e.g. analytics params)', () => {
    const result = parseActivation('?utm_source=twitter&fbclid=123');
    expect(result).toEqual({
      pro: false,
      sessionId: null,
      admin: false,
    });
  });
});
