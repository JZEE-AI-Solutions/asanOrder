# Render.com Login Troubleshooting Guide

## Problem: "Invalid user" Error on Login

If you're getting "Invalid user" or "Invalid email or password" errors when trying to log in, it's likely because:
1. Database migrations didn't run successfully
2. Database is empty (no users were seeded)

---

## Step 1: Check Backend Logs

1. Go to **Render Dashboard** → Your backend service (`asanorder`)
2. Click **"Logs"** tab
3. Look for migration-related messages:
   - ✅ **Good**: `Prisma migrations applied successfully` or `All migrations have been applied`
   - ❌ **Bad**: `Migration failed`, `Database connection error`, or no migration messages

### What to Look For:
```
✅ Expected successful migration output:
   Applying migration `20240101000000_init`
   ✅ Migration applied successfully
   All migrations have been applied
```

```
❌ Error examples:
   Error: P1001: Can't reach database server
   Error: Migration failed
   Error: Table already exists
```

---

## Step 2: Verify Database Connection

Check if the backend can connect to the database:

1. In backend logs, look for:
   - `✅ Connected to database successfully`
   - Or connection errors

2. **Verify `DATABASE_URL` environment variable**:
   - Go to backend service → **Environment** tab
   - Check `DATABASE_URL` is set
   - **IMPORTANT**: Use the **Internal Database URL** (not External)
   - Format should be: `postgresql://user:password@host:port/database?schema=public`

---

## Step 3: Manually Run Migrations

If migrations didn't run automatically, run them manually:

### Option A: Using Render Shell (Recommended - Requires Paid Plan)

**⚠️ Note**: Shell access is only available on paid plans (Starter tier and above). If you're on the free tier, skip to **Option B** or use the **API endpoint method** below.

1. Go to backend service → **"Shell"** tab
2. Run these commands one by one:

```bash
# Navigate to backend directory
cd backend

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

3. Check the output for success messages

### Option B: Update Start Command

If migrations keep failing, update the start command to be more verbose:

1. Go to backend service → **Settings** tab
2. Find **"Start Command"**
3. Update it to:
```bash
cd backend && npx prisma generate && npx prisma migrate deploy && node server.js
```

4. Click **"Save Changes"** (this will trigger a redeploy)

---

## Step 4: Seed the Database (Create Initial Users)

**This is likely the main issue** - your database is empty!

The migrations create the tables, but **don't create any users**. You need to run the seed script.

### ⚠️ Free Tier Limitation

**Shell access is NOT available on Render's free tier.** Use one of these methods:

### Method 1: Auto-Seed on Startup (RECOMMENDED) ✅

The code has been updated to automatically seed the database on startup if it's empty. 

**Just commit and push the changes** - Render will auto-deploy and seed automatically.

**📖 See**: `RENDER_FREE_TIER_SEEDING.md` for details

### Method 2: Seed via API Endpoint (IMMEDIATE FIX) ✅

Call this endpoint to seed the database:

```bash
curl -X POST https://asanorder.onrender.com/api/auth/seed
```

Or open in browser (use a REST client extension):
```
https://asanorder.onrender.com/api/auth/seed
```

**Expected response**:
```json
{
  "message": "Database seeded successfully!",
  "usersCreated": {...},
  "credentials": {...}
}
```

### Method 3: Using Render Shell (Paid Plans Only)

If you have Shell access (Starter tier+):

1. Go to backend service → **"Shell"** tab
2. Run:

```bash
cd backend
npm run db:seed
```

Or directly:
```bash
cd backend
node prisma/seed.js
```

### Expected Output:
```
🌱 Starting database seed...
✅ Admin user created: admin@orderms.com
✅ Stock Keeper user created: stock@orderms.com
✅ Business Owner user created: business@dressshop.com
✅ Tenant created: Elegant Dress Orders
🎉 Database seeded successfully!

📋 Login Credentials:
Admin: admin@orderms.com / admin123
Business Owner: business@dressshop.com / business123
Stock Keeper: stock@orderms.com / stock123
```

---

## Step 5: Verify Users Were Created

After seeding, verify users exist:

### Option A: Check via API

Test the login endpoint directly:

```bash
curl -X POST https://asanorder.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@orderms.com","password":"admin123"}'
```

**Expected response** (success):
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@orderms.com",
    "name": "System Administrator",
    "role": "ADMIN"
  }
}
```

**If you get** `{"error":"Invalid email or password"}` - users weren't created, re-run the seed script.

### Option B: Check Database Directly

If you have database access:

