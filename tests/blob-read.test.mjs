import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { get } from '@vercel/blob';
import { privateReadOptions } from '../lib/fantasy/blob-options.ts';

test('private SDK reads request an uncompressed representation and preserve a strong write revision', async () => {
  const previous=getGlobalDispatcher(),mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);
  const host='https://abcdefghijklmnop.private.blob.vercel-storage.com';
  // A compressed response would have W/"revision-one", which ifMatch rejects.
  mock.get(host).intercept({method:'GET',path:'/state.json?cache=0',headers:{'accept-encoding':'identity'}}).reply(200,'{}',{headers:{etag:'"revision-one"','content-type':'application/json'}});
  try {
    const value=await get(host+'/state.json',{...privateReadOptions(),token:'vercel_blob_rw_abcdefghijklmnop_synthetic-test'});
    assert.equal(value.statusCode,200);assert.equal(value.blob.etag,'"revision-one"');assert.equal(await new Response(value.stream).text(),'{}');mock.assertNoPendingInterceptors();
  } finally {setGlobalDispatcher(previous);await mock.close();}
});
