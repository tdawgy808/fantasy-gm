import test from 'node:test';
import assert from 'node:assert/strict';
import { githubOwner } from '../lib/auth/github.ts';

const config = { clientId:'synthetic-client',clientSecret:'synthetic-private-value',ownerId:'900001',redirectUri:'https://example.com/api/login/callback' };
test('OAuth exchange includes PKCE, checks immutable identity and returns no token', async () => {
  const calls = [];
  const transport = async (url,init) => {
    calls.push({url,init});
    return Response.json(calls.length === 1 ? {access_token:'synthetic-access-value'} : {id:900001,login:'owner'});
  };
  const result = await githubOwner('synthetic-code','synthetic-verifier',config,transport);
  assert.equal(result,'900001');
  assert.equal(JSON.parse(calls[0].init.body).code_verifier,'synthetic-verifier');
  assert.equal(calls[1].url,'https://api.github.com/user');
  assert.equal(calls[1].init.cache,'no-store');
});
test('different GitHub account cannot become the app owner', async () => {
  let count=0; const transport=async()=>Response.json(++count === 1 ? {access_token:'synthetic-access-value'} : {id:900002,login:'same-looking-name'});
  assert.equal(await githubOwner('code','verifier',config,transport),null);
});
test('failed exchange and malformed identity fail closed', async () => {
  assert.equal(await githubOwner('code','verifier',config,async()=>new Response('',{status:401})),null);
  assert.equal(await githubOwner('code','verifier',config,async()=>Response.json({error:'denied'})),null);
  let count=0; assert.equal(await githubOwner('code','verifier',config,async()=>Response.json(++count===1?{access_token:'synthetic-access-value'}:{id:'900001'})),null);
});
