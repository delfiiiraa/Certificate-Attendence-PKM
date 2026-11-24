# Security Specification & Payload-First Security TDD

## 1. Data Invariants

1. **Zero-Trust Default Deny**: Every document path not explicitly matched is denied for all reads and writes.
2. **PII Isolation (Split Collection Strategy)**:
   - Private participant PII (`email`, `phoneNumber`, `gpsLat`, `gpsLng`, `photoThumbnail`) exists exclusively inside `/events/{eventId}/registrations/{registrationId}` and `/events/{eventId}/emailLogs/{logId}`.
   - Public certificate verification reads exclusively from `/certificates/{claimCode}`, which contains ZERO PII and forbids `list` scraping by non-admins.
3. **Master Gate & Relational Integrity**:
   - A registration or email log CANNOT be created unless its parent `/events/{eventId}` exists (`exists()`).
   - Non-admin participants can ONLY submit check-ins to events whose status is `'active'`.
4. **Immutable Ownership & Temporal Integrity**:
   - `createdAt`, `eventId`, `ownerId`/`userId` are strictly immutable after creation.
   - All server timestamps (`createdAt`, `updatedAt`, `issuedAt`) MUST equal `request.time`.
5. **Terminal State Locking**:
   - Once an event transitions to `status == 'completed'`, non-admins cannot mutate it and participants cannot check in; only verified admins can perform administrative corrections.
6. **Verified Identity & Anti-Spoofing**:
   - All write operations require `request.auth != null && request.auth.token.email_verified == true`.
   - Bootstrapped admin (`delfikarnain@gmail.com`) MUST ALSO pass `request.auth.token.email_verified == true`.
   - Non-admins can never self-assign admin privileges in `/admins/{uid}`.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Target Path | Adversarial Payload / Action | Expected Result |
|---|---------------|-------------|------------------------------|-----------------|
| 1 | Self-Admin Escalation | `/admins/attackerUid` | Non-admin creates own admin doc with `uid: attackerUid` | `PERMISSION_DENIED` |
| 2 | Unverified Email Admin Spoof | `/events/evt-1` | Caller with `email: 'delfikarnain@gmail.com'`, `email_verified: false` creates event | `PERMISSION_DENIED` |
| 3 | Shadow Field Injection | `/events/evt-1/registrations/reg-1` | Valid registration + ghost key `isAdmin: true` | `PERMISSION_DENIED` |
| 4 | PII Blanket Scrape (Get) | `/events/evt-1/registrations/victim-reg` | Authenticated non-owner calls `get()` on another attendee's registration | `PERMISSION_DENIED` |
| 5 | PII Collection Scrape (List) | `/events/evt-1/registrations` | Authenticated non-admin executes unfiltered `list()` query | `PERMISSION_DENIED` |
| 6 | Identity Spoofing | `/events/evt-1/registrations/reg-2` | User A creates registration with `userId: 'user-b'` | `PERMISSION_DENIED` |
| 7 | Orphaned Registration Write | `/events/nonexistent-evt/registrations/reg-1` | Authenticated user submits check-in to nonexistent event | `PERMISSION_DENIED` |
| 8 | Check-In to Completed Event | `/events/completed-evt/registrations/reg-9` | Non-admin submits check-in after event `status == 'completed'` | `PERMISSION_DENIED` |
| 9 | Path Variable ID Poisoning | `/certificates/invalid$$$id_with_1500_chars` | Oversized / invalid regex document ID on create/get | `PERMISSION_DENIED` |
| 10 | Client Timestamp Forgery | `/events/evt-1/registrations/reg-3` | Registration payload with backdated `createdAt` (`!= request.time`) | `PERMISSION_DENIED` |
| 11 | Value Poisoning on Update | `/events/evt-1/registrations/reg-1` | Update whitelisted field `fullName` to boolean `true` or 500-char string | `PERMISSION_DENIED` |
| 12 | Certificate List Enumeration | `/certificates` | Unauthenticated or non-owner runs `list()` across all issued certificates | `PERMISSION_DENIED` |
