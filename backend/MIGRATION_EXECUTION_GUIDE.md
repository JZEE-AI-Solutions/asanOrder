# PostgreSQL Migration - Execution Guide

## ✅ Completed Steps

### 1. Data Export ✅
**Status**: Successfully completed
- All data exported to `backend/data-export/`
- **Total Records Exported**:
  - 7 users
  - 5 tenants
  - 4 forms
  - 34 form_fields
  - 14 products
  - 9 purchase_invoices
  - 21 purchase_items
  - 62 product_logs
  - 1 customers
  - 2 customer_logs
  - 2 orders
  - 3 returns
  - 3 return_items

### 2. Prisma Schema Updated ✅
**Status**: Completed
- Provider changed: `sqlserver` → `postgresql`
- Data types updated: `@db.NVarChar(Max)` → `@db.Text` (4 instances)
- File: `backend/prisma/schema.prisma`

---

## 🔄 Next Steps (Manual - Required)

### Step 3: Set Up PostgreSQL Database

**Option A: Local PostgreSQL**
```bash
# Install PostgreSQL (if not installed)
# Download from: https://www.postgresql.org/download/windows/

# Create database
createdb asanOrder

# Or using psql
psql -U postgres
CREATE DATABASE asanOrder;
\q
```

**Option B: Cloud PostgreSQL (Recommended)**
- Use services like:
  - **Supabase** (Free tier available): https://supabase.com
  - **Neon** (Free tier): https://neon.tech
  - **Railway** (Free tier): https://railway.app
  - **Render** (Free tier): https://render.com

### Step 4: Update Connection String

**Create or update**: `backend/.env`

**Add PostgreSQL connection string:**
```env
# PostgreSQL Connection String
DATABASE_URL="postgresql://username:password@host:port/asanOrder?schema=public"
```

**Examples:**

**Local PostgreSQL:**
```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/asanOrder?schema=public"
```

**Supabase:**
```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public"
```

**Neon:**
```env
DATABASE_URL="postgresql://[user]:[password]@[hostname]/[dbname]?sslmode=require"
```

### Step 5: Stop Your Server (IMPORTANT)

**Before proceeding, stop your backend server:**
- If running in terminal: Press `Ctrl+C`
- If running as service: Stop the service
- This is needed to unlock Prisma files

### Step 6: Generate Prisma Client

```bash
cd backend
npx prisma generate
```

**Expected output:**
```
✔ Generated Prisma Client
```

### Step 7: Create Database Schema

```bash
npx prisma migrate dev --name init_postgresql
```

**This will:**
- Create all tables in PostgreSQL
- Set up relationships
- Create indexes
- Set up constraints

### Step 8: Import Data

```bash
node scripts/import-postgresql-data.js
```

**This will import all exported data from SQL Server to PostgreSQL**

### Step 9: Create Performance Indexes

```bash
node scripts/update-indexes-postgresql.js
```

**This creates all the performance indexes we had in SQL Server**

### Step 10: Test Connection

```bash
node scripts/test-postgresql-connection.js
```

**This verifies:**
- Connection works
- Tables exist
- Data is accessible

### Step 11: Update db.js (Optional)

**File**: `backend/lib/db.js`

Update the connection message:
```javascript
console.log('✅ Connected to PostgreSQL successfully');
```

---

## 🔍 Verification Checklist

After completing all steps, verify:

- [ ] PostgreSQL database created
- [ ] Connection string in `.env` file
- [ ] Prisma client generated
- [ ] Database schema created (tables exist)
- [ ] Data imported successfully
- [ ] Indexes created
- [ ] Connection test passed
- [ ] Server starts without errors
- [ ] Login works
- [ ] Dashboard loads
- [ ] All API endpoints working

---

## 🧪 Testing After Migration

### 1. Test Login
```bash
# Start server
npm start

# Test login endpoint
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@orderms.com","password":"yourpassword"}'
```

### 2. Test API Endpoints
- Login: `POST /api/auth/login`
- Dashboard: `GET /api/order/stats/dashboard`
- Orders: `GET /api/order`
- Forms: `GET /api/form`
- Products: `GET /api/product`

### 3. Check Performance
- All APIs should be < 200ms
- Dashboard should load quickly
- No errors in console

---

## ⚠️ Troubleshooting

### Issue: Prisma Generate Fails
**Solution**: Stop your server first, then run `npx prisma generate`

### Issue: Connection Refused
**Solution**: 
- Check PostgreSQL is running
- Verify connection string
- Check firewall settings

### Issue: Database Not Found
**Solution**: 
- Create database: `createdb asanOrder`
- Or use: `CREATE DATABASE asanOrder;` in psql

### Issue: Import Fails
**Solution**:
- Check data-export folder exists
- Verify JSON files are valid
- Check foreign key constraints

### Issue: Migration Fails
**Solution**:
- Check PostgreSQL version (needs 12+)
- Verify user has CREATE permissions
- Check connection string format

---

## 🔄 Rollback Plan

If migration fails and you need to rollback:

1. **Revert Prisma Schema:**
   ```bash
   git checkout backend/prisma/schema.prisma
   ```

2. **Restore SQL Server Connection:**
   ```bash
   # Update .env with SQL Server connection string
   DATABASE_URL="sqlserver://..."
   ```

3. **Regenerate Prisma Client:**
   ```bash
   npx prisma generate
   ```

4. **Restart Server:**
   ```bash
   npm start
   ```

**Your data is safe** - it's exported in `backend/data-export/`

---

## 📊 Current Status

✅ **Completed:**
- Data exported (all tables)
- Prisma schema updated
- Migration scripts ready

⏳ **Pending (Manual Steps):**
- Set up PostgreSQL database
- Update connection string
- Generate Prisma client
- Create schema
- Import data
- Create indexes
- Test connection

---

## 🚀 Quick Command Reference

```bash
# 1. Stop server (if running)
# Ctrl+C in server terminal

# 2. Generate Prisma client
cd backend
npx prisma generate

# 3. Create schema
npx prisma migrate dev --name init_postgresql

# 4. Import data
node scripts/import-postgresql-data.js

# 5. Create indexes
node scripts/update-indexes-postgresql.js

# 6. Test connection
node scripts/test-postgresql-connection.js

# 7. Start server
npm start
```

---

## 📞 Need Help?

1. Check `POSTGRESQL_MIGRATION_PLAN.md` for detailed steps
2. Review error messages carefully
3. Verify PostgreSQL is running
4. Check connection string format
5. Ensure all prerequisites are met

---

## ✅ Success Criteria

Migration is successful when:
- ✅ All data imported (check record counts)
- ✅ All API endpoints working
- ✅ Performance < 200ms
- ✅ No errors in logs
- ✅ Login works
- ✅ Dashboard loads

Good luck with the migration! 🚀

