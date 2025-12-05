# Update .env File for PostgreSQL

## ⚠️ IMPORTANT: Manual Step Required

You need to update your `backend/.env` file with the PostgreSQL connection string.

### Current Status
- ✅ PostgreSQL 18 installed
- ✅ Password: `a3a295709073466a802bce04bac346c0`
- ⏳ Need to update `.env` file

### Steps

1. **Open** `backend/.env` file (create it if it doesn't exist)

2. **Add or Update** the `DATABASE_URL` line:

```env
DATABASE_URL="postgresql://postgres:a3a295709073466a802bce04bac346c0@localhost:5432/asanOrder?schema=public"
```

3. **Full .env file should look like:**

```env
# PostgreSQL Connection String
DATABASE_URL="postgresql://postgres:a3a295709073466a802bce04bac346c0@localhost:5432/asanOrder?schema=public"

# JWT Secret (keep your existing one if you have it)
JWT_SECRET=your_jwt_secret_here

# Node Environment
NODE_ENV=development
```

### Connection String Breakdown

- **Protocol**: `postgresql://`
- **Username**: `postgres`
- **Password**: `a3a295709073466a802bce04bac346c0`
- **Host**: `localhost`
- **Port**: `5432` (default PostgreSQL port)
- **Database**: `asanOrder` (will be created automatically)
- **Schema**: `public` (default schema)

### After Updating .env

Once you've updated the `.env` file, let me know and I'll continue with:
1. Creating the database
2. Generating Prisma client
3. Creating schema
4. Importing data
5. Creating indexes
6. Testing

---

## Quick Command to Create .env (if needed)

If you don't have a `.env` file, you can create it with:

```powershell
cd backend
@"
DATABASE_URL="postgresql://postgres:a3a295709073466a802bce04bac346c0@localhost:5432/asanOrder?schema=public"
JWT_SECRET=your_jwt_secret_here
NODE_ENV=development
"@ | Out-File -FilePath .env -Encoding utf8
```

