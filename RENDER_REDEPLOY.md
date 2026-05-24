# Render Re-Deploy Runbook (with Render Postgres)

This is the **exact step-by-step** to get your latest commit live on Render with
a Render-managed Postgres (restore the suspended one or create a new free one).
Estimated time: **20–30 minutes**.

> **Free-tier caveat:** CLIP-Large (~600 MB model, ~800 MB peak RAM) will most
> likely fail to load on Render's 512 MB free tier. The agent has been hardened
> to **degrade gracefully** — chat/dashboard/quick-add continue to work,
> only the *visual matching* for new dress photos will be disabled. Upgrade
> `asanOrderAPI` to Standard ($25/mo, 2 GB RAM) whenever you're ready to enable it.

---

## Step 0 — Pre-flight (local, 2 min)

Confirm the current build is healthy:
```powershell
cd D:\JZProjects\asanOrder\.claude\worktrees\great-williamson-14a827\backend
npx jest tests/agent.test.js --runInBand    # must be 43/43 green
```

Stage + commit + push the latest changes:
```powershell
cd D:\JZProjects\asanOrder\.claude\worktrees\great-williamson-14a827
git add render.yaml .gitignore RENDER_REDEPLOY.md `
        backend/ frontend/
git status                                  # double-check no .model-cache/ no .env
git commit -m "Re-deploy: PWA + quick-add + tile-MAX matching"
git push origin main                        # or whichever branch your services watch
```

> If your worktree isn't on the branch the Render services watch, run
> `git branch --show-current` and either switch (`git checkout main && git merge ...`)
> or change the Render service branch in dashboard before deploying.

---

## Step 1 — Render Postgres database (5 min)

Two paths depending on whether you have a usable suspended DB:

**Path A — Restore the suspended DB (if it's recent)**
1. Render dashboard → **Suspended** tab → click the row.
2. If it shows a **Resume** or **Restore** button → click it. The DB comes back
   with old data. Schema differences are reconciled in Step 3 by `prisma db push`.
3. Open the DB → copy the **Internal Database URL**. It looks like:
   ```
   postgresql://asanorder_user:xxxxxxxx@dpg-xxxxx-a/asanorder
   ```
   Save it for Step 3.

**Path B — Create a new free Postgres (clean slate)**
1. Render dashboard → **New +** → **PostgreSQL**.
2. Name: `asanorder-db`. Database: `asanorder`. User: `asanorder_user`.
   Region: **Singapore** (matches your services). PostgreSQL version: **16**.
   Plan: **Free**.
3. Click **Create Database**. Wait ~1 min for provisioning.
4. On the DB's overview page, copy the **Internal Database URL** (starts with
   `postgresql://asanorder_user:...`). Save it for Step 3.

> Use the **Internal** URL (not External). Internal works only inside Render's
> network, which is what `asanOrderAPI` needs and is faster than External.
> Free Render Postgres has a **90-day expiry** — after that you'll need to
> create a new one or upgrade. Schema is reapplied each deploy via
> `prisma db push`, so a fresh DB just needs a one-time seed.

---

## Step 2 — Generate a long-lived WhatsApp access token (10 min, OPTIONAL)

Your current `META_ACCESS_TOKEN` expires every 24 h. For a deployed system you
want a **System User** token (60-day expiry, re-newable):

1. <https://business.facebook.com> → **Business Settings → Users → System users**
   → **Add → Admin**. Name: `asanorder-prod`.
2. Click the user → **Add Assets → Apps** → pick your WhatsApp app → grant **Full control**.
3. **Generate new token** → select your app → permissions:
   `whatsapp_business_messaging`, `whatsapp_business_management`. Expiry: **60 days**.
4. Copy the token (starts with `EAA...`). Save it.

Skip this step if you're OK rotating the 24 h token manually.

---

## Step 3 — Update the `asanOrderAPI` service on Render (8 min)

1. Render dashboard → **asanOrderAPI** → **Settings**.
2. **Build & Deploy section:**
   - Branch: confirm it matches the branch you pushed to in Step 0.
   - **Build Command** → paste:
     ```
     cd backend && npm ci --no-audit --no-fund && npx prisma generate && npx prisma db push --accept-data-loss
     ```
   - **Start Command** → paste:
     ```
     cd backend && node server.js
     ```
   - **Health Check Path**: `/api/health`.
