# Vercel → Supabase + GitHub Pages Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully migrate aand-compliance off Vercel — database to Supabase Postgres, storage to Supabase Storage, auth to Supabase Auth, API to Supabase Edge Functions, and frontend to GitHub Pages with GitHub Actions CI/CD.

**Architecture:** GitHub Pages hosts the static Vite SPA; Supabase Edge Functions host tRPC + Stripe webhook API at `https://<project>.supabase.co/functions/v1/`; Supabase Postgres replaces Neon (Drizzle ORM unchanged); Supabase Storage replaces Vercel Blob. Auth is Supabase Auth (email/password) with a database trigger to sync `auth.users` → `public.users` and admin role detection in an Edge Function signup hook.

**Tech Stack:** Supabase (Postgres, Auth, Storage, Edge Functions), Deno runtime, @supabase/supabase-js v2, drizzle-orm + postgres.js, GitHub Actions, GitHub Pages, Vite, React, tRPC v11, Stripe, Resend, OpenAI.

---

## File Map

### Created
| File | Purpose |
|------|---------|
| `supabase.env` | Local secrets template (never committed) |
| `supabase/config.toml` | Supabase project config |
| `supabase/migrations/0001_init_schema.sql` | Full schema for Supabase (from Drizzle schema, users.id = uuid) |
| `supabase/migrations/0002_auth_trigger.sql` | Trigger: auth.users → public.users on signup |
| `supabase/functions/_shared/env.ts` | Typed env accessor for Edge Functions |
| `supabase/functions/_shared/supabase.ts` | Supabase admin + anon client factory |
| `supabase/functions/_shared/db.ts` | Drizzle client for Edge Functions (postgres.js) |
| `supabase/functions/_shared/storage.ts` | Supabase Storage upload/get helpers |
| `supabase/functions/_shared/context.ts` | tRPC context (Supabase Auth JWT verification) |
| `supabase/functions/_shared/cors.ts` | CORS headers for cross-origin GitHub Pages requests |
| `supabase/functions/trpc/index.ts` | tRPC Edge Function (fetch adapter) |
| `supabase/functions/stripe-webhook/index.ts` | Stripe webhook Edge Function |
| `supabase/functions/handle-signup/index.ts` | Auth hook: detects admin email, sets role metadata |
| `.github/workflows/deploy-frontend.yml` | Build Vite SPA → deploy to GitHub Pages |
| `.github/workflows/deploy-functions.yml` | Deploy Supabase Edge Functions on push to main |

### Modified
| File | Change |
|------|--------|
| `drizzle/schema.ts` | `users.id` → `uuid` (from serial); `dealerships/complianceAnswers/subscriptions/generatedDocuments` FK → uuid |
| `server/storage.ts` | Replace `@vercel/blob` with `@supabase/storage-js` |
| `server/_core/env.ts` | Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` |
| `client/src/lib/trpc.ts` | Update `httpBatchLink` URL to `VITE_API_URL`; add Authorization header from Supabase session |
| `client/src/hooks/useAuth.ts` (or equivalent) | Remove tRPC auth.me dependency; use `supabase.auth.getSession()` |
| `client/src/lib/supabase.ts` | New: browser Supabase client singleton |
| `package.json` | Add `@supabase/supabase-js`, `@supabase/storage-js`, `postgres`; remove `@vercel/blob`, `@neondatabase/serverless` |
| `vite.config.ts` | Add `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` env exposure |
| `drizzle.config.ts` | Update `connectionString` to `SUPABASE_DB_URL` |

---

## Task 1: Create `supabase.env` Template

**Files:**
- Create: `supabase.env`
- Create: `.gitignore` entry for `supabase.env`

- [ ] **Step 1: Write supabase.env**

```bash
# supabase.env — copy to .env, fill in real values, NEVER commit
# ──────────────────────────────────────────────────────────────
# Supabase project (Settings → API)
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_PROJECT_REF=YOUR_PROJECT_REF

# Supabase Postgres (Settings → Database → Connection string → URI, use "Transaction" pooler)
SUPABASE_DB_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# Auth
ADMIN_EMAIL=admin@yourdomain.com

# JWT secret — must match the one in Supabase Dashboard (Settings → Auth → JWT Secret)
# This is only needed if you verify JWTs manually; Supabase Edge Functions can use supabase.auth.getUser()
JWT_SECRET=your-supabase-jwt-secret-from-dashboard

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CORE_PRICE_ID=price_...
STRIPE_MANAGED_PRICE_ID=price_...

# Email (Resend)
RESEND_API_KEY=re_...

# OpenAI
OPENAI_API_KEY=sk-...

# Frontend (set these at build time in GitHub Actions)
VITE_APP_URL=https://andrewibrah.github.io/aand-compliance
VITE_API_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- [ ] **Step 2: Add supabase.env to .gitignore**

Open `.gitignore`, add at the bottom:
```
supabase.env
```

- [ ] **Step 3: Copy to .env for local use**

```bash
cp supabase.env .env
# Then fill in real values from Supabase dashboard
```

---

## Task 2: Update `package.json` Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove Vercel-specific packages and add Supabase packages**

```bash
pnpm remove @vercel/blob @vercel/node @neondatabase/serverless
pnpm add @supabase/supabase-js @supabase/storage-js postgres
pnpm add -D supabase
```

- [ ] **Step 2: Add Supabase CLI scripts to package.json**

In `package.json` scripts section, add:
```json
"supabase:start": "supabase start",
"supabase:deploy": "supabase functions deploy --project-ref $SUPABASE_PROJECT_REF",
"db:push": "drizzle-kit generate && drizzle-kit migrate"
```

(The existing `db:push` script already uses drizzle-kit — just ensure the connection string env var is updated in Task 3.)

- [ ] **Step 3: Verify no remaining @vercel imports**

```bash
grep -r "@vercel" --include="*.ts" --include="*.tsx" . --exclude-dir=node_modules
```

Expected: no output (all `@vercel/*` imports removed).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore supabase.env
git commit -m "chore: replace vercel deps with supabase, add supabase.env template"
```

---

## Task 3: Update Drizzle Schema — `users.id` → UUID

**Files:**
- Modify: `drizzle/schema.ts`

- [ ] **Step 1: Write the updated schema**

Open `drizzle/schema.ts`. Replace the entire file content:

```typescript
import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, unique,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['user', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),  // matches auth.users.id
  name: text('name').notNull().default(''),
  email: varchar('email', { length: 320 }).notNull().unique(),
  role: roleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastSignedIn: timestamp('last_signed_in'),
});

