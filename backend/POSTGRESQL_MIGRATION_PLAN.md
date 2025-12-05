# PostgreSQL Migration Plan - Safe & Non-Breaking

## 🎯 Migration Overview

**Goal**: Migrate from SQL Server to PostgreSQL while keeping Prisma, without breaking anything.

**Estimated Time**: 4-6 hours (with testing)

**Risk Level**: Low (with proper backup and testing)

---

## 📋 Pre-Migration Checklist

### ✅ Prerequisites
- [ ] PostgreSQL installed and running (local or hosted)
- [ ] Backup of current SQL Server database
- [ ] Test environment available
- [ ] All current optimizations applied and tested
- [ ] Team notified of migration window

### ✅ Required Tools
- [ ] PostgreSQL client (psql) or GUI tool (pgAdmin)
- [ ] Data export/import tool (pg_dump, or custom script)
- [ ] Access to both SQL Server and PostgreSQL

---

## 🔄 Migration Steps

### Phase 1: Preparation (30 minutes)

#### Step 1.1: Backup Current Database
```bash
# SQL Server backup (if using SQL Server Management Studio)
# Or use Prisma to export data
cd backend
node scripts/export-data.js
```

#### Step 1.2: Set Up PostgreSQL Database
```bash
# Create PostgreSQL database
createdb asanOrder

# Or using psql
psql -U postgres
CREATE DATABASE asanOrder;
\q
```

#### Step 1.3: Update Prisma Schema for PostgreSQL

**File**: `backend/prisma/schema.prisma`

**Changes Needed**:
1. Change provider from `sqlserver` to `postgresql`
2. Replace `@db.NVarChar(Max)` with `@db.Text`

---

### Phase 2: Schema Migration (1 hour)

#### Step 2.1: Update Prisma Schema

**Before** (SQL Server):
```prisma
datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}

model FormField {
  selectedProducts String?  @db.NVarChar(Max)
}

model Order {
  selectedProducts   String?   @db.NVarChar(Max)
  productQuantities  String?   @db.NVarChar(Max)
  productPrices      String?   @db.NVarChar(Max)
}
```

**After** (PostgreSQL):
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model FormField {
  selectedProducts String?  @db.Text
}

model Order {
  selectedProducts   String?   @db.Text
  productQuantities  String?   @db.Text
  productPrices      String?   @db.Text
}
```

#### Step 2.2: Generate New Prisma Client
```bash
cd backend
npx prisma generate
```

#### Step 2.3: Create Initial Migration
```bash
# This will create the schema in PostgreSQL
npx prisma migrate dev --name init_postgresql
```

---

### Phase 3: Data Migration (2-3 hours)

#### Step 3.1: Export Data from SQL Server

Create export script: `backend/scripts/export-sqlserver-data.js`

#### Step 3.2: Transform Data (if needed)

PostgreSQL handles most data types the same, but:
- `NVARCHAR(MAX)` → `TEXT` (automatic)
- `DATETIME2` → `TIMESTAMP` (automatic)
- `BIT` → `BOOLEAN` (automatic)

#### Step 3.3: Import Data to PostgreSQL

Create import script: `backend/scripts/import-postgresql-data.js`

---

### Phase 4: Code Updates (30 minutes)

#### Step 4.1: Update Connection String

**File**: `.env` or `backend/.env`

**Before** (SQL Server):
```
DATABASE_URL="sqlserver://host:port;database=asanOrder;user=user;password=pass;encrypt=true;trustServerCertificate=true"
```

**After** (PostgreSQL):
```
DATABASE_URL="postgresql://user:password@host:port/asanOrder?schema=public"
```

#### Step 4.2: Update Raw SQL Queries (if any)

**Files to Check**:
- `backend/apply-performance-indexes.js`
- `backend/add-missing-columns-direct.js`
- Any other files using `$queryRaw` or `$executeRaw`

**SQL Server Syntax**:
```sql
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_orders_tenantId')
BEGIN
    CREATE INDEX IX_orders_tenantId ON orders(tenantId);