1. Connect to your PostgreSQL database
2. Run:
```sql
SELECT id, email, name, role FROM "User";
```

You should see at least 3 users:
- `admin@orderms.com`
- `stock@orderms.com`
- `business@dressshop.com`

---

## Step 6: Test Login in Frontend

After seeding:

1. Go to: https://asanorderui.onrender.com
2. Try logging in with:
   - **Email**: `admin@orderms.com`
   - **Password**: `admin123`

3. Check browser console (F12) for any errors
4. Check Network tab to see if API calls are successful

---

## Common Issues & Solutions

### Issue 1: "Migration already applied" Error

**Symptom**: `Migration X already applied`

**Solution**: This is fine! It means migrations ran. Just run the seed script:
```bash
cd backend && npm run db:seed
```

---

### Issue 2: "Table doesn't exist" Error

**Symptom**: `Table "User" does not exist`

**Solution**: Migrations didn't run. Run them manually:
```bash
cd backend
npx prisma generate
npx prisma migrate deploy
```

---

### Issue 3: "Can't reach database server"

**Symptom**: `P1001: Can't reach database server`

**Solution**:
1. Check `DATABASE_URL` is correct in environment variables
2. Use **Internal Database URL** (not External)
3. Verify database service is running in Render dashboard
4. Check database isn't paused (free tier databases pause after inactivity)

---

### Issue 4: Seed Script Fails

**Symptom**: `❌ Seed failed: ...`

**Possible causes**:
- Database connection issue
- Tables don't exist (migrations didn't run)
- User already exists (this is OK, seed uses `upsert`)

**Solution**:
1. First ensure migrations ran: `npx prisma migrate deploy`
2. Then run seed: `npm run db:seed`
3. Check logs for specific error messages

---

### Issue 5: "Invalid user" Even After Seeding

**Possible causes**:
1. Wrong email/password
2. Database connection issue (backend connecting to wrong database)
3. Password hashing mismatch

**Solution**:
1. Verify you're using correct credentials:
   - `admin@orderms.com` / `admin123`
   - `business@dressshop.com` / `business123`
   - `stock@orderms.com` / `stock123`

2. Check backend logs when you try to login - look for:
   - Database query errors
   - User lookup errors

3. Verify `JWT_SECRET` is set in backend environment variables

---

## Quick Fix Checklist

Run these in order:

- [ ] **Step 1**: Check backend logs for migration errors
- [ ] **Step 2**: Verify `DATABASE_URL` is set correctly (Internal URL)
- [ ] **Step 3**: Run migrations manually: `cd backend && npx prisma migrate deploy`
- [ ] **Step 4**: Seed database: `cd backend && npm run db:seed`
- [ ] **Step 5**: Test login via API: `curl -X POST https://asanorder.onrender.com/api/auth/login ...`
- [ ] **Step 6**: Test login in frontend UI

---

## Automated Solution: Update Start Command

To prevent this issue in the future, you can update the start command to automatically seed if the database is empty:

1. Go to backend service → **Settings** → **Start Command**
2. Update to:
```bash
cd backend && npx prisma generate && npx prisma migrate deploy && (npm run db:seed || true) && node server.js
```

The `|| true` ensures the server starts even if seed fails (in case users already exist).

**Note**: This will attempt to seed on every restart. The seed script uses `upsert`, so it's safe to run multiple times.

---

## Verification Commands

After fixing, verify everything works:

### 1. Check Backend Health
```bash
curl https://asanorder.onrender.com/api/health
```
Expected: `{"status":"OK","timestamp":"..."}`

### 2. Test Login Endpoint
```bash
curl -X POST https://asanorder.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@orderms.com","password":"admin123"}'
```
Expected: JSON with `token` and `user` fields

### 3. Test Frontend
- Visit: https://asanorderui.onrender.com
- Login with: `admin@orderms.com` / `admin123`
- Should redirect to admin dashboard

---

## Need More Help?

1. **Check Backend Logs**: Always check logs first for specific error messages
2. **Check Database Status**: Ensure database service is running
3. **Verify Environment Variables**: All required vars are set correctly
4. **Test API Directly**: Use curl/Postman to test backend endpoints
5. **Check Browser Console**: Look for frontend errors or CORS issues

---

## Default Login Credentials

After seeding, you can use these credentials:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@orderms.com` | `admin123` |
| Business Owner | `business@dressshop.com` | `business123` |
| Stock Keeper | `stock@orderms.com` | `stock123` |

---

**Last Updated**: Based on current deployment configuration

