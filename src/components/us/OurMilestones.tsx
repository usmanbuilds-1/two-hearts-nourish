import {useMemo,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Plus} from "lucide-react";
import {toast} from "sonner";
import {Btn,Field,TextInput} from "./primitives";
import {parseLocalDate} from "@/lib/nutrition";
import {validMilestoneDate,upcomingMilestones,canEditMilestone} from "@/lib/couple-milestones";
import {
  listOurMilestones,saveOurMilestone,deleteOurMilestone,type CoupleMilestone,
} from "@/lib/couple-milestones.functions";

type Draft={title:string;date:string;note:string;annual:boolean};
const blank=(today:string):Draft=>({title:"",date:today,note:"",annual:false});
const formatDate=(raw:string)=>parseLocalDate(raw).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const countdown=(days:number)=>days===0?"Today":days===1?"Tomorrow":`In ${days} days`;

export function OurMilestones({
  roomId,meId,today,togetherSince,memberNames,
}:{
  roomId:string;meId:string;today:string;togetherSince:string|null;
  memberNames:Record<string,string>;
}){
  const qc=useQueryClient();
  const {data:entries=[],isPending,isError,refetch}=useQuery<CoupleMilestone[]>({
    queryKey:["couple-milestones",roomId],
    queryFn:()=>listOurMilestones(),
    staleTime:60_000,
  });
  const upcoming=useMemo(()=>upcomingMilestones(entries,togetherSince,today),[entries,togetherSince,today]);
  const sorted=useMemo(()=>[...entries].sort((a,b)=>
    b.milestone_date.localeCompare(a.milestone_date)||a.created_at.localeCompare(b.created_at)
  ),[entries]);
  const [open,setOpen]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft>(()=>blank(today));
  const [busy,setBusy]=useState(false);
  const [removingId,setRemovingId]=useState<string|null>(null);

  function startNew(){
    setEditingId(null);setDraft(blank(today));setOpen(true);
  }
  function edit(m:CoupleMilestone){
    if(!canEditMilestone(m.created_by_member_id,meId))return;
    setEditingId(m.id);
    setDraft({title:m.title,date:m.milestone_date,note:m.note??"",annual:m.repeats_annually});
    setOpen(true);
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(busy)return;
    const title=draft.title.trim();
    if(!title||title.length>100){toast.error("Please enter a title up to 100 characters.");return;}
    if(!validMilestoneDate(draft.date)){toast.error("Choose a valid date.");return;}
    setBusy(true);
    try{
      await saveOurMilestone({data:{
        ...(editingId?{id:editingId}:{}),title,milestoneDate:draft.date,
        note:draft.note.trim().slice(0,500),annual:draft.annual,
      }});
      await qc.invalidateQueries({queryKey:["couple-milestones",roomId]});
      toast.success(editingId?"Milestone updated":"Milestone saved for both of you");
      setOpen(false);setEditingId(null);setDraft(blank(today));
    }catch(error){
      const code=error instanceof Error?error.message:"";
      toast.error(code.includes("MILESTONE_LIMIT_REACHED")?"You've reached the milestone limit.":code.includes("NOT_YOUR_MILESTONE")?"Only the person who added this can edit it.":"Couldn't save this milestone. Please try again.");
    }finally{setBusy(false);}
  }

  async function remove(m:CoupleMilestone){
    if(!canEditMilestone(m.created_by_member_id,meId)||busy||removingId)return;
    if(!window.confirm(`Delete "${m.title}" from your shared timeline?`))return;
    setRemovingId(m.id);
    try{
      await deleteOurMilestone({data:{id:m.id}});
      await qc.invalidateQueries({queryKey:["couple-milestones",roomId]});
      toast("Milestone deleted");
    }catch{toast.error("Couldn't delete this milestone.");}
    finally{setRemovingId(null);}
  }

  return (
    <section className="mt-8" aria-label="Our relationship milestones">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-normal">Our milestones</h2>
        <Btn variant="outline" onClick={()=>open?setOpen(false):startNew()} disabled={busy}>
          {!open&&<Plus className="size-4" aria-hidden="true"/>}{open?"Close":"Add"}
        </Btn>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Dates and little moments that matter to you. Everything you save here is visible to both of you.
      </p>

      {open&&(
        <form onSubmit={e=>void submit(e)} className="mt-4 space-y-4 border-y border-border bg-card/50 p-4">
          <h3 className="text-base font-semibold">{editingId?"Edit our moment":"Add a moment"}</h3>
          <Field label="What happened?">
            <TextInput value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}
              maxLength={100} required placeholder="First date, first trip, anniversary…"/>
          </Field>
          <Field label="Date">
            <TextInput type="date" min="1900-01-01" max="2100-12-31" required
              value={draft.date} onChange={e=>setDraft(d=>({...d,date:e.target.value}))}/>
          </Field>
          <Field label="A note to remember (optional)">
            <textarea rows={3} maxLength={500} value={draft.note}
              onChange={e=>setDraft(d=>({...d,note:e.target.value}))}
              placeholder="A few words about this day"
              className="w-full resize-y rounded-xl border border-input bg-card px-3 py-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
          </Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={draft.annual}
              onChange={e=>setDraft(d=>({...d,annual:e.target.checked}))}
              className="size-4 accent-primary"/>
            Celebrate this date every year
          </label>
          <div className="flex gap-2">
            <Btn size="lg" className="flex-1" disabled={busy} submit>
              {busy?"Saving…":editingId?"Save changes":"Save milestone"}
            </Btn>
            <Btn size="lg" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Btn>
          </div>
        </form>
      )}

      {isPending?(
        <p className="mt-5 text-sm text-muted-foreground" role="status">Loading your dates…</p>
      ):isError?(
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border py-3">
          <p role="alert" className="text-sm text-muted-foreground">Couldn't load your milestones.</p>
          <Btn variant="outline" onClick={()=>void refetch()}>Retry</Btn>
        </div>
      ):(
        <>
          {upcoming.length>0&&(
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Coming up</h3>
              <div className="mt-2 divide-y divide-border border-y border-border">
                {upcoming.map(m=>(
                  <div key={m.source+":"+m.id} className="flex min-h-16 items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(m.date)}
                        {m.years>0?` · ${m.years} ${m.years===1?"year":"years"}`:""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-primary">{countdown(m.daysAway)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5">
            <h3 className="text-sm font-semibold">Our story</h3>
            {sorted.length===0?(
              <p className="mt-2 text-sm text-muted-foreground">
                No dates saved yet. You could start with when you first met, a first date or a moment you'll always remember.
              </p>
            ):(
              <ol className="mt-3 divide-y divide-border border-t border-border">
                {sorted.map(m=>(
                  <li key={m.id} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{formatDate(m.milestone_date)}
                          {m.milestone_date>today?" · Planned":""}
                          {m.repeats_annually?" · Every year":""}
                        </p>
                        <p className="mt-1 text-base font-semibold">{m.title}</p>
                        {m.note&&<p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{m.note}</p>}
                        <p className="mt-2 text-xs text-muted-foreground">
                          Added by {memberNames[m.created_by_member_id]??"Your partner"}
                        </p>
                      </div>
                      {canEditMilestone(m.created_by_member_id,meId)&&(
                        <div className="flex shrink-0 gap-1">
                          <button type="button" disabled={busy||Boolean(removingId)}
                            onClick={()=>edit(m)} className="min-h-11 px-2 text-sm font-medium text-primary disabled:opacity-50">Edit</button>
                          <button type="button" disabled={busy||Boolean(removingId)}
                            onClick={()=>void remove(m)} className="min-h-11 px-2 text-sm font-medium text-destructive disabled:opacity-50">Delete</button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
