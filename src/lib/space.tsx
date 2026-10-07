import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Meal, Member, Room } from "./nutrition";
import { localDate } from "./nutrition";

type SpaceCtx = {
  room: Room;
  me: Member;
  partner: Member | null;
  members: Member[];
  meals: Meal[];
  online: boolean;
  today: string;
  /** ids of meals that just arrived from the partner (for subtle animation) */
  fresh: Set<string>;
  reload: () => Promise<void>;
  upsertLocal: (m: Meal) => void;
  removeLocal: (id: string) => void;
  setRoom: (r: Room) => void;
  setMember: (m: Member) => void;
};

const Ctx = createContext<SpaceCtx | null>(null);

export function useSpace() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSpace outside provider");
  return c;
}

const MEMBER_COLS =
  "id, room_id, auth_user_id, seat, display_name, daily_calorie_target, daily_protein_target, daily_carbs_target, daily_fat_target, created_at, height_cm, weight_kg, age, sex, activity_level, body_goal, daily_food_budget, currency, locality";

export async function loadSpace(userId: string) {
  const { data: dev, error: devErr } = await supabase
    .from("member_devices")
    .select("member_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (devErr) throw new Error("OFFLINE_OR_UNAVAILABLE");
  if (!dev) return null;
  const { data: meRow, error } = await supabase
    .from("members")
    .select(MEMBER_COLS)
    .eq("id", dev.member_id)
    .maybeSingle();
  if (error) throw new Error("OFFLINE_OR_UNAVAILABLE");
  if (!meRow) return null;
  const [roomRes, membersRes, mealsRes] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", meRow.room_id).single(),
    supabase.from("members").select(MEMBER_COLS).eq("room_id", meRow.room_id).order("seat"),
    supabase
      .from("meals")
      .select("*")
      .eq("room_id", meRow.room_id)
      .order("created_at", { ascending: true })
      .limit(5000),
  ]);
  if (roomRes.error || membersRes.error || mealsRes.error) throw new Error("OFFLINE_OR_UNAVAILABLE");
  return {
    room: roomRes.data as Room,
    me: meRow as Member,
    members: membersRes.data as Member[],
    meals: mealsRes.data as Meal[],
  };
}

export function SpaceProvider({
  initial,
  children,
}: {
  initial: { room: Room; me: Member; members: Member[]; meals: Meal[] };
  children: ReactNode;
}) {
  const [room, setRoom] = useState(initial.room);
  const [members, setMembers] = useState(initial.members);
  const [meals, setMeals] = useState(initial.meals);
  const [online, setOnline] = useState(true);
  const [today, setToday] = useState(localDate());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const meId = initial.me.id;

  const me = members.find((m) => m.id === meId) ?? initial.me;
  const partner = members.find((m) => m.id !== meId) ?? null;

  const upsertLocal = useCallback((m: Meal) => {
    setMeals((prev) => {
      const i = prev.findIndex((x) => x.id === m.id);
      if (i === -1) return [...prev, m];
      const next = prev.slice();
      next[i] = m;
      return next;
    });
  }, []);
  const removeLocal = useCallback((id: string) => setMeals((p) => p.filter((m) => m.id !== id)), []);
  const setMember = useCallback(
    (m: Member) => setMembers((p) => p.map((x) => (x.id === m.id ? m : x))),
    [],
  );

  const reload = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const s = await loadSpace(data.user.id).catch(() => null);
    if (!s) return;
    setRoom(s.room);
    setMembers(s.members);
    setMeals(s.meals);
  }, []);

  // Realtime: one channel per room, torn down on unmount.
  useEffect(() => {
    const roomId = initial.room.id;
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meals", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) removeLocal(id);
            return;
          }
          const m = payload.new as Meal;
          upsertLocal(m);
          if (m.member_id !== meId) {
            setFresh((s) => new Set(s).add(m.id));
            setTimeout(() => setFresh((s) => {
              const n = new Set(s);
              n.delete(m.id);
              return n;
            }), 2500);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members", filter: `room_id=eq.${roomId}` },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => setRoom(payload.new as Room),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setOnline(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setOnline(false);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initial.room.id, meId, reload, removeLocal, upsertLocal]);

  // Offline awareness + catch up after reconnect / tab focus / midnight.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void reload();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setToday(localDate());
        void reload();
      }
    };
    setOnline(navigator.onLine);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(() => setToday(localDate()), 60_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [reload]);

  const value = useMemo(
    () => ({ room, me, partner, members, meals, online, today, fresh, reload, upsertLocal, removeLocal, setRoom, setMember }),
    [room, me, partner, members, meals, online, today, fresh, reload, upsertLocal, removeLocal, setMember],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
