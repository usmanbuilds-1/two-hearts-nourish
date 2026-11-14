/** Pure calendar helpers for personal relationship milestones, independent of device timezone. */
export type MilestoneDate = {date:string;daysAway:number;years:number};
export type UpcomingMilestone = MilestoneDate & {id:string;title:string;source:"saved"|"relationship"};

function parts(raw:string):[number,number,number]|null {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if(!match)return null;
  return [Number(match[1]),Number(match[2]),Number(match[3])];
}

export function validMilestoneDate(raw:string):boolean {
  const p=parts(raw);
  if(!p)return false;
  const [y,m,d]=p;
  if(y<1900||y>2100||m<1||m>12||d<1||d>31)return false;
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}

function utcDay(raw:string):number {
  const p=parts(raw);
  if(!p)throw new Error("INVALID_DATE");
  return Date.UTC(p[0],p[1]-1,p[2]);
}
function leap(y:number):boolean {return y%4===0&&(y%100!==0||y%400===0);}
function calendarDay(y:number,m:number,d:number):string {
  // February 29 anniversaries are observed on February 28 in non-leap years.
  const day=m===2&&d===29&&!leap(y)?28:d;
  return [String(y).padStart(4,"0"),String(m).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
}

export function upcomingOccurrence(date:string,today:string,repeatAnnually:boolean):MilestoneDate|null {
  if(!validMilestoneDate(date)||!validMilestoneDate(today))return null;
  if(!repeatAnnually){
    if(date<today)return null;
    return {date,daysAway:Math.round((utcDay(date)-utcDay(today))/86400000),years:0};
  }
  const original=parts(date)!;
  const currentYear=parts(today)![0];
  const startYear=Math.max(currentYear,original[0]);
  for(let year=startYear;year<=2100;year++){
    const next=calendarDay(year,original[1],original[2]);
    if(next>=today&&next>=date)return {
      date:next,daysAway:Math.round((utcDay(next)-utcDay(today))/86400000),
      years:year-original[0]
    };
  }
  return null;
}

export function upcomingMilestones(
  saved:ReadonlyArray<{id:string;title:string;milestone_date:string;repeats_annually:boolean}>,
  togetherSince:string|null,today:string,
):UpcomingMilestone[] {
  const upcoming:UpcomingMilestone[]=[];
  for(const m of saved){
    const date=upcomingOccurrence(m.milestone_date,today,m.repeats_annually);
    if(date)upcoming.push({...date,id:m.id,title:m.title,source:"saved"});
  }
  if(togetherSince&&validMilestoneDate(togetherSince)&&togetherSince<=today){
    const date=upcomingOccurrence(togetherSince,today,true);
    if(date)upcoming.push({...date,id:"relationship-anniversary",title:"Our anniversary",source:"relationship"});
  }
  return upcoming.sort((a,b)=>a.daysAway-b.daysAway||a.title.localeCompare(b.title)).slice(0,3);
}

export function canEditMilestone(createdByMemberId:string,myMemberId:string):boolean {
  return createdByMemberId===myMemberId;
}
