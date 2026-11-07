// Compressed Blob GET responses use weak ETags (W/"..."). The Blob write API
// requires the strong object ETag for ifMatch. Request the identity representation
// so the read body and the conditional-write revision describe the same object.
export function privateReadOptions() {
  return { access:"private" as const, useCache:false, headers:{"Accept-Encoding":"identity"} };
}
