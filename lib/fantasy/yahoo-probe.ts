const api = "https://fantasysports.yahooapis.com/fantasy/v2/";
const season = "2026";
const leagueId = "121612";
const teamId = "5";

export function findValue(value: unknown, key: string, match: (value: string) => boolean): string | undefined {
  if (!value || typeof value !== "object") return;
  for (const [name, item] of Object.entries(value)) {
    if (name === key && (typeof item === "string" || typeof item === "number") && match(String(item))) return String(item);
    const nested = findValue(item, key, match);
    if (nested !== undefined) return nested;
  }
}

export function yahooReader(access: string, request = fetch) {
  return async function get(path: string) {
    const response = await request(api + path + "?format=json", {
      method: "GET", headers: { Authorization: "Bearer " + access, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Yahoo Fantasy API returned HTTP " + response.status + ".");
    return (await response.json()).fantasy_content as unknown;
  };
}

export async function yahooLeagueKeys(get: ReturnType<typeof yahooReader>) {
  const games = await get("games;game_codes=nfl;seasons=" + season);
  const gameKey = findValue(games, "game_key", value => /^\d+$/.test(value));
  if (!gameKey || !findValue(games, "season", value => value === season)) throw new Error("Yahoo's 2026 NFL game could not be verified.");
  const leagueKey = gameKey + ".l." + leagueId;
  const teamKey = leagueKey + ".t." + teamId;
  return {gameKey, leagueKey, teamKey};
}

export async function verifyYahooLeague(access: string, request = fetch) {
  const get = yahooReader(access, request);
  const {gameKey, teamKey} = await yahooLeagueKeys(get);
  const team = await get("team/" + teamKey + "/roster");
  if (!findValue(team, "team_key", value => value === teamKey) ||
      !findValue(team, "player_key", value => value.startsWith(gameKey + ".p."))) {
    throw new Error("Yahoo's league team or roster could not be verified.");
  }
  return { connected: true, season, leagueId, teamId, rosterReadable: true };
}
