# Private device recovery — current behavior (Nov 21, 2026)

## Two distinct recovery flows

### 1. Add one of my devices (one-time login link)
- A member who is **currently signed in** may issue a one-time link for **their own profile only**.
- The token has 256 bits of randomness, lives in the URL fragment, expires in 20 minutes, and is consumed atomically once by `consume_rejoin_link`.
- The server determines the member from the authenticated `member_devices` row. No request argument can select another member.
- A new device is linked to that profile and gets its own device-specific recovery key.
- Keep this link private. Anyone possessing a valid unexpired link could sign in as the issuing member.

### 2. Help partner reconnect (instructions, no login token)
- A signed-in partner can share the room recovery page and instructions, but cannot generate a login credential for the other member.
- The recipient enters their **own** 64-character personal recovery key or uses another device that still has access.
- A room code, a recovery-page URL, or an invitation to an already full room is **not** proof of identity.
- If **all** devices and **all** saved recovery keys are lost, the old profile cannot currently be recovered safely. This requires an independently verified identity channel to solve, not weakening the partner's access boundary.

### Why partner-issued one-tap recovery was retired
The earlier backend allowed an authenticated room member to create a one-time sign-in credential for the other member. That is an account-takeover path, even in a small trusted room. `createRejoinLink` is now enforced as **self-only** on the server using `selfRecoveryRequestSchema`, and the partner-help button supplies instructions instead of credentials.

Existing sessions, legacy personal keys, and saved meal data remain intact. There is **no database migration** needed for this code change.

## Deployment dependency
The earlier `0013_device_recovery_keys.sql` and `0022_atomic_rejoin.sql` migrations must be present in the live Supabase database as before. This update does not replace or rerun those migrations.

## Release verification
1. Member A issues a self link and uses it to add another device as A. It must not link as B.
2. A direct server request to `createRejoinLink` with `{forMember:"partner"}` must be rejected, even if made by an authenticated room member.
3. Member A's partner-help button shares only the recovery URL and key instructions, never a login token.
4. Member B's own recovery key restores B; A's key must not restore B.
5. A room code alone must not authenticate. Expired/redeemed self-links fail. Separate keys and existing device sessions survive.
6. Test lost anonymous sessions on iPhone Safari and another browser.
7. Re-run the Lovable security scan and confirm the account-takeover blocker is cleared **before publishing**.

## Additional considerations
Do not send recovery secrets through public messages or diagnostic logs. Never claim that an unverified room code alone can recover a deleted browser session. Future one-tap partner assistance must use a recipient-controlled consent or verified recovery factor.
