type YahooSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

declare global {
  var fantasyGmYahooSessions:
    | Map<string, YahooSession>
    | undefined;
}

export const yahooSessions =
  globalThis.fantasyGmYahooSessions ??
  new Map<string, YahooSession>();

globalThis.fantasyGmYahooSessions = yahooSessions;