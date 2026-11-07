import type { Evaluation } from "./players.ts";
import type { AnalysisInputs } from "./inputs.ts";
export function seededRandom(seed=2026) { let n=seed>>>0; return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return (n+.5)/4294967296;}; }
function normal(random:()=>number) {return Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());}
function cdf(x:number) { const t=1/(1+.2316419*Math.abs(x));const tail=.39894228*Math.exp(-x*x/2)*t*(.31938153+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return x>=0?1-tail:tail; }
export function simulateLineups(lineups: Evaluation[][], opponent: Evaluation[], correlations: AnalysisInputs["correlations"], trials=3000) {
  const pool=[...new Map([...lineups.flat(),...opponent].map(p=>[p.id,p])).values()];
  if(!opponent.length||!lineups.length||pool.some(p=>p.locked?p.actual===undefined:p.mean===null||p.samples.length<8||p.unavailable))return null;
  const n=pool.length;
  const matrix:number[][]=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
  for(const c of correlations??[]) { const i=pool.findIndex(p=>p.id===c.a),j=pool.findIndex(p=>p.id===c.b);if(i>=0&&j>=0){matrix[i][j]=c.rho;matrix[j][i]=c.rho;} }
  const l=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let sum=matrix[i][j];for(let k=0;k<j;k++)sum-=l[i][k]*l[j][k];if(i===j){if(sum<1e-8)return null;l[i][j]=Math.sqrt(sum);}else l[i][j]=sum/l[j][j];}
  const distributions=pool.map(p=>{const avg=p.samples.reduce((a,b)=>a+b,0)/(p.samples.length||1);return p.samples.map(v=>(v-avg)*p.variance_scale+(p.mean??0)).sort((a,b)=>a-b);});
  const index=new Map(pool.map((p,i)=>[p.id,i]));const lineupIndexes=lineups.map(ps=>ps.map(p=>index.get(p.id)!));const opp=opponent.map(p=>index.get(p.id)!);
  const wins=lineups.map(()=>0);const random=seededRandom();
  for(let trial=0;trial<trials;trial++){
    const independent=pool.map(()=>normal(random));
    const draws=pool.map((p,i)=>{if(p.locked)return p.actual!;let z=0;for(let j=0;j<=i;j++)z+=l[i][j]*independent[j];const d=distributions[i];return d[Math.min(d.length-1,Math.floor(cdf(z)*d.length))];});
    const other=opp.reduce((sum,i)=>sum+draws[i],0);
    lineupIndexes.forEach((ps,i)=>{const score=ps.reduce((sum,j)=>sum+draws[j],0);wins[i]+=score>other?1:score===other?.5:0;});
  }
  return { probabilities:wins.map(w=>w/trials),trials,correlated:!!correlations?.some(c=>index.has(c.a)&&index.has(c.b)) };
}