END
```

**PostgreSQL Syntax**:
```sql
CREATE INDEX IF NOT EXISTS IX_orders_tenantId ON orders(tenantId);
```

---

### Phase 5: Testing (1-2 hours)

#### Step 5.1: Test Database Connection
```bash
cd backend
node scripts/test-postgresql-connection.js
```

#### Step 5.2: Test All API Endpoints
- [ ] Login/Authentication
- [ ] Orders CRUD
- [ ] Products CRUD
- [ ] Forms CRUD
- [ ] Purchase Invoices
- [ ] Customers
- [ ] Dashboard stats

#### Step 5.3: Test Data Integrity
- [ ] Verify all records migrated
- [ ] Check foreign key relationships
- [ ] Verify indexes created
- [ ] Test transactions

---

### Phase 6: Deployment (30 minutes)

#### Step 6.1: Update Production Environment
1. Update `.env` with PostgreSQL connection string
2. Run migrations: `npx prisma migrate deploy`
3. Restart server

#### Step 6.2: Monitor
- Check error logs
- Monitor query performance
- Verify all features working

---

## 🔧 Detailed Implementation

### Step 1: Update Prisma Schema

**File**: `backend/prisma/schema.prisma`

**Changes**:
1. Line 6: `provider = "sqlserver"` → `provider = "postgresql"`
2. Line 75: `@db.NVarChar(Max)` → `@db.Text`
3. Line 98-100: `@db.NVarChar(Max)` → `@db.Text` (3 instances)

### Step 2: Update Connection String Format

**PostgreSQL Connection String Format**:
```
postgresql://[user]:[password]@[host]:[port]/[database]?schema=public
```

**Example**:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/asanOrder?schema=public"
```

### Step 3: Update Raw SQL Scripts

**Files to Update**:
1. `backend/apply-performance-indexes.js` - Convert SQL Server index syntax to PostgreSQL
2. `backend/add-missing-columns-direct.js` - Convert column checks to PostgreSQL
3. Any migration scripts using SQL Server-specific syntax

**PostgreSQL Index Syntax**:
```sql
-- PostgreSQL
CREATE INDEX IF NOT EXISTS index_name ON table_name(column_name);
```

**PostgreSQL Column Check**:
```sql
-- PostgreSQL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'forms' AND column_name = 'formCategory'
    ) THEN
        ALTER TABLE forms ADD COLUMN formCategory TEXT NOT NULL DEFAULT 'SIMPLE_CART';
    END IF;
END $$;
```

---

## 📊 Data Migration Scripts

### Export Script (SQL Server → JSON)
```javascript
// backend/scripts/export-sqlserver-data.js
// Exports all data to JSON files for safe migration
```

### Import Script (JSON → PostgreSQL)
```javascript
// backend/scripts/import-postgresql-data.js
// Imports JSON data into PostgreSQL
```

---

## ⚠️ Potential Issues & Solutions

### Issue 1: Case Sensitivity
**Problem**: PostgreSQL is case-sensitive, SQL Server is not
**Solution**: Use lowercase table/column names (Prisma handles this)

### Issue 2: String Length Limits
**Problem**: `NVARCHAR(MAX)` vs `TEXT`
**Solution**: Both are unlimited in practice, Prisma maps correctly

### Issue 3: Date/Time Formats
**Problem**: Different default formats
**Solution**: Prisma handles conversion automatically

### Issue 4: Boolean Types
**Problem**: SQL Server uses `BIT`, PostgreSQL uses `BOOLEAN`
**Solution**: Prisma handles conversion automatically

### Issue 5: Index Names
**Problem**: PostgreSQL index names must be unique per database
**Solution**: Use descriptive names or let Prisma generate them

---

## 🔄 Rollback Plan

If migration fails:

1. **Revert Connection String**
   ```bash
   # Change DATABASE_URL back to SQL Server
   ```

2. **Revert Prisma Schema**
   ```bash
   git checkout backend/prisma/schema.prisma
   npx prisma generate
   ```

3. **Restore Database** (if needed)
   ```bash
   # Restore from backup
   ```

4. **Restart Server**
   ```bash
   npm start
   ```

---

## ✅ Post-Migration Checklist

- [ ] All API endpoints working
- [ ] Data integrity verified
- [ ] Performance acceptable (< 200ms)
- [ ] Indexes created successfully
- [ ] No errors in logs
- [ ] Frontend connecting correctly
- [ ] All features tested
- [ ] Team notified of completion

---

## 📝 Migration Scripts to Create

1. ✅ `backend/scripts/export-sqlserver-data.js` - Export data
2. ✅ `backend/scripts/import-postgresql-data.js` - Import data
3. ✅ `backend/scripts/test-postgresql-connection.js` - Test connection
4. ✅ `backend/scripts/verify-migration.js` - Verify data integrity
5. ✅ `backend/scripts/update-indexes-postgresql.js` - Create indexes

---

## 🎯 Success Criteria

Migration is successful when:
- ✅ All data migrated (100% records)
- ✅ All API endpoints working
- ✅ Performance < 200ms (as per requirements)
- ✅ No data loss
- ✅ All relationships intact
- ✅ Indexes created
- ✅ Zero errors in production

---

## 📞 Support

If you encounter issues:
1. Check PostgreSQL logs
2. Verify connection string
3. Check Prisma migration status
4. Review error messages
5. Test with simple queries first

---

## 🚀 Next Steps

1. Review this plan
2. Set up PostgreSQL database
3. Create backup of SQL Server
4. Follow steps in order
5. Test thoroughly before production

