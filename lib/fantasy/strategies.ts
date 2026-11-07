export type Settings = { lineup: "Safe" | "Matchup-Aware" | "Aggressive"; waiver: "Win Now" | "Balanced" | "Upside"; trade: "Win Now" | "Standings-Aware" | "Playoff Focused" };
export const defaultSettings: Settings = { lineup:"Matchup-Aware",waiver:"Balanced",trade:"Standings-Aware" };
export function parseSettings(value: unknown): Settings {
  const v=value as Settings;
  if(!v || !["Safe","Matchup-Aware","Aggressive"].includes(v.lineup) || !["Win Now","Balanced","Upside"].includes(v.waiver) || !["Win Now","Standings-Aware","Playoff Focused"].includes(v.trade)) throw new Error("Choose a supported lineup, waiver and trade strategy.");
  return {lineup:v.lineup,waiver:v.waiver,trade:v.trade};
}
