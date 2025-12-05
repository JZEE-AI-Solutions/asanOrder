# PostgreSQL Migration - Quick Start Guide

## 🚀 Quick Migration Steps

### Step 1: Backup Current Database (5 min)
```bash
cd backend
node scripts/export-sqlserver-data.js
```

### Step 2: Set Up PostgreSQL Database (5 min)
```bash
# Create database
createdb asanOrder

# Or using psql
psql -U postgres
CREATE DATABASE asanOrder;
\q
```

### Step 3: Update Prisma Schema (2 min)

**Option A: Use the prepared schema file**
```bash
cd backend
cp prisma/schema.postgresql.prisma prisma/schema.prisma
```

**Option B: Manual update**
1. Open `backend/prisma/schema.prisma`
2. Change line 6: `provider = "sqlserver"` → `provider = "postgresql"`
3. Change line 75: `@db.NVarChar(Max)` → `@db.Text`
4. Change lines 98-100: `@db.NVarChar(Max)` → `@db.Text` (3 instances)

### Step 4: Update Connection String (1 min)

**File**: `backend/.env`

**Change from**:
```
DATABASE_URL="sqlserver://host:port;database=asanOrder;user=user;password=pass;encrypt=true;trustServerCertificate=true"
```

**Change to**:
```
DATABASE_URL="postgresql://user:password@host:port/asanOrder?schema=public"
```

**Example**:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/asanOrder?schema=public"
```

### Step 5: Generate Prisma Client (1 min)
```bash
cd backend
npx prisma generate
```

### Step 6: Create Database Schema (2 min)
```bash
npx prisma migrate dev --name init_postgresql
```

### Step 7: Import Data (5-10 min)
```bash
node scripts/import-postgresql-data.js
```

### Step 8: Create Indexes (1 min)
```bash
node scripts/update-indexes-postgresql.js
```

### Step 9: Test Connection (1 min)
```bash
node scripts/test-postgresql-connection.js
```

### Step 10: Test Your App (5 min)
```bash
npm start
# Test all endpoints
```

## ✅ Verification Checklist

- [ ] Data exported successfully
- [ ] PostgreSQL database created
- [ ] Prisma schema updated
- [ ] Connection string updated
- [ ] Prisma client generated
- [ ] Database schema created
- [ ] Data imported successfully
- [ ] Indexes created
- [ ] Connection test passed
- [ ] All API endpoints working

## 🔄 Rollback (If Needed)

1. Revert connection string to SQL Server
2. Revert schema: `git checkout backend/prisma/schema.prisma`
3. Regenerate: `npx prisma generate`
4. Restart server

## 📞 Need Help?

See detailed plan: `backend/POSTGRESQL_MIGRATION_PLAN.md`