export const dealerships = pgTable('dealerships', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull().default(''),
  address: text('address').notNull().default(''),
  city: text('city').notNull().default(''),
  state: varchar('state', { length: 2 }).notNull().default(''),
  dmsVendor: varchar('dms_vendor', { length: 64 }).notNull().default(''),
  rooftopCount: integer('rooftop_count').notNull().default(1),
  qualifiedIndividual: text('qualified_individual').notNull().default(''),
  qiEmail: varchar('qi_email', { length: 320 }).notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const complianceAnswers = pgTable(
  'compliance_answers',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
    section: integer('section').notNull(),
    sectionName: text('section_name').notNull().default(''),
    answers: jsonb('answers').notNull().default({}),
    score: integer('score').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.dealershipId, t.section)]
);

export const subscriptions = pgTable('subscriptions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: varchar('plan', { length: 64 }).notNull().default('free'),
  status: varchar('status', { length: 64 }).notNull().default('active'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const generatedDocuments = pgTable('generated_documents', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  docType: varchar('doc_type', { length: 64 }).notNull(),
  version: integer('version').notNull().default(1),
  storagePath: text('storage_path'),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Dealership = typeof dealerships.$inferSelect;
export type ComplianceAnswer = typeof complianceAnswers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
```

Note: `passwordHash` column is removed — passwords are now managed by Supabase Auth. `users.id` is `uuid` matching `auth.users.id`.

- [ ] **Step 2: Update drizzle.config.ts to use SUPABASE_DB_URL**

Open `drizzle.config.ts`, update the connection string env var:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '',
  },
});
```

- [ ] **Step 3: Commit schema changes**

```bash
git add drizzle/schema.ts drizzle.config.ts
git commit -m "feat: update schema - users.id uuid for supabase auth, remove passwordHash"
```

---

## Task 4: Supabase SQL Migrations

**Files:**
- Create: `supabase/migrations/0001_init_schema.sql`
- Create: `supabase/migrations/0002_auth_trigger.sql`

- [ ] **Step 1: Create the init schema migration**

Create `supabase/migrations/0001_init_schema.sql`:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Role enum
CREATE TYPE role AS ENUM ('user', 'admin');

-- Users (id = auth.users.id UUID)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email VARCHAR(320) NOT NULL UNIQUE,
  role role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_signed_in TIMESTAMPTZ
);

-- Dealerships
CREATE TABLE IF NOT EXISTS public.dealerships (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state VARCHAR(2) NOT NULL DEFAULT '',
  dms_vendor VARCHAR(64) NOT NULL DEFAULT '',
  rooftop_count INTEGER NOT NULL DEFAULT 1,
  qualified_individual TEXT NOT NULL DEFAULT '',
  qi_email VARCHAR(320) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compliance answers
CREATE TABLE IF NOT EXISTS public.compliance_answers (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dealership_id INTEGER NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  section INTEGER NOT NULL,
  section_name TEXT NOT NULL DEFAULT '',
  answers JSONB NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dealership_id, section)
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dealership_id INTEGER NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan VARCHAR(64) NOT NULL DEFAULT 'free',
  status VARCHAR(64) NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated documents
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dealership_id INTEGER NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  doc_type VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  storage_path TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Enable for all tables (Edge Functions use service role key, bypasses RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Create the auth trigger migration**

Create `supabase/migrations/0002_auth_trigger.sql`:

```sql
-- Trigger: on new Supabase Auth signup, create record in public.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    -- role is set via handle-signup Edge Function hook, default 'user' here
    COALESCE((NEW.raw_user_meta_data->>'role')::role, 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
```

- [ ] **Step 3: Commit migrations**

```bash
git add supabase/migrations/
git commit -m "feat: add supabase sql migrations for schema and auth trigger"
```

---

## Task 5: Create Supabase `config.toml`

**Files:**
- Create: `supabase/config.toml`

- [ ] **Step 1: Write config.toml**

```toml
# supabase/config.toml
[project]
id = "YOUR_PROJECT_REF"

[api]
enabled = true
port = 54321

[db]
port = 54322
shadow_port = 54320
major_version = 15

[studio]
enabled = true
port = 54323

[inbucket]
enabled = true
port = 54324

[storage]
enabled = true

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = [
  "https://andrewibrah.github.io/aand-compliance",
  "https://andrewibrah.github.io"
]
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = false
enable_confirmations = false

[functions.trpc]
verify_jwt = false

[functions.stripe-webhook]
verify_jwt = false

[functions.handle-signup]
verify_jwt = false
```

- [ ] **Step 2: Initialize Supabase in the project**

```bash
npx supabase init --with-vscode-workspace
```

If `supabase/config.toml` already exists from the above step, skip this.

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml
git commit -m "chore: add supabase config.toml"
```

---

## Task 6: Edge Functions — Shared Utilities

**Files:**
- Create: `supabase/functions/_shared/env.ts`
- Create: `supabase/functions/_shared/supabase.ts`
- Create: `supabase/functions/_shared/db.ts`
- Create: `supabase/functions/_shared/cors.ts`

- [ ] **Step 1: Write env.ts**

```typescript
// supabase/functions/_shared/env.ts
export const ENV = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  supabaseServiceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  supabaseDbUrl: Deno.env.get('SUPABASE_DB_URL') ?? '',
  adminEmail: Deno.env.get('ADMIN_EMAIL') ?? '',
  stripeSecretKey: Deno.env.get('STRIPE_SECRET_KEY') ?? '',
  stripeWebhookSecret: Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
  stripeCorePrice: Deno.env.get('STRIPE_CORE_PRICE_ID') ?? '',
  stripeManagedPrice: Deno.env.get('STRIPE_MANAGED_PRICE_ID') ?? '',
  resendApiKey: Deno.env.get('RESEND_API_KEY') ?? '',
  openaiApiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
  appUrl: Deno.env.get('VITE_APP_URL') ?? 'https://andrewibrah.github.io/aand-compliance',
};
```

- [ ] **Step 2: Write supabase.ts**

```typescript
// supabase/functions/_shared/supabase.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ENV } from './env.ts';

// Service role client — bypasses RLS, use only in Edge Functions (never exposed to browser)
export function createServiceClient() {
  return createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}

// Verify a user JWT from the Authorization header
export async function getUserFromToken(token: string) {
  const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}
```

- [ ] **Step 3: Write db.ts**

```typescript
// supabase/functions/_shared/db.ts
import { drizzle } from 'npm:drizzle-orm/postgres-js';
import postgres from 'npm:postgres';
import { ENV } from './env.ts';
import * as schema from '../../../drizzle/schema.ts';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const client = postgres(ENV.supabaseDbUrl, { prepare: false });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export * from '../../../server/db.ts';
```

Wait — `server/db.ts` uses `@neondatabase/serverless`. We need to update `server/db.ts` first (Task 7), then import from there. Revise `db.ts` to NOT re-export from server/db.ts:

```typescript
// supabase/functions/_shared/db.ts
// Self-contained DB module for Edge Functions (Deno runtime)
import { drizzle } from 'npm:drizzle-orm/postgres-js';
import postgres from 'npm:postgres';
import { eq, and } from 'npm:drizzle-orm';
import { ENV } from './env.ts';
import {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments,
  type User, type Dealership, type ComplianceAnswer, type Subscription, type GeneratedDocument,
} from '../../../drizzle/schema.ts';

function getDb() {
  const client = postgres(ENV.supabaseDbUrl, { prepare: false });
  return drizzle(client, { schema: { users, dealerships, complianceAnswers, subscriptions, generatedDocuments } });
}

// Users
export async function getUserById(id: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user ?? null;
}

export async function updateUserLastSignedIn(id: string) {
  const db = getDb();
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// Dealerships
export async function getDealershipByUserId(userId: string) {
  const db = getDb();
  const [d] = await db.select().from(dealerships).where(eq(dealerships.userId, userId));
  return d ?? null;
}

export async function createDealership(data: Omit<typeof dealerships.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getDb();
  const [d] = await db.insert(dealerships).values(data).returning();
  return d;
}

export async function updateDealership(id: number, data: Partial<Omit<typeof dealerships.$inferInsert, 'id'>>) {
  const db = getDb();
  const [d] = await db.update(dealerships).set({ ...data, updatedAt: new Date() }).where(eq(dealerships.id, id)).returning();
  return d;
}

// Compliance
export async function saveComplianceAnswer(data: Omit<typeof complianceAnswers.$inferInsert, 'id'>) {
  const db = getDb();
  const [row] = await db
    .insert(complianceAnswers)
    .values(data)
    .onConflictDoUpdate({
      target: [complianceAnswers.dealershipId, complianceAnswers.section],
      set: { answers: data.answers, score: data.score, completed: data.completed, completedAt: data.completedAt, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function getComplianceAnswers(dealershipId: number) {
  const db = getDb();
  return db.select().from(complianceAnswers).where(eq(complianceAnswers.dealershipId, dealershipId));
}

export async function getAllComplianceAnswers(dealershipId: number) {
  return getComplianceAnswers(dealershipId);
}

// Subscriptions
export async function getSubscription(dealershipId: number) {
  const db = getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.dealershipId, dealershipId));
  return sub ?? null;
}

export async function createSubscription(data: Omit<typeof subscriptions.$inferInsert, 'id' | 'createdAt'>) {
  const db = getDb();
  const [sub] = await db.insert(subscriptions).values(data).returning();
  return sub;
}

export async function updateSubscription(id: number, data: Partial<Omit<typeof subscriptions.$inferInsert, 'id'>>) {
  const db = getDb();
  const [sub] = await db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning();
  return sub;
}

// Documents
export async function saveGeneratedDocument(data: Omit<typeof generatedDocuments.$inferInsert, 'id' | 'generatedAt'>) {
  const db = getDb();
  const [doc] = await db.insert(generatedDocuments).values(data).returning();
  return doc;
}

export async function getGeneratedDocuments(dealershipId: number) {
  const db = getDb();
  return db.select().from(generatedDocuments).where(eq(generatedDocuments.dealershipId, dealershipId));
}

export type { User, Dealership, ComplianceAnswer, Subscription, GeneratedDocument };
```

- [ ] **Step 4: Write cors.ts**

```typescript
// supabase/functions/_shared/cors.ts
const ALLOWED_ORIGINS = [
  'https://andrewibrah.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
];

export function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('Origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-trpc-source',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  return null;
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/
git commit -m "feat: add supabase edge function shared utilities (env, db, supabase client, cors)"
```

---

## Task 7: Update `server/db.ts` for Supabase Postgres

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Replace @neondatabase/serverless with postgres.js**

Open `server/db.ts`. Replace the entire file:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments,
  type User, type Dealership, type ComplianceAnswer, type Subscription, type GeneratedDocument,
} from '../drizzle/schema';

function getDb() {
  const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '';
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema: { users, dealerships, complianceAnswers, subscriptions, generatedDocuments } });
}

// Users
export async function getUserById(id: string) {
  const [user] = await getDb().select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function getUserByEmail(email: string) {
  const [user] = await getDb().select().from(users).where(eq(users.email, email));
  return user ?? null;
}

export async function createUser(data: Omit<typeof users.$inferInsert, 'createdAt' | 'updatedAt'>) {
  const [user] = await getDb().insert(users).values(data).returning();
  return user;
}

export async function updateUserLastSignedIn(id: string) {
  await getDb().update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// Dealerships
export async function getDealershipByUserId(userId: string) {
  const [d] = await getDb().select().from(dealerships).where(eq(dealerships.userId, userId));
  return d ?? null;
}

export async function createDealership(data: Omit<typeof dealerships.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>) {
  const [d] = await getDb().insert(dealerships).values(data).returning();
  return d;
}

export async function updateDealership(id: number, data: Partial<Omit<typeof dealerships.$inferInsert, 'id'>>) {
  const [d] = await getDb().update(dealerships).set({ ...data, updatedAt: new Date() }).where(eq(dealerships.id, id)).returning();
  return d;
}

// Compliance
export async function saveComplianceAnswer(data: Omit<typeof complianceAnswers.$inferInsert, 'id'>) {
  const [row] = await getDb()
    .insert(complianceAnswers)
    .values(data)
    .onConflictDoUpdate({
      target: [complianceAnswers.dealershipId, complianceAnswers.section],
      set: { answers: data.answers, score: data.score, completed: data.completed, completedAt: data.completedAt, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function getComplianceAnswers(dealershipId: number) {
  return getDb().select().from(complianceAnswers).where(eq(complianceAnswers.dealershipId, dealershipId));
}

export async function getAllComplianceAnswers(dealershipId: number) {
  return getComplianceAnswers(dealershipId);
}

// Subscriptions
export async function getSubscription(dealershipId: number) {
  const [sub] = await getDb().select().from(subscriptions).where(eq(subscriptions.dealershipId, dealershipId));
  return sub ?? null;
}

export async function createSubscription(data: Omit<typeof subscriptions.$inferInsert, 'id' | 'createdAt'>) {
  const [sub] = await getDb().insert(subscriptions).values(data).returning();
  return sub;
}

export async function updateSubscription(id: number, data: Partial<Omit<typeof subscriptions.$inferInsert, 'id'>>) {
  const [sub] = await getDb().update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning();
  return sub;
}

// Documents
export async function saveGeneratedDocument(data: Omit<typeof generatedDocuments.$inferInsert, 'id' | 'generatedAt'>) {
  const [doc] = await getDb().insert(generatedDocuments).values(data).returning();
  return doc;
}

export async function getGeneratedDocuments(dealershipId: number) {
  return getDb().select().from(generatedDocuments).where(eq(generatedDocuments.dealershipId, dealershipId));
}

export type { User, Dealership, ComplianceAnswer, Subscription, GeneratedDocument };
```

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm check
```

Expected: No errors related to db.ts. Fix any type errors found (likely User.id type changed from number to string).

- [ ] **Step 3: Update any server-side code using User.id as number**

Search for numeric user ID usage:
```bash
grep -r "user\.id" server/ --include="*.ts" -n
grep -r "userId:" server/ --include="*.ts" -n
```

In `server/routers.ts` and sub-routers, `ctx.user.id` was `number`, now it is `string` (UUID). Update any comparisons like `dealership.userId === ctx.user.id` to use string comparison. These should already work since `===` works for strings, but verify no `.toString()` calls are needed.

- [ ] **Step 4: Commit**

```bash
git add server/db.ts
git commit -m "feat: update server/db.ts - replace neon with postgres.js, user.id as uuid"
```

---

## Task 8: Update `server/storage.ts` — Vercel Blob → Supabase Storage

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Replace @vercel/blob with @supabase/storage-js**

Open `server/storage.ts`. Replace the entire file:

```typescript
import { StorageClient } from '@supabase/storage-js';

const BUCKET = 'documents';

function getStorageClient() {
  const url = `${process.env.SUPABASE_URL}/storage/v1`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return new StorageClient(url, {
    apikey: key,
    Authorization: `Bearer ${key}`,
  });
}

export async function storagePut(
  fileName: string,
  data: Buffer | Uint8Array,
  contentType = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  const storage = getStorageClient();
  const { data: result, error } = await storage
    .from(BUCKET)
    .upload(fileName, data, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: publicUrl } = storage.from(BUCKET).getPublicUrl(fileName);
  return { key: fileName, url: publicUrl.publicUrl };
}

export async function storageGet(key: string): Promise<{ key: string; url: string }> {
  const storage = getStorageClient();
  const { data } = storage.from(BUCKET).getPublicUrl(key);
  return { key, url: data.publicUrl };
}
```

- [ ] **Step 2: Create the Supabase Storage bucket**

In the Supabase dashboard → Storage → New bucket:
- Name: `documents`
- Public: `true` (or `false` if you want private access with signed URLs)
- File size limit: 50 MB

If you want private PDFs, update `storagePut` to use private bucket and `storageGet` to generate a signed URL:
```typescript
// For private bucket, replace storageGet with:
export async function storageGet(key: string): Promise<{ key: string; url: string }> {
  const storage = getStorageClient();
  const { data, error } = await storage.from(BUCKET).createSignedUrl(key, 3600); // 1hr TTL
  if (error || !data) throw new Error('Could not generate signed URL');
  return { key, url: data.signedUrl };
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
pnpm check
```

Expected: No errors in storage.ts.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat: replace vercel blob with supabase storage"
```

---

## Task 9: Update `server/_core/context.ts` for Supabase Auth

**Files:**
- Modify: `server/_core/context.ts`
- Modify: `server/_core/env.ts`

- [ ] **Step 1: Add Supabase env vars to env.ts**

Open `server/_core/env.ts`. Add Supabase vars to the exported ENV object:

```typescript
export const ENV = {
  // existing vars ...
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseDbUrl: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '',
  // keep existing vars below
};
```

- [ ] **Step 2: Update context.ts to verify Supabase JWT**

Open `server/_core/context.ts`. Replace the content:

```typescript
import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import * as db from '../db';
import { ENV } from './env';
import type { User } from '../../drizzle/schema';

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
};

async function getUserFromRequest(req: Request): Promise<User | null> {
  try {
    const authHeader = req.headers['authorization'] ?? req.headers['Authorization'] as string;
    const token = authHeader?.split(' ')[1];
    if (!token) return null;

    const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
    if (error || !authUser) return null;

    const user = await db.getUserById(authUser.id);
    if (user) {
      await db.updateUserLastSignedIn(user.id);
    }
    return user;
  } catch {
    return null;
  }
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<TrpcContext> {
  const user = await getUserFromRequest(req);
  return { req, res, user };
}
```

- [ ] **Step 3: Update server/routers.ts — remove auth login/signup tRPC routes, update auth.me and auth.logout**

Open `server/routers.ts`. Find the `auth` router section. Update it:

```typescript
// auth router — login/signup are handled by Supabase Auth client directly on frontend
const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  logout: publicProcedure.mutation(({ ctx }) => {
    // Session is managed by Supabase client on the frontend
    // This is a no-op server-side; client calls supabase.auth.signOut()
    return { success: true };
  }),
});
```

- [ ] **Step 4: Remove api/auth/login.ts and api/auth/signup.ts**

These are no longer needed — Supabase Auth handles login/signup directly from the frontend SDK.

```bash
rm api/auth/login.ts api/auth/signup.ts
```

Update `scripts/build.mjs` to remove the auth function bundling entries for login/signup.

- [ ] **Step 5: Run TypeScript check**

```bash
pnpm check
```

Expected: No type errors. Fix any `user.id` type mismatches (string vs number).

- [ ] **Step 6: Commit**

```bash
git add server/_core/context.ts server/_core/env.ts server/routers.ts
git rm api/auth/login.ts api/auth/signup.ts
git commit -m "feat: update tRPC context to verify Supabase Auth JWT, remove custom auth endpoints"
```

---

## Task 10: Update Frontend Auth — Supabase Client + tRPC Auth Header

**Files:**
- Create: `client/src/lib/supabase.ts`
- Modify: `client/src/lib/trpc.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Create Supabase browser client**

Create `client/src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Update vite.config.ts to expose VITE env vars**

Open `vite.config.ts`. Ensure these env vars are accessible (Vite automatically exposes any `VITE_` prefixed vars from `.env`). No code change needed for Vite env — just confirm `.env` has:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1
VITE_APP_URL=https://andrewibrah.github.io/aand-compliance
```

If `vite.config.ts` has a manually defined `define` block that whitelists env vars, add the new keys there. Otherwise no change needed.

- [ ] **Step 3: Update tRPC client to use Supabase JWT**

Open `client/src/lib/trpc.ts`. Update `httpBatchLink` to:
1. Use `VITE_API_URL` as the base URL
2. Attach the Supabase session token as Authorization header

```typescript
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import { supabase } from './supabase';
import type { AppRouter } from '../../../server/routers';

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${import.meta.env.VITE_API_URL}/trpc`,
        async headers() {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) return {};
          return { Authorization: `Bearer ${session.access_token}` };
        },
      }),
    ],
  });
}
```

- [ ] **Step 4: Update `useAuth` hook to use Supabase Auth**

Find the `useAuth` hook (likely `client/src/hooks/useAuth.ts` or defined inline in a component). Replace tRPC-based auth state with Supabase:

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { trpc } from '../lib/trpc';

export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const user = trpc.auth.me.useQuery(undefined, { enabled: !!session });

  return {
    user: user.data ?? null,
    session,
    isLoading: loading || user.isLoading,
    isAuthenticated: !!session,
  };
}
```

- [ ] **Step 5: Update login/signup UI components to use Supabase Auth**

Find login/signup forms (search `client/src/` for forms that call `api/auth/login` or `auth.login` tRPC). Replace with Supabase calls:

```typescript
// Login
const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) setError(error.message);

// Signup
const { error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { name } },
});
if (error) setError(error.message);

// Logout
await supabase.auth.signOut();
```

- [ ] **Step 6: Run TypeScript check**

```bash
pnpm check
```

Expected: No errors. Fix any type errors in the auth components.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/supabase.ts client/src/lib/trpc.ts client/src/ vite.config.ts
git commit -m "feat: switch frontend to supabase auth, update trpc client with bearer token"
```

---

## Task 11: Supabase Edge Function — tRPC

**Files:**
- Create: `supabase/functions/trpc/index.ts`

- [ ] **Step 1: Write the tRPC Edge Function**

Create `supabase/functions/trpc/index.ts`:

```typescript
import { fetchRequestHandler } from 'npm:@trpc/server/adapters/fetch';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { ENV } from '../_shared/env.ts';
import { getUserFromToken } from '../_shared/supabase.ts';
import * as db from '../_shared/db.ts';

// Import all routers — these are adapted copies of server/routers.ts for Deno
// They use _shared/db.ts instead of server/db.ts
import { appRouter } from '../_shared/routers.ts';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const response = await fetchRequestHandler({
    endpoint: '/functions/v1/trpc',
    req,
    router: appRouter,
    createContext: async () => {
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.split(' ')[1];
      const authUser = token ? await getUserFromToken(token) : null;
      const user = authUser ? await db.getUserById(authUser.id) : null;
      return { user };
    },
    onError: ({ error }) => {
      console.error('tRPC error:', error);
    },
  });

  // Add CORS headers to response
  const corsHeaders = getCorsHeaders(req);
  const newResponse = new Response(response.body, response);
  Object.entries(corsHeaders).forEach(([k, v]) => newResponse.headers.set(k, v));
  return newResponse;
});
```

- [ ] **Step 2: Create `supabase/functions/_shared/routers.ts`**

This file adapts `server/routers.ts` for Deno. It imports from `_shared/db.ts` instead of `../../server/db.ts`, and uses Deno-compatible imports.

Create `supabase/functions/_shared/routers.ts`:

```typescript
// Adapted tRPC router for Supabase Edge Functions (Deno runtime)
// Mirrors server/routers.ts but uses _shared/db.ts for database access

import { initTRPC, TRPCError } from 'npm:@trpc/server';
import { z } from 'npm:zod';
import * as db from './db.ts';
import { storagePut, storageGet } from './storage.ts';
import { ENV } from './env.ts';
import type { User } from '../../../drizzle/schema.ts';

type Context = { user: User | null };

const t = initTRPC.context<Context>().create();
const router = t.router;
const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please login (10001)' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have required permission (10002)' });
  return next({ ctx });
});

const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  logout: publicProcedure.mutation(() => ({ success: true })),
});

const dealershipRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    return db.getDealershipByUserId(ctx.user.id);
  }),
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      address: z.string(),
      city: z.string(),
      state: z.string().length(2),
      dmsVendor: z.string(),
      rooftopCount: z.number().int().min(1),
      qualifiedIndividual: z.string(),
      qiEmail: z.string().email(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.createDealership({ userId: ctx.user.id, ...input });
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      dmsVendor: z.string().optional(),
      rooftopCount: z.number().int().min(1).optional(),
      qualifiedIndividual: z.string().optional(),
      qiEmail: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getDealershipByUserId(ctx.user.id);
      if (!existing || existing.id !== input.id) throw new TRPCError({ code: 'FORBIDDEN' });
      const { id, ...data } = input;
      return db.updateDealership(id, data);
    }),
});

const complianceRouter = router({
  getAnswers: protectedProcedure.query(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) return [];
    return db.getComplianceAnswers(dealership.id);
  }),
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) return [];
    return db.getAllComplianceAnswers(dealership.id);
  }),
  getSection: protectedProcedure
    .input(z.object({ section: z.number().int().min(1).max(9) }))
    .query(async ({ ctx, input }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return null;
      const answers = await db.getComplianceAnswers(dealership.id);
      return answers.find(a => a.section === input.section) ?? null;
    }),
  saveAnswer: protectedProcedure
    .input(z.object({
      section: z.number().int(),
      sectionName: z.string(),
      answers: z.record(z.unknown()),
      score: z.number().int(),
      completed: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) throw new TRPCError({ code: 'NOT_FOUND' });
      return db.saveComplianceAnswer({
        dealershipId: dealership.id,
        ...input,
        completedAt: input.completed ? new Date() : undefined,
        updatedAt: new Date(),
      });
    }),
  saveSection: protectedProcedure
    .input(z.object({
      section: z.number().int(),
      sectionName: z.string(),
      answers: z.record(z.unknown()),
      score: z.number().int(),
      completed: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) throw new TRPCError({ code: 'NOT_FOUND' });
      return db.saveComplianceAnswer({
        dealershipId: dealership.id,
        ...input,
        completedAt: input.completed ? new Date() : undefined,
        updatedAt: new Date(),
      });
    }),
});

const subscriptionRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) return { plan: 'free', status: 'active', currentPeriodEnd: null };
    const sub = await db.getSubscription(dealership.id);
    return sub ?? { plan: 'free', status: 'active', currentPeriodEnd: null };
  }),
  create: protectedProcedure
    .input(z.object({
      dealershipId: z.number(),
      stripeCustomerId: z.string().optional(),
      stripeSubscriptionId: z.string().optional(),
      plan: z.string(),
      status: z.string(),
      currentPeriodEnd: z.date().optional(),
    }))
    .mutation(async ({ input }) => db.createSubscription(input)),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input }) => db.updateSubscription(input.id, { status: input.status })),
});

const documentsRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) return [];
    return db.getGeneratedDocuments(dealership.id);
  }),
  getByType: protectedProcedure
    .input(z.object({ docType: z.string() }))
    .query(async ({ ctx, input }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return [];
      const docs = await db.getGeneratedDocuments(dealership.id);
      return docs.filter(d => d.docType === input.docType);
    }),
  save: protectedProcedure
    .input(z.object({ dealershipId: z.number(), docType: z.string(), storagePath: z.string().optional() }))
    .mutation(async ({ input }) => db.saveGeneratedDocument(input)),
});

// Stripe router — import from _shared/stripe-router.ts (Task 12)
// PDF router — import from _shared/pdf-router.ts
// System router
const systemRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok', ts: new Date().toISOString() })),
});

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  dealership: dealershipRouter,
  compliance: complianceRouter,
  subscription: subscriptionRouter,
  documents: documentsRouter,
  // stripe and pdf routers added in Task 12 and 13
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Create `supabase/functions/_shared/storage.ts`**

```typescript
// supabase/functions/_shared/storage.ts
import { StorageClient } from 'npm:@supabase/storage-js';
import { ENV } from './env.ts';

const BUCKET = 'documents';

function getStorageClient() {
  const url = `${ENV.supabaseUrl}/storage/v1`;
  return new StorageClient(url, {
    apikey: ENV.supabaseServiceRoleKey,
    Authorization: `Bearer ${ENV.supabaseServiceRoleKey}`,
  });
}

export async function storagePut(
  fileName: string,
  data: Uint8Array,
  contentType = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  const storage = getStorageClient();
  const { error } = await storage.from(BUCKET).upload(fileName, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: publicUrl } = storage.from(BUCKET).getPublicUrl(fileName);
  return { key: fileName, url: publicUrl.publicUrl };
}

export async function storageGet(key: string): Promise<{ key: string; url: string }> {
  const storage = getStorageClient();
  const { data } = storage.from(BUCKET).getPublicUrl(key);
  return { key, url: data.publicUrl };
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/trpc/ supabase/functions/_shared/routers.ts supabase/functions/_shared/storage.ts
git commit -m "feat: add trpc edge function with fetch adapter"
```

---

## Task 12: Supabase Edge Function — Stripe + Stripe Router

**Files:**
- Create: `supabase/functions/stripe-webhook/index.ts`
- Create: `supabase/functions/_shared/stripe-router.ts`

- [ ] **Step 1: Write stripe-router.ts for Edge Functions**

Create `supabase/functions/_shared/stripe-router.ts`:

```typescript
import { initTRPC, TRPCError } from 'npm:@trpc/server';
import Stripe from 'npm:stripe';
import * as db from './db.ts';
import { ENV } from './env.ts';
import type { User } from '../../../drizzle/schema.ts';

type ProtectedCtx = { user: User };
const t = initTRPC.context<ProtectedCtx>().create();

let _stripe: Stripe | null = null;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: '2024-06-20' });
  return _stripe;
}

export const stripeRouter = t.router({
  createCheckoutSession: t.procedure
    .input(z.object({ plan: z.enum(['core', 'managed']), dealershipId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      let sub = await db.getSubscription(input.dealershipId);
      let customerId = sub?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: ctx.user.email,
          metadata: { dealershipId: String(input.dealershipId) },
        });
        customerId = customer.id;
      }

      const priceId = input.plan === 'core' ? ENV.stripeCorePrice : ENV.stripeManagedPrice;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${ENV.appUrl}/dashboard?checkout=success`,
        cancel_url: `${ENV.appUrl}/documents`,
        metadata: { dealershipId: String(input.dealershipId), plan: input.plan },
      });

      return { url: session.url };
    }),

  getSubscriptionStatus: t.procedure.query(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) return { plan: 'free', status: 'active', currentPeriodEnd: null };
    const sub = await db.getSubscription(dealership.id);
    return sub ?? { plan: 'free', status: 'active', currentPeriodEnd: null };
  }),

  cancelSubscription: t.procedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input }) => {
      const sub = await db.getSubscription(input.subscriptionId);
      if (!sub?.stripeSubscriptionId) throw new TRPCError({ code: 'NOT_FOUND' });
      await getStripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
      return db.updateSubscription(sub.id, { status: 'canceled' });
    }),

  getBillingPortalUrl: t.procedure
    .input(z.object({ customerId: z.string() }))
    .mutation(async ({ input }) => {
      const session = await getStripe().billingPortal.sessions.create({
        customer: input.customerId,
        return_url: `${ENV.appUrl}/dashboard`,
      });
      return { url: session.url };
    }),
});
```

Note: Add `import { z } from 'npm:zod';` at the top.

- [ ] **Step 2: Write the Stripe Webhook Edge Function**

Create `supabase/functions/stripe-webhook/index.ts`:

```typescript
import Stripe from 'npm:stripe';
import { handleCors } from '../_shared/cors.ts';
import { ENV } from '../_shared/env.ts';
import * as db from '../_shared/db.ts';

let _stripe: Stripe | null = null;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: '2024-06-20' });
  return _stripe;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, ENV.stripeWebhookSecret);
  } catch (err) {
    return new Response(`Webhook error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const dealershipId = Number(sub.metadata.dealershipId);
        const plan = sub.metadata.plan ?? 'free';
        const existing = await db.getSubscription(dealershipId);
        if (existing) {
          await db.updateSubscription(existing.id, {
            stripeSubscriptionId: sub.id,
            plan,
            status: sub.status === 'active' ? 'active' : 'inactive',
            currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
          });
        } else {
          await db.createSubscription({
            dealershipId,
            stripeCustomerId: sub.customer as string,
            stripeSubscriptionId: sub.id,
            plan,
            status: sub.status === 'active' ? 'active' : 'inactive',
            currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const dealershipId = Number(sub.metadata.dealershipId);
        const existing = await db.getSubscription(dealershipId);
        if (existing) await db.updateSubscription(existing.id, { status: 'canceled' });
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string;
        if (subId) {
          const allSubs = await db.getSubscription(0); // placeholder — find by stripeSubscriptionId
          // In production: add db.getSubscriptionByStripeId(subId)
        }
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

Note: The `invoice.payment_succeeded` handler needs `db.getSubscriptionByStripeId`. Add this function to `_shared/db.ts`:
```typescript
export async function getSubscriptionByStripeId(stripeSubId: string) {
  const db = getDb();
  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
  return sub ?? null;
}
```

- [ ] **Step 3: Add stripeRouter to appRouter in `_shared/routers.ts`**

Open `supabase/functions/_shared/routers.ts`, add:
```typescript
import { stripeRouter } from './stripe-router.ts';

// in appRouter:
export const appRouter = router({
  // ... existing
  stripe: stripeRouter,
});
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/stripe-webhook/ supabase/functions/_shared/stripe-router.ts
git commit -m "feat: add stripe webhook edge function and stripe tRPC router"
```

---

## Task 13: Supabase Edge Function — Handle Signup (Admin Role)

**Files:**
- Create: `supabase/functions/handle-signup/index.ts`

- [ ] **Step 1: Write the signup hook Edge Function**

Create `supabase/functions/handle-signup/index.ts`:

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ENV } from '../_shared/env.ts';

// This function is called by Supabase Auth as a "Custom Access Token" hook.
// It detects if the new user email matches ADMIN_EMAIL and sets role metadata.
// Configure in: Supabase Dashboard → Auth → Hooks → "Custom Access Token" or "Sign-up" hook

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await req.json();

  // Supabase calls this hook with { event, user_id, claims, ... }
  const userId: string = payload.user_id ?? payload.user?.id;
  const email: string = payload.user?.email ?? payload.claims?.email;

  if (!userId || !email) {
    return new Response(JSON.stringify({ error: 'Missing user data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const role = email === ENV.adminEmail ? 'admin' : 'user';

  // Update the user's metadata with their role via the Admin API
  const supabaseAdmin = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { role },
  });

  // Return modified claims for Custom Access Token hook (adds role to JWT)
  return new Response(
    JSON.stringify({
      ...payload,
      claims: {
        ...payload.claims,
        user_role: role,
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

- [ ] **Step 2: Register this hook in Supabase Dashboard**

Manual step:
1. Go to Supabase Dashboard → Authentication → Hooks
2. Enable "Custom Access Token Hook"
3. Set URL to: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/handle-signup`
4. Add the function's service role key as the Authorization secret

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/handle-signup/
git commit -m "feat: add handle-signup edge function for admin role detection"
```

---

## Task 14: GitHub Actions — Deploy Frontend to GitHub Pages

**Files:**
- Create: `.github/workflows/deploy-frontend.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy-frontend.yml`:

```yaml
name: Deploy Frontend to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build frontend
        run: pnpm run vercel-build
        env:
          VITE_APP_URL: https://andrewibrah.github.io/aand-compliance
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist/public

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Update `scripts/build.mjs` to output only the static frontend**

The current `build.mjs` also bundles API functions into `.vercel/output/`. For GitHub Pages, we only need the frontend. Update the script to:
1. Run `vite build` → `dist/public/`
2. Skip the `.vercel/output/` bundling

Open `scripts/build.mjs` and comment out or remove the API bundling steps. Keep only:

```javascript
import { execSync } from 'child_process';
import { cpSync } from 'fs';

// Build frontend
execSync('vite build', { stdio: 'inherit' });
console.log('Frontend build complete → dist/public/');
```

Or update `package.json` to add a dedicated static-only build script:
```json
"build:static": "vite build"
```

And update the workflow to use `pnpm run build:static` instead.

- [ ] **Step 3: Add GitHub Pages configuration file for SPA routing**

GitHub Pages doesn't handle SPA routing (all routes return index.html). Add a `404.html` redirect hack:

Create `client/public/404.html`:
```html
<!DOCTYPE html>
<html>
<head>
<script>
  // SPA routing for GitHub Pages
  // Redirect all 404s back to index.html with the path encoded as a query param
  var l = window.location;
  l.replace(l.protocol+'//'+l.hostname+(l.port?':'+l.port:'')+l.pathname.split('/').slice(0,1).join('/')+
    '/?/'+l.pathname.slice(1).replace(/&/g,'~and~')+(l.search?'&'+l.search.slice(1).replace(/&/g,'~and~'):'')+l.hash);
</script>
</head>
</html>
```

And add the decode script to `client/index.html` (before closing `</body>`):
```html
<script>
  // SPA routing for GitHub Pages — decode the redirected path
  (function(l) {
    if (l.search[1] === '/') {
      var decoded = l.search.slice(1).split('&').map(function(s) {
        return s.replace(/~and~/g, '&')
      }).join('?');
      window.history.replaceState(null, null, l.pathname.slice(0, -1) + decoded + l.hash);
    }
  }(window.location));
</script>
```

- [ ] **Step 4: Add a `.nojekyll` file to prevent GitHub Pages from ignoring underscore files**

Create `client/public/.nojekyll`:
```
```
(empty file)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-frontend.yml client/public/ client/index.html scripts/build.mjs
git commit -m "feat: add github actions workflow for github pages deployment + SPA routing"
```

---

## Task 15: GitHub Actions — Deploy Supabase Edge Functions

**Files:**
- Create: `.github/workflows/deploy-functions.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy-functions.yml`:

```yaml
name: Deploy Supabase Edge Functions

on:
  push:
    branches: [main]
    paths:
      - 'supabase/functions/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Deploy Edge Functions
        run: |
          supabase functions deploy trpc --project-ref ${{ secrets.SUPABASE_PROJECT_REF }} --no-verify-jwt
          supabase functions deploy stripe-webhook --project-ref ${{ secrets.SUPABASE_PROJECT_REF }} --no-verify-jwt
          supabase functions deploy handle-signup --project-ref ${{ secrets.SUPABASE_PROJECT_REF }} --no-verify-jwt
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Set Edge Function Secrets
        run: |
          supabase secrets set \
            SUPABASE_URL=${{ secrets.SUPABASE_URL }} \
            SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }} \
            SUPABASE_SERVICE_ROLE_KEY=${{ secrets.SUPABASE_SERVICE_ROLE_KEY }} \
            SUPABASE_DB_URL=${{ secrets.SUPABASE_DB_URL }} \
            ADMIN_EMAIL=${{ secrets.ADMIN_EMAIL }} \
            STRIPE_SECRET_KEY=${{ secrets.STRIPE_SECRET_KEY }} \
            STRIPE_WEBHOOK_SECRET=${{ secrets.STRIPE_WEBHOOK_SECRET }} \
            STRIPE_CORE_PRICE_ID=${{ secrets.STRIPE_CORE_PRICE_ID }} \
            STRIPE_MANAGED_PRICE_ID=${{ secrets.STRIPE_MANAGED_PRICE_ID }} \
            RESEND_API_KEY=${{ secrets.RESEND_API_KEY }} \
            OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }} \
            VITE_APP_URL=https://andrewibrah.github.io/aand-compliance \
            --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

- [ ] **Step 2: Add all required GitHub Secrets**

In GitHub repo → Settings → Secrets and variables → Actions → New repository secret, add:

| Secret Name | Where to find it |
|-------------|-----------------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role key |
| `SUPABASE_PROJECT_REF` | Supabase Dashboard → Settings → General → Reference ID |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens → Generate |
| `SUPABASE_DB_URL` | Supabase Dashboard → Settings → Database → Transaction pooler URI |
| `ADMIN_EMAIL` | Your admin email address |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → signing secret |
| `STRIPE_CORE_PRICE_ID` | Stripe Dashboard → Products → Core plan price ID |
| `STRIPE_MANAGED_PRICE_ID` | Stripe Dashboard → Products → Managed plan price ID |
| `RESEND_API_KEY` | Resend Dashboard → API Keys |
| `OPENAI_API_KEY` | OpenAI Platform → API Keys |
| `VITE_API_URL` | `https://YOUR_PROJECT_REF.supabase.co/functions/v1` |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` |

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-functions.yml
git commit -m "feat: add github actions workflow for supabase edge function deployment"
```

---

## Task 16: Apply Migrations to Supabase + Final Setup

**Files:** None (manual steps + commands)

- [ ] **Step 1: Create Supabase project (manual)**

1. Go to supabase.com → New project
2. Note your Project Reference ID, DB password, and region
3. Fill in `supabase.env` and `.env` with real values

- [ ] **Step 2: Link local project to Supabase**

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

- [ ] **Step 3: Apply SQL migrations to Supabase**

```bash
# Apply schema
psql $SUPABASE_DB_URL -f supabase/migrations/0001_init_schema.sql

# Apply auth trigger
psql $SUPABASE_DB_URL -f supabase/migrations/0002_auth_trigger.sql
```

Or via the Supabase CLI:
```bash
npx supabase db push
```

- [ ] **Step 4: Enable GitHub Pages on the repo**

1. Go to GitHub repo → Settings → Pages
2. Source: "GitHub Actions"
3. Save

- [ ] **Step 5: Set Stripe webhook endpoint in Stripe Dashboard**

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
3. Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

- [ ] **Step 6: Run full TypeScript check**

```bash
pnpm check
```

Expected: 0 errors.

- [ ] **Step 7: Push to main to trigger both GitHub Actions workflows**

```bash
git push origin main
```

Check GitHub Actions tab — both workflows should run and succeed.

- [ ] **Step 8: Verify deployment**

1. Frontend: Visit `https://andrewibrah.github.io/aand-compliance` — app loads
2. Signup: Create a test account — user appears in Supabase Dashboard → Authentication → Users
3. tRPC: Navigate to dashboard — compliance data loads from Supabase DB
4. Storage: Generate a PDF — document appears in Supabase Dashboard → Storage → documents bucket

---

## Verification Checklist

| Check | Command / Action |
|-------|-----------------|
| TypeScript passes | `pnpm check` → 0 errors |
| Tests pass | `pnpm test` → 0 failures |
| Signup creates user in auth.users AND public.users | Supabase Dashboard → Auth → Users + Table Editor → users |
| Admin email gets role=admin | Sign up with ADMIN_EMAIL → check public.users.role |
| tRPC calls work cross-origin | Open DevTools Network tab on GitHub Pages, verify 200 responses with Authorization header |
| Stripe webhook processes events | Stripe Dashboard → Webhooks → recent deliveries → 200 OK |
| PDF upload lands in Supabase Storage | Generate a WISP → check Storage → documents bucket |
| GitHub Pages SPA routing works | Navigate to `/dashboard` directly (not from root) — page loads correctly |
| Edge Function secrets are set | `supabase secrets list --project-ref YOUR_REF` |
