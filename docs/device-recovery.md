# Private-device recovery and reinvites

This feature extends PR #4's fix for inadvertent logouts.

## Deployment (required order)
1. Apply `drizzle/migrations/0013_device_recovery_keys.sql` to the **same Supabase database** as the app. Existing rooms, member personal keys, meals and device mappings remain unchanged.
2. Confirm the service role can INSERT and SELECT `public.member_recovery_keys`; anonymous/authenticated roles must have **no direct access**. The table is RLS enabled.
3. Deploy the matching server and frontend from this PR together. There is **no deploy** just from pushing a branch.
4. Test with a disposable room and two devices. Use the sender's Settings → Come back to us → Help [partner] rejoin, then open the link in the recipient's regular browser. Confirm it restores their own member, not the sender; the link fails a second time; an unrelated room is not accessible; each phone retains its original recovery key.
5. Test your own extra-device link separately; test expired and superseded links; test loss of the anonymous Supabase session with a saved 64-character personal key; test offline/reconnect and Safari iOS.

## How it works
* Sender must be authenticated and a member of this two-person room.
* Separate **self** and **partner** targets prevent linking a partner's device to the sender by accident.
* Each link is 32 bytes of cryptographic randomness, placed in the URL **fragment** (not HTTP query), expires in 20 minutes and is conditionally consumed once.
* Hash only is stored in `members.link_code_hash`. Creating another link for that *same member* supersedes previous links.
* Redemption links the recipient's **new anonymous Supabase identity** to the intended existing member, then creates a separate 256-bit per-device recovery key. The new key's SHA256 hash is stored in `member_recovery_keys`, rather than overwriting other devices' keys.
* The existing legacy member key is still accepted for recovery. Previously sent six-digit links remain usable until expiry, but new UI generates only high-entropy links.
* The sender can invite their partner back but **cannot retrieve their old permanent personal key**. Anyone possessing an unexpired link could redeem it; share privately.
* Browser or OS deletion of **all** storage cannot be fully prevented. In that case a new link from the partner is required. Use regular Safari instead of in-app webviews.

## Known limitations
* A live database migration is required before new link redemption; otherwise the recipient gets `RECOVERY_STORAGE_UNAVAILABLE`. Do not publish code first.
* Database calls spanning link consumption and member-device insertion are not a single transaction. If device linking fails after a link is consumed, generate another link.
* The old six-digit link issuance endpoint remains for compatibility with older app clients; follow up with server-side throttling or retirement after those clients have updated.
* Without the deployed backend and an actual iPhone test, this change cannot be called production-verified.
