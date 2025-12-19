# Seeding Database on Render Free Tier (Without Shell Access)

Since Shell access is not available on Render's free tier, here are **two solutions** to seed your database:

---

## ✅ Solution 1: Auto-Seed on Startup (RECOMMENDED)

I've updated your code to automatically seed the database when the server starts **if no users exist**.

### What Changed:
1. Created `backend/auto-seed.js` - checks if users exist, seeds if empty
2. Updated `backend/package.json` start command to run auto-seed

### How It Works:
- On every server restart, it checks if any users exist
- If database is empty → seeds automatically
- If users exist → skips seeding (safe to run multiple times)

### Next Steps:
1. **Commit and push the changes** to your GitHub repository
2. Render will automatically redeploy
3. Check backend logs - you should see:
   ```
   🌱 No users found. Seeding database...
   ✅ Admin user created: admin@orderms.com
   ✅ Stock Keeper user created: stock@orderms.com
   ✅ Business Owner user created: business@dressshop.com
   ✅ Tenant created: Elegant Dress Orders
   🎉 Database seeded successfully!
   ```
4. **Try logging in** with: `admin@orderms.com` / `admin123`

---

## ✅ Solution 2: Seed via API Endpoint (BACKUP)

If auto-seed doesn't work, you can seed via an HTTP request.

### Step 1: Call the Seed Endpoint

**Using curl** (from your terminal):
```bash
curl -X POST https://asanorder.onrender.com/api/auth/seed \
  -H "Content-Type: application/json"
```

**Using browser**:
1. Open: `https://asanorder.onrender.com/api/auth/seed`
2. Use a browser extension like "REST Client" or "Postman" to send POST request

**Using JavaScript** (in browser console):
```javascript
fetch('https://asanorder.onrender.com/api/auth/seed', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(console.log)
.catch(console.error)
```

### Expected Response:
```json
{
  "message": "Database seeded successfully!",
  "usersCreated": {
    "admin": "admin@orderms.com",
    "stockKeeper": "stock@orderms.com",
    "businessOwner": "business@dressshop.com"
  },
  "tenant": "Elegant Dress Orders",
  "credentials": {
    "admin": "admin@orderms.com / admin123",
    "businessOwner": "business@dressshop.com / business123",
    "stockKeeper": "stock@orderms.com / stock123"
  }
}
```

**If users already exist**, you'll get:
```json
{
  "message": "Database already has X user(s). No seeding needed.",
  "usersExist": true
}
```

---

## 🚀 Quick Start (Right Now)

### Option A: Wait for Auto-Redeploy
1. The code changes are ready
2. Commit and push to GitHub
3. Render will auto-deploy
4. Check logs after deployment

### Option B: Use API Endpoint (Immediate)
1. Open your browser
2. Go to: `https://asanorder.onrender.com/api/auth/seed`
3. Or use curl:
   ```bash
   curl -X POST https://asanorder.onrender.com/api/auth/seed
   ```

---

## 📋 Default Login Credentials

After seeding, use these credentials:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@orderms.com` | `admin123` |
| Business Owner | `business@dressshop.com` | `business123` |
| Stock Keeper | `stock@orderms.com` | `stock123` |

---

## ✅ Verification

After seeding, verify it worked:

### 1. Test Login API
```bash
curl -X POST https://asanorder.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@orderms.com","password":"admin123"}'
```

**Expected**: JSON response with `token` and `user` fields

### 2. Test Login in Frontend
1. Go to: https://asanorderui.onrender.com
2. Login with: `admin@orderms.com` / `admin123`
3. Should redirect to admin dashboard

---

## 🔍 Troubleshooting

### Auto-seed didn't run?
- Check backend logs for errors
- Verify `auto-seed.js` file exists in `backend/` directory
- Check start command in `package.json` includes `node auto-seed.js`

### API endpoint returns error?
- Check backend logs for specific error
- Verify database connection is working
- Ensure migrations ran successfully

### Still can't login?
1. Verify seed ran successfully (check logs or API response)
2. Try the API endpoint method (Solution 2)
3. Check backend logs for any errors during login attempt

---

## 📝 Files Changed

1. **`backend/auto-seed.js`** (NEW) - Auto-seeding script
2. **`backend/package.json`** - Updated start command
3. **`backend/routes/auth.js`** - Added `/api/auth/seed` endpoint

---

## 🎯 Recommended Approach

**Use Solution 1 (Auto-Seed)** - It's automatic and will work on every deployment. The API endpoint (Solution 2) is there as a backup if needed.

---

**Need Help?**
- Check backend logs in Render dashboard
- Verify all environment variables are set
- Test the seed endpoint directly

