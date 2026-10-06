import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// api/ writes its log lines only through api/_log.ts, which cuts every
// Checkout Session id (a bearer credential) out of them. eslint.config.js
// enforces that; these tests pin the rule, so deleting or loosening it turns
// them red instead of letting a `console.error(err)` through with CI green.
const eslint = new ESLint();

async function rulesBroken(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId ?? message.message);
}

describe('only api/_log.ts writes output in api/', { timeout: 30_000 }, () => {
  it.each([
    ["console.error('verify-purchase error', err);", 'api/verify-purchase.ts'],
    ['console.dir(err);', 'api/stripe-webhook.ts'],
    ["console.info('entitlement', { session: session.id });", 'api/_lib.ts'],
    ['console.log(session.id);', 'api/some-new-route.ts'],
    ['console.log(session.id);', 'api/some-new-route.mjs'],
  ])('refuses `%s` in %s', async (code, filePath) => {
    expect(await rulesBroken(code, filePath)).toContain('no-console');
  });

  it.each([
    ['process.stderr.write(message);', 'api/stripe-webhook.ts'],
    ['process.stdout.write(message);', 'api/_lib.ts'],
    ['process.emitWarning(message);', 'api/verify-purchase.ts'],
  ])('refuses `%s` in %s', async (code, filePath) => {
    expect(await rulesBroken(code, filePath)).toContain('no-restricted-properties');
  });

  it('does not honour a disable comment in api/', async () => {
    const broken = await rulesBroken(
      '// eslint-disable-next-line no-console\nconsole.error(err);',
      'api/verify-purchase.ts',
    );
    expect(broken).toContain('no-console');
  });

  it('lets api/ code log through `log`', async () => {
    expect(
      await rulesBroken("log.error('verify-purchase error', errorLogFields(err));", 'api/verify-purchase.ts'),
    ).toEqual([]);
  });

  it('lets api/_log.ts write with console.error, warn and info, and nothing else', async () => {
    expect(
      await rulesBroken("console.error('x', {});\nconsole.warn('x', {});\nconsole.info('x', {});", 'api/_log.ts'),
    ).toEqual([]);
    expect(await rulesBroken('console.dir(x);', 'api/_log.ts')).toContain('no-console');
  });

  it('leaves the tests and the client kit free to use the console', async () => {
    expect(await rulesBroken('console.log(x);', 'api/anything.test.ts')).toEqual([]);
    expect(await rulesBroken('console.error(x);', 'src/kit/config.ts')).toEqual([]);
  });
});
