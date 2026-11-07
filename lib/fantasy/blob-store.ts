import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { boundedText, projectSnapshot, SnapshotConflict, type SnapshotStore } from "./hosted";

const pathname = "fantasy-gm/2026/121612/5/current.json";
export function hostedStorageConfigured() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}
export const blobSnapshotStore: SnapshotStore = {
  async read() {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return { snapshot: projectSnapshot(await boundedText(result.stream)), etag: result.blob.etag };
  },
  async write(text, etag) {
    try {
      await put(pathname, text, {
        access: "private", contentType: "application/json", addRandomSuffix: false,
        allowOverwrite: !!etag, ...(etag ? { ifMatch: etag } : {}),
      });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || error instanceof Error && /already exists/i.test(error.message)) {
        throw new SnapshotConflict("Another refresh was saved. Reload before saving again.");
      }
      throw error;
    }
  },
};
