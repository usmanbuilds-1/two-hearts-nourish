<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Each phone gets an invisible anonymous auth identity bound to a `members` row; RLS uses `my_room_id()`/`my_member_id()` — so the database enforces room isolation without any login UI.
- Room create/join/rejoin run in `src/lib/room.functions.ts` with the admin client after auth checks; only token hashes are stored — raw keys live only in the browser.
- Food-photo analysis runs server-side in `src/lib/scan.functions.ts` via the AI gateway; results are validated server-side and never auto-saved.
- Daily-target suggestions come from local math in `src/lib/health.ts` (Mifflin–St Jeor with safety floors), never from an AI call, so calculating targets costs no credits.
