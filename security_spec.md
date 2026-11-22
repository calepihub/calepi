# Security Specification — KITNET PRO STUDIO (Firestore)

## 1. Data Invariants
1. Every document in `/users/{userId}` belongs strictly to the authenticated verified user whose `request.auth.uid == userId`.
2. Every document in `/projects/{projectId}` MUST have `ownerId == request.auth.uid`, valid alphanumeric/hyphen/underscore `id`, bounded string fields, bounded arrays (`floors <= 20`, `unitTypes <= 30`, `urbanRules <= 40`, `professionals <= 20`, `budgetEntries <= 250`, `structuralElements <= 600`, `revisions <= 100`), optional `implantation` map, and server-enforced timestamps (`createdAt == request.time` on create, `updatedAt == request.time` on create/update, `createdAt` immutable on update, `ownerId` immutable on update). Single-document `get` safely handles non-existent documents (`resource == null`) so create-existence probes do not trigger NullPointer PERMISSION_DENIED.
3. List queries on `/projects` MUST enforce `resource.data.ownerId == request.auth.uid`.
4. Every subcollection document `/projects/{projectId}/renders/{renderId}` MUST inherit ownership via `get(/databases/$(database)/documents/projects/$(projectId)).data.ownerId == request.auth.uid` and `data.projectId == projectId`, with `dataUrl.size() <= 750000`.
5. No user may read, list, create, update, or delete another user's profile, projects, or renders.

## 2. The "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated read on `/projects/proj-1`**: `auth = null` -> DENIED.
2. **Unverified email write on `/projects/proj-1`**: `auth.token.email_verified = false` -> DENIED.
3. **Identity spoofing on create `/projects/proj-2`**: `ownerId = "other-uid"` -> DENIED.
4. **Shadow/Ghost field injection on create `/projects/proj-1`**: extra key `"isAdmin": true` -> DENIED (`hasOnly`).
5. **Shadow/Ghost field injection on update `/projects/proj-1`**: extra key `"isVerified": true` -> DENIED (`affectedKeys().hasOnly(...)`).
6. **Owner hijack on update `/projects/proj-1`**: changing `ownerId` to attacker UID -> DENIED.
7. **Client timestamp forgery on create `/projects/proj-1`**: `createdAt` != `request.time` -> DENIED.
8. **Immutable `createdAt` tampering on update `/projects/proj-1`**: modifying `createdAt` -> DENIED.
9. **ID poisoning / oversized path variable**: `/projects/${'a'.repeat(300)}` -> DENIED (`isValidId`).
10. **Blanket list query without owner constraint**: `/users` list -> DENIED.
11. **Cross-tenant render write `/projects/victim-proj/renders/r1`**: parent project owned by victim -> DENIED (`get()` Master Gate).
12. **Type/size poisoning**: `name = 12345` or `name` > 160 chars or `status = "invalid"` -> DENIED (`isValidProject`).
