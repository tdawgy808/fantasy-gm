import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { configured, cookieOptions, isOwner, newPkce, origin, sameOrigin, SESSION_SECONDS, signClaims, verifyClaims } from '../lib/auth/session.ts';

process.env.GM_AUTH_SECRET = randomBytes(32).toString('base64url');
process.env.GM_OWNER_GITHUB_ID = '900001';
process.env.APP_ORIGIN = 'http://localhost:3000';
delete process.env.VERCEL;
test('owner identity is checked against numeric allowlist', () => {
  assert.equal(isOwner(signClaims('owner', '900001', SESSION_SECONDS)), true);
  assert.equal(isOwner(signClaims('owner', '900002', SESSION_SECONDS)), false);
  assert.equal(isOwner(signClaims('login', '900001', 600)), false);
});
test('expired, tampered, future and overlong sessions fail closed', () => {
  const now = Date.now();
  const value = signClaims('owner', '900001', SESSION_SECONDS, now);
  assert.equal(verifyClaims(value, 'owner', now + SESSION_SECONDS * 1000), null);
  assert.equal(verifyClaims(value.replace(/^./, 'X'), 'owner', now), null);
  assert.equal(verifyClaims(signClaims('owner', '900001', SESSION_SECONDS, now+60000), 'owner', now), null);
  assert.equal(verifyClaims(signClaims('owner', '900001', SESSION_SECONDS+1, now), 'owner', now), null);
  for (const invalid of [undefined, '', 'not-a-cookie', 'x'.repeat(3000)]) assert.equal(verifyClaims(invalid, 'owner'), null);
});
test('login state cannot act as an owner session and expires in ten minutes', () => {
  const now = Date.now(); const value = signClaims('login', randomBytes(32).toString('hex'), 600, now);
  assert.ok(verifyClaims(value, 'login', now));
  assert.equal(verifyClaims(value, 'owner', now), null);
  assert.equal(verifyClaims(value, 'login', now+600000), null);
});
test('cookies are HTTP-only with HTTPS enforcement in hosted mode', () => {
  assert.equal(cookieOptions(10).httpOnly, true);
  assert.equal(cookieOptions(10).sameSite, 'lax');
  process.env.APP_ORIGIN = 'https://example.com'; process.env.VERCEL = '1';
  assert.equal(cookieOptions(10).secure, true);
  process.env.APP_ORIGIN = 'http://localhost:3000';
  assert.throws(origin);
  delete process.env.VERCEL;
});
test('logout requires an exact origin; unset and cross-site origins fail', () => {
  assert.equal(sameOrigin(new Request('http://localhost:3000/api/login/logout', { headers: { origin: 'http://localhost:3000' } })), true);
  assert.equal(sameOrigin(new Request('http://localhost:3000/api/login/logout', { headers: { origin: 'https://attacker.example' } })), false);
  assert.equal(sameOrigin(new Request('http://localhost:3000/api/login/logout')), false);
});
test('missing or placeholder signing key cannot authenticate', () => {
  const previous = process.env.GM_AUTH_SECRET;
  for (const value of ['', 'short', 'replace_with_at_least_32_random_bytes_base64_encoded']) {
    process.env.GM_AUTH_SECRET = value; assert.equal(configured(), false); assert.equal(isOwner('invalid'), false); assert.throws(() => signClaims('owner','900001',60));
  }
  process.env.GM_AUTH_SECRET = previous;
});
test('PKCE uses a fresh random verifier and matching S256 challenge', () => {
  const first = newPkce(), second = newPkce();
  assert.match(first.verifier,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.challenge,createHash('sha256').update(first.verifier).digest('base64url'));
  assert.notEqual(first.verifier,second.verifier);
});
