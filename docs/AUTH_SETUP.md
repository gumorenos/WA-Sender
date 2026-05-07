# WA Sender - Auth Setup

## Decision

WA Sender uses Auth.js / NextAuth with Google OAuth, Prisma, and self-hosted PostgreSQL.

## Local environment

Create `.env` from `.env.example` and set:

```text
AUTH_URL=http://localhost:3000
AUTH_SECRET=<generated-secret>
AUTH_GOOGLE_ID=<google-client-id>
AUTH_GOOGLE_SECRET=<google-client-secret>
DATABASE_URL=postgresql://wa_sender:wa_sender_password@localhost:5432/wa_sender
DEFAULT_PLAN_CODE=demo
```

Generate `AUTH_SECRET` with:

```bash
openssl rand -base64 32
```

## Google OAuth

In Google Cloud Console:

1. Create or select a project.
2. Configure OAuth consent screen.
3. Create OAuth Client ID for a Web application.
4. Add authorized JavaScript origin:

```text
http://localhost:3000
```

5. Add authorized redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

For beta production, also add:

```text
https://app.tudominio.com
https://app.tudominio.com/api/auth/callback/google
```

## Database

Apply migrations:

```bash
npx prisma migrate dev
```

Regenerate Prisma Client:

```bash
npx prisma generate
```

## Ownership model

- All business records use `workspaceId`.
- The backend derives `userId` from the Auth.js session.
- The backend derives `workspaceId` from workspace membership.
- Frontend requests must not send `userId` as authority.