3. **Environment** tab → add/update the variables below. Anything marked **SECRET**
   should be added one-by-one with the eye-icon hidden:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `NODE_OPTIONS` | `--max-old-space-size=460` |
   | `PORT` | `10000` |
   | `DATABASE_URL` | *(Internal Database URL from Step 1)* **SECRET** |
   | `JWT_SECRET` | *(click "Generate" if not already set)* |
   | `UPLOAD_DIR` | `uploads` |
   | `MAX_FILE_SIZE` | `5242880` |
   | `AI_PROVIDER` | `anthropic` |
   | `ANTHROPIC_API_KEY` | *(your sk-ant-… key)* **SECRET** |
   | `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` |
   | `OPENAI_API_KEY` | *(optional fallback)* **SECRET** |
   | `OPENAI_MODEL` | `gpt-4o` |
   | `AGENT_MODE` | `supervised` |
   | `AGENT_OWNER_PHONE` | `923001234567` *(your WhatsApp digits)* |
   | `META_ACCESS_TOKEN` | *(Step 2 token, or current 24 h one)* **SECRET** |
   | `META_PHONE_NUMBER_ID` | `648773678319738` |
   | `META_WABA_ID` | `684814384245363` |
   | `WEBHOOK_VERIFY_TOKEN` | `asanorder-verify-2024` |
   | `WEBHOOK_BASE_URL` | `https://asanorderapi.onrender.com` *(or your actual API URL)* |
   | `FRONTEND_URL` | `https://asanorderui.onrender.com` *(comma-sep multiple if needed)* |

4. Click **Save Changes**. Render auto-redeploys.

5. Watch the **Logs** tab. The first deploy will:
   - Install deps (~2 min — `sharp` + transformers add up).
   - Run `prisma db push` against Supabase → applies the full schema in one shot.
   - Start the server → expect `🚀 Server running on http://localhost:10000`.
   - First /api/health hit returns OK.

If you see `prisma db push` errors, the most common cause is a stale
`DATABASE_URL`. Verify the value in Render, redeploy. If you see
`@xenova/transformers` install errors, ignore — model is downloaded lazily
on first dress photo, not at install time.

If you reused the suspended DB (Path A) and `db push` complains about column
type mismatches or missing constraints, add `--accept-data-loss` to your
build command (it already is in the template) — Prisma will drop the
incompatible parts and recreate. Data in unrelated tables is preserved.

---

## Step 4 — Update the `asanOrderUI` (frontend) service (5 min)

1. Render dashboard → **asanOrderUI** → **Settings**.
2. **Build Command** → `cd frontend && npm ci --no-audit --no-fund && npm run build`
3. **Publish Directory** → `frontend/dist`
4. **Redirects/Rewrites** (Render gives them as a UI list — or paste this into the
   `_redirects` file if you prefer file-based config):

   | Source | Destination | Type |
   |---|---|---|
   | `/api/*` | `https://asanorderapi.onrender.com/api/:splat` | Rewrite |
   | `/uploads/*` | `https://asanorderapi.onrender.com/uploads/:splat` | Rewrite |
   | `/*` | `/index.html` | Rewrite |

   The last entry is the SPA fallback so React Router routes (like `/chat/1001`,
   `/business/quick-add`) work on hard refresh.

5. **Environment** tab:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://asanorderapi.onrender.com` |

6. Click **Manual Deploy → Deploy latest commit**.

The build will pull the new vite-plugin-pwa config and emit `dist/sw.js` +
`dist/manifest.webmanifest` — that's what makes the chat installable as a PWA.

---

## Step 5 — Update the WhatsApp Meta webhook (2 min)

1. <https://developers.facebook.com> → your app → **WhatsApp → Configuration**.
2. **Webhook callback URL**: `https://asanorderapi.onrender.com/api/agent/webhook`
3. **Verify token**: `asanorder-verify-2024` (must match `WEBHOOK_VERIFY_TOKEN` env var).
4. Click **Verify and save**. If it fails, check Render API logs — usually means
   the backend hasn't finished its first deploy yet, or `WEBHOOK_VERIFY_TOKEN`
   doesn't match.
