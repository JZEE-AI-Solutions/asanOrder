# PostgreSQL Port Configuration

## Issue
You have both PostgreSQL 17 and 18 running. Port 5432 might be used by PostgreSQL 17, and PostgreSQL 18 might be on a different port.

## Quick Fix Options

### Option 1: Check Port in pgAdmin
1. Open pgAdmin
2. Right-click on "PostgreSQL 18" server
3. Click "Properties"
4. Check the "Port" field
5. Update `.env` file with the correct port

### Option 2: Use PostgreSQL 17 Instead
If PostgreSQL 17 is on port 5432 and working, we can use that:
- Keep the connection string as is
- Make sure password works for PostgreSQL 17

### Option 3: Find PostgreSQL 18 Port
Check the configuration file or use pgAdmin to find the port.

## Current Connection String
```
DATABASE_URL="postgresql://postgres:pass%40word1@localhost:5432/asanOrder?schema=public"
```

If PostgreSQL 18 is on port 5433, change to:
```
DATABASE_URL="postgresql://postgres:pass%40word1@localhost:5433/asanOrder?schema=public"
```

## Next Steps
Once we know the correct port and password, I'll continue with the migration!

