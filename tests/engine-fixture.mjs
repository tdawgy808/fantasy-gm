// Synthetic data only. Example source URLs are validation fixtures, not real reports.
export const now=Date.parse('2026-11-06T20:00:00Z');
export function fixture(){
  const history=values=>values.map((points,i)=>({week:i+1,season:2026,played_at:`2026-10-${String(i+1).padStart(2,'0')}T12:00:00Z`,points,scoring_id:'test'}));
  return {schema_version:2,captured_at:'2026-11-06T19:00:00Z',timezone:'America/Los_Angeles',method:'Synthetic test fixture',league:{id:121612,season:2026,name:'Example'},team:{id:5,name:'Example owner',rank:7,faab_remaining:100},week:9,
    sources:{roster:'https://football.fantasysports.yahoo.com/f1/121612/5'},roster:[{name:'Steady',slot:'RB',position:'RB',projection:10},{name:'Volatile',slot:'BN',position:'RB',projection:12}],available_players:[['Candidate','RB','FA',13]],rules:{roster_positions:['RB','BN'],playoffs:{teams:6,weeks:[15,16,17]},trade_deadline:'2026-11-28'},
    analysis_inputs:{scoring:{id:'test',complete:true,rules:[{stat:'yards',points:.1}]},roster_slots:['RB'],opponent_team_id:2,players:[
      {id:'steady',name:'Steady',position:'RB',eligible:['RB'],projection:10,history:history([9,10,11,10,9,10,11,10])},
      {id:'volatile',name:'Volatile',position:'RB',eligible:['RB'],projection:12,history:history([0,0,0,0,24,24,24,24])},
      {id:'other',name:'Opponent',position:'RB',eligible:['RB'],projection:11,history:history([10,11,12,11,10,11,12,11])},
      {id:'candidate',name:'Candidate',position:'RB',eligible:['RB'],projection:13,opportunity_trend:.1},
      {id:'stash',name:'Stash',position:'RB',eligible:['RB'],projection:7,opportunity_trend:1,ros_projection:20,playoff_projection:22},
    ],teams:[{id:5,name:'Example owner',roster:[{player_id:'steady',slot:'RB'},{player_id:'volatile',slot:'BN'}]},{id:2,name:'Example other',roster:[{player_id:'other',slot:'RB'}]}],available_ids:['candidate','stash'],waiver_min_bid:0,waiver_increment:1}
  };
}
export function research(effect={projection_multiplier:.2}){return {schema_version:1,collected_at:'2026-11-06T19:30:00Z',mode:'manual',findings:[{id:'example-finding',player_id:'volatile',player:'Volatile',source:'Synthetic NFL test source',source_url:'https://www.nfl.com/news/synthetic-fixture',published_at:'2026-11-06T18:00:00Z',retrieved_at:'2026-11-06T19:00:00Z',claim:'Synthetic limited-workload example; not a real report.',category:'workload',quality:'high',confirmation:'reported',effect:{week:9,season:2026,rationale:'Synthetic test adjustment',...effect}}]};}