5. Under **Webhook fields**, subscribe to: `messages` (incoming).

---

## Step 6 — Smoke tests (5 min)

| Test | Expected |
|---|---|
| `GET https://asanorderapi.onrender.com/api/health` | `{"status":"OK"}` |
| `https://asanorderui.onrender.com/login` | login page renders |
| Login as `business@dressshop.com` / `business123` | dashboard loads (DB has seed data) |
| `https://asanorderui.onrender.com/chat/<businessCode>` | chat header + greeting |
| Send "hi" in chat | agent reply within ~1 s (text-only, no model needed) |
| Open chat header → **+ Add Product** | navigates to `/business/quick-add` |
| Add a tiny test product (no photo) | succeeds (skip photo or use camera — see note) |
| Send WhatsApp message to your business number | webhook receives it, agent replies |

> **Photo upload on free tier:** Expect a longer wait (~10-30 s on first
> upload as @xenova/transformers downloads CLIP-Large model). If RAM is too
> tight you'll see in Render logs: `[embeddingService] Vector search failed:
> JavaScript heap out of memory`. That's the graceful-degrade path — product
> still gets created, just without an embedding. To enable visual matching:
> upgrade `asanOrderAPI` plan to Standard.

---

## Step 7 — Seed users (one-time, only if DB is brand new)

Skip this if you restored a suspended DB that already has users.

If you went with Path B (new free Postgres), seed the admin + business owner + stockkeeper users:

1. From your laptop, point Prisma at the new DB's **External** URL (External
   works from outside Render; Internal only works from inside Render's network):
   - Render dashboard → asanorder-db → copy **External Database URL**.
2. Run the seed:
   ```powershell
   cd D:\JZProjects\asanOrder\.claude\worktrees\great-williamson-14a827\backend
   $env:DATABASE_URL="<external Render Postgres URL>"
   node prisma/seed.js
   ```
3. This creates `admin@asanorder.com`, `business@dressshop.com`, `stockkeeper@asanorder.com`
   with the seeded passwords printed at the end.

> After seeding, **unset** the DATABASE_URL from your local shell so you don't
> accidentally write to prod from local dev:
> ```powershell
> Remove-Item Env:DATABASE_URL
> ```

---

## Common gotchas

| Symptom | Fix |
|---|---|
| `Cold start takes 50+s` on first request | Free-tier services spin down. First hit wakes them. Use Render's "Health Check Path" + a UptimeRobot/cron-jobs.org ping to keep warm. |
| `prisma generate` fails on Render | Ensure `prisma` is in `dependencies` (not just devDependencies). It is — verified. |
| CORS error from chat page | Add the frontend's actual URL to `FRONTEND_URL` (comma-separated for multiple). |
| WhatsApp message not delivered | `META_ACCESS_TOKEN` expired. Rotate (Step 2). |
| Quick-add image upload 413 | Render free has 100 MB body limit. The endpoint already caps at 10 MB. Should not hit unless customer uploads a 5+ MB photo — that's the `MAX_FILE_SIZE=5242880` cap. |
| `JavaScript heap out of memory` log | CLIP couldn't load. Agent is degraded but functional. Upgrade to Standard plan when you want visual matching. |

---

## What to monitor on the live deploy

| Endpoint / Metric | Where |
|---|---|
| Backend health | `https://asanorderapi.onrender.com/api/health` |
| Real-time logs | Render dashboard → asanOrderAPI → Logs |
| DB stats (storage, connections) | Render dashboard → asanorder-db → Metrics |
| Agent vector-search behaviour | grep `Tile-MAX search` in API logs |
| Webhook hits | grep `[agent/webhook]` in API logs |
| PWA SW status | Open the deployed UI → Chrome DevTools → Application → Service Workers |

---

## Roll-back plan
If a new deploy breaks something:
1. Render dashboard → asanOrderAPI → **Deploys** → click the previous successful
   deploy → **Rollback to this deploy**.
2. For schema changes, Prisma's `db push` is non-destructive *except* for the
   `--accept-data-loss` flag which only drops columns/tables that vanished from
   the schema. Take a Render DB **manual backup** (dashboard → asanorder-db →
   Backups → Create) before any large schema move.
