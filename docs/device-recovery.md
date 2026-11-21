# Private-device recovery: secure issuer policy (Nov 21, 2026)

## User-facing behavior
- A currently signed-in member may create one-use recovery links **only for their own member profile**, for example to add a laptop or another phone. The link is a powerful login credential. It expires after 20 minutes and can be used once.
- The **Help partner reconnect** button remains in Settings, but shares the room recovery page and instructions **without an authentication token**. The recipient enters their own private recovery key or uses another device that is still signed in.
- A room code or the partner's forwarded instructions **do not** grant account access.
- If every device has lost access **and** the member has not backed up a recovery key, this app does not currently offer an independently verified recovery path. Restoring that exact profile would require a separate identity-verification mechanism (for example verified passkeys or another user-controlled channel). Do not pretend that the room code can replace proof of ownership.
- The sender never receives, rotates, or rebinds the partner's key.
- The device-specific recovery key must be saved privately outside the browser when rotating keys or moving devices.

## Security rationale
Previously the backend allowed any member of a room to mint a high-entropy one-use login token for the other member. That could allow one partner to authenticate a new device **as the other partner**. This is an account-takeover capability regardless of the room size or whether the sender is trusted.

Now `createRejoinLink` validates untrusted input against `selfRecoveryRequestSchema`, derives the target exclusively from the currently authenticated `member_devices` row, and stores/returns a one-use capability only for that member. `linkDevice` still uses the existing atomic `consume_rejoin_link` SQL function and generates a separate key for the newly linked device. No migration needed.

## Release verification
1. Check signed-in profile A can generate a new-device link and sign in another device as **A**, not B.
2. Verify authenticated profile A's POST `createRejoinLink({forMember:"partner"})` is rejected; do not only hide the button.
3. Confirm both partner-help and self-link buttons render in Settings and that the former shares **only** the recovery page and instructions.
4. Verify the partner uses their own personal key successfully, and that a room code alone cannot authenticate.
5. Verify expired/reused/rotated self-links are rejected; device-specific recovery keys and existing sessions remain valid.
6. Test disconnected/expired anonymous sessions and iPhone Safari recovery, and check the Lovable security finding is cleared before publishing.

## Historical design notes
The earlier partner-issued one-tap login feature was intentionally changed for security. Do not restore it without recipient-held authentication or another independent identity-verification mechanism.

---
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
