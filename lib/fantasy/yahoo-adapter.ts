import type { FantasyDataProvider, Snapshot } from "./snapshot.ts";

// Reserved server-side adapter. Approval, token refresh and encrypted durable storage
// must be in place before replacing this with a Yahoo Fantasy Sports API reader.
export class YahooApiProvider implements FantasyDataProvider {
  async load(): Promise<Snapshot> {
    throw new Error("Yahoo API adapter is not enabled. Import a manual snapshot instead.");
  }
}
