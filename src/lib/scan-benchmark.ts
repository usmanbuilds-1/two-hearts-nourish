export type NutritionTruth = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  grams?: number;
};

export type BenchmarkObservation = {
  mealId: string;
  category: string;
  truth: NutritionTruth;
  predicted: NutritionTruth;
  latencyMs?: number;
  costMicrousd?: number;
};

export type BenchmarkSummary = {
  cases: number;
  calorieMape: number;
  calorieBiasPct: number;
  calorieMae: number;
  proteinMae: number;
  carbsMae: number;
  fatMae: number;
  gramMape: number | null;
  within10Pct: number;
  within20Pct: number;
  within30Pct: number;
  repeatVariationMedianPct: number | null;
  averageCostUsd: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
};

const safePct = (predicted: number, truth: number) => truth > 0 ? ((predicted - truth) / truth) * 100 : null;
const abs = (n: number) => Math.abs(n);
const mean = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1));
  return sorted[index]!;
}

function median(values:number[]):number|null{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]!:(sorted[middle-1]!+sorted[middle]!)/2;
}

function round(value:number,places=2){
  const factor=10**places;
  return Math.round(value*factor)/factor;
}

export function summarizeBenchmark(rows: BenchmarkObservation[]): BenchmarkSummary {
  if (!rows.length) {
    return {
      cases:0,calorieMape:0,calorieBiasPct:0,calorieMae:0,proteinMae:0,carbsMae:0,fatMae:0,
      gramMape:null,within10Pct:0,within20Pct:0,within30Pct:0,repeatVariationMedianPct:null,
      averageCostUsd:null,p50LatencyMs:null,p95LatencyMs:null,
    };
  }
  const caloriePct=rows.map(row=>safePct(row.predicted.calories,row.truth.calories)).filter((v):v is number=>v!==null);
  const gramPct=rows.map(row=>
    row.truth.grams!=null&&row.predicted.grams!=null?safePct(row.predicted.grams,row.truth.grams):null
  ).filter((v):v is number=>v!==null);

  const repeatGroups=new Map<string,number[]>();
  for(const row of rows){
    const group=repeatGroups.get(row.mealId)??[];
    group.push(row.predicted.calories);
    repeatGroups.set(row.mealId,group);
  }
  const repeatVariations:number[]=[];
  for(const values of repeatGroups.values()){
    if(values.length<2)continue;
    const avg=mean(values);
    if(avg<=0)continue;
    repeatVariations.push(((Math.max(...values)-Math.min(...values))/avg)*100);
  }

  const latencies=rows.map(r=>r.latencyMs).filter((v):v is number=>typeof v==="number"&&v>=0);
  const costs=rows.map(r=>r.costMicrousd).filter((v):v is number=>typeof v==="number"&&v>=0);
  const within=(threshold:number)=>caloriePct.length
    ? caloriePct.filter(value=>abs(value)<=threshold).length/caloriePct.length*100
    : 0;

  return {
    cases:rows.length,
    calorieMape:round(mean(caloriePct.map(abs))),
    calorieBiasPct:round(mean(caloriePct)),
    calorieMae:round(mean(rows.map(r=>abs(r.predicted.calories-r.truth.calories)))),
    proteinMae:round(mean(rows.map(r=>abs(r.predicted.protein-r.truth.protein)))),
    carbsMae:round(mean(rows.map(r=>abs(r.predicted.carbs-r.truth.carbs)))),
    fatMae:round(mean(rows.map(r=>abs(r.predicted.fat-r.truth.fat)))),
    gramMape:gramPct.length?round(mean(gramPct.map(abs))):null,
    within10Pct:round(within(10)),
    within20Pct:round(within(20)),
    within30Pct:round(within(30)),
    repeatVariationMedianPct:repeatVariations.length?round(median(repeatVariations)??0):null,
    averageCostUsd:costs.length?round(mean(costs)/1_000_000,6):null,
    p50LatencyMs:percentile(latencies,0.5),
    p95LatencyMs:percentile(latencies,0.95),
  };
}
