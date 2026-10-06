REVOKE SELECT ON public.members FROM authenticated;
GRANT SELECT (id, room_id, auth_user_id, seat, display_name, daily_calorie_target, daily_protein_target, daily_carbs_target, daily_fat_target, created_at) ON public.members TO authenticated;
REVOKE UPDATE ON public.members FROM authenticated;
GRANT UPDATE (display_name, daily_calorie_target, daily_protein_target, daily_carbs_target, daily_fat_target) ON public.members TO authenticated;
REVOKE UPDATE ON public.rooms FROM authenticated;
GRANT UPDATE (shared_goal, couple_message, together_since) ON public.rooms TO authenticated;