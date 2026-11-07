import type { Snapshot } from "./snapshot.ts";
import { seededRandom } from "./simulation.ts";
export function playoffOutlook(snapshot:Snapshot) {
  const rules=snapshot.analysis_inputs?.playoff;
  const count=rules?.teams??(snapshot.rules?.playoffs as {teams?:number}|undefined)?.teams;
  const rank=snapshot.team.rank;
  const schedule=snapshot.analysis_inputs?.schedule?.filter(g=>g.week>=snapshot.week&&(!rules||g.week<rules.start_week))??[];
  const owner=schedule.filter(g=>g.home===snapshot.team.id||g.away===snapshot.team.id);
  const opponents=owner.map(g=>g.home===snapshot.team.id?g.away_projection:g.home_projection);
  const model=simulateSeason(snapshot);
  return {rank:rank??null,qualifiers:count??null,position:rank&&count?(rank<=count?"Currently inside the playoff cut; qualification is not secured.":"Currently outside the playoff cut; prioritize near-term wins."):"Playoff qualification rules or standings missing.",probability:model?.probability??null,simulation_trials:model?.trials??0,
    schedule_strength:opponents.length?opponents.reduce((a,b)=>a+b,0)/opponents.length:null,
    remaining_games:owner.length,limitations:[model?"Empirical team-score bootstrap with independence across teams/weeks; points-for tiebreaker only. Uncalibrated scenario estimate, not a forecast guarantee.":"No playoff probability: need complete pre-week records, all remaining regular-season matchups/projections, eight compatible team-score observations per team and a supported points-for tiebreaker. Started current-week games disable this season model.",...(opponents.length?["Schedule strength is the mean imported opponent weekly projection, not a win probability."]:["Remaining schedule strength unavailable."]),"Playoff roster value is shown only where explicit playoff projections are imported."]};
}
export function simulateSeason(snapshot:Snapshot,trials=3000){
  const input=snapshot.analysis_inputs,teams=input?.teams,rules=input?.playoff,scoring=input?.scoring;
  if(!teams||teams.length<2||!rules||rules.tie_breaker!=="points_for"||!scoring||rules.teams>=teams.length||rules.start_week<=snapshot.week||input?.records_through_week!==snapshot.week-1||snapshot.roster.some(p=>p.actual!==undefined||/final|in progress|live|locked/i.test(p.game_status??""))||input.players.some(p=>p.actual!==undefined||/final|in progress|live|locked/i.test(p.game_status??"")))return null;
  if(teams.some(t=>t.wins===undefined||t.losses===undefined||t.ties===undefined||t.points_for===undefined||t.wins+t.losses+t.ties!==input.records_through_week))return null;
  const histories=input.team_histories??[];
  if(teams.some(t=>{const h=histories.find(h=>h.team_id===t.id);return !h||h.scoring_id!==scoring.id||h.through_week>=snapshot.week||h.points.length<8;}))return null;
  const schedule=(input.schedule??[]).filter(g=>g.week>=snapshot.week&&g.week<rules.start_week);
  for(let week=snapshot.week;week<rules.start_week;week++)for(const t of teams)if(schedule.filter(g=>g.week===week&&(g.home===t.id||g.away===t.id)).length!==1)return null;
  const random=seededRandom(71);let qualifies=0;
  const draw=(id:number,mean:number)=>{const h=histories.find(h=>h.team_id===id)!.points;return mean+h[Math.floor(random()*h.length)]-h.reduce((s,v)=>s+v,0)/h.length;};
  for(let i=0;i<trials;i++){
    const records=new Map(teams.map(t=>[t.id,{id:t.id,wins:t.wins!+.5*t.ties!,pf:t.points_for!}]));
    for(const game of schedule){const home=draw(game.home,game.home_projection),away=draw(game.away,game.away_projection),a=records.get(game.home)!,b=records.get(game.away)!;a.pf+=home;b.pf+=away;a.wins+=home>away?1:home===away?.5:0;b.wins+=away>home?1:home===away?.5:0;}
    const ordered=[...records.values()].sort((a,b)=>b.wins-a.wins||b.pf-a.pf);
    if(ordered[rules.teams-1].wins===ordered[rules.teams].wins&&ordered[rules.teams-1].pf===ordered[rules.teams].pf)return null;
    if(ordered.slice(0,rules.teams).some(t=>t.id===snapshot.team.id))qualifies++;
  }
  return {probability:qualifies/trials,trials};
}
