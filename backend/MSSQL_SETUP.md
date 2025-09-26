# MS SQL Server Setup Guide

This guide will help you migrate from SQLite to MS SQL Server for the Dress Shop application.

## Prerequisites

### 1. Install MS SQL Server

#### Option A: SQL Server Express (Free)
- Download from: https://www.microsoft.com/en-us/sql-server/sql-server-downloads
- Choose "Express" edition (free)
- Install with default settings
- Note the instance name (usually "SQLEXPRESS")

#### Option B: SQL Server Developer Edition (Free)
- Download from: https://www.microsoft.com/en-us/sql-server/sql-server-downloads
- Choose "Developer" edition (free)
- Install with default settings

#### Option C: Docker (Recommended for Development)
```bash
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=YourPassword123!" -p 1433:1433 --name sqlserver -d mcr.microsoft.com/mssql/server:2022-latest
```

### 2. Install SQL Server Management Studio (SSMS)
- Download from: https://docs.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms
- This is optional but helpful for database management

## Database Setup

### 1. Create Database
Connect to your SQL Server instance and run:
```sql
CREATE DATABASE dressshop;
GO
```

### 2. Configure Connection String
Update your `.env` file with the correct connection string:

```env
# For local SQL Server Express
DATABASE_URL="sqlserver://localhost\\SQLEXPRESS:1433;database=dressshop;user=sa;password=YourPassword123!;encrypt=true;trustServerCertificate=true"

# For local SQL Server (default instance)
DATABASE_URL="sqlserver://localhost:1433;database=dressshop;user=sa;password=YourPassword123!;encrypt=true;trustServerCertificate=true"

# For Docker
DATABASE_URL="sqlserver://localhost:1433;database=dressshop;user=sa;password=YourPassword123!;encrypt=true;trustServerCertificate=true"
```

### 3. Run Setup Script
```bash
cd backend
node scripts/setup-mssql.js
```

## Migration Steps

### 1. Install Dependencies
```bash
npm install mssql @prisma/client
```

### 2. Update Prisma Schema
The schema has been updated to use MS SQL Server. Key changes:
- Changed provider from "sqlite" to "sqlserver"
- Added BLOB fields for image storage
- Added proper data types for MS SQL Server

### 3. Run Migrations
```bash
npx prisma migrate deploy
```

### 4. Generate Prisma Client
```bash
npx prisma generate
```

### 5. Test Connection
```bash
npm start
```

## Image Storage

### Database Storage (Recommended)
Images are now stored as BLOB data in the database:
- `imageData` - Binary image data
- `imageType` - MIME type (image/jpeg, image/png, etc.)

### API Endpoints
- `GET /api/images/:entityType/:entityId` - Serve image
- `POST /api/images/:entityType/:entityId` - Upload image
- `DELETE /api/images/:entityType/:entityId` - Delete image
- `GET /api/images/:entityType/:entityId/info` - Get image metadata

### Usage Examples

#### Upload Image
```javascript
const response = await fetch('/api/images/product/123', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    imageData: base64ImageData,
    mimeType: 'image/jpeg'
  })
});
```

#### Display Image
```html
<img src="/api/images/product/123" alt="Product Image" />
```

## Troubleshooting

### Connection Issues
1. **Check SQL Server is running**
   ```bash
   # Windows
   services.msc
   # Look for "SQL Server (SQLEXPRESS)" or "SQL Server (MSSQLSERVER)"
   ```

2. **Check port 1433**
   ```bash
   netstat -an | findstr :1433
   ```

3. **Test connection with sqlcmd**
   ```bash
   sqlcmd -S localhost -U sa -P YourPassword123!
   ```

### Authentication Issues
1. **Enable SQL Server Authentication**
   - Open SSMS
   - Right-click server → Properties → Security
   - Select "SQL Server and Windows Authentication mode"
   - Restart SQL Server service

2. **Check SA account**
   ```sql
   ALTER LOGIN sa ENABLE;
   ALTER LOGIN sa WITH PASSWORD = 'YourPassword123!';
   ```

### Database Issues
1. **Check database exists**
   ```sql
   SELECT name FROM sys.databases WHERE name = 'dressshop';
   ```

2. **Check permissions**
   ```sql
   USE dressshop;
   EXEC sp_helpuser;
   ```

## Performance Considerations

### Image Storage
- **Database BLOB**: Better for small images (< 1MB)
- **File System**: Better for large images (> 1MB)
- **Hybrid**: Store metadata in DB, files on disk

### Database Optimization
- Add indexes on frequently queried fields
- Use connection pooling
- Monitor query performance

## Backup and Recovery

### Backup Database
```sql
BACKUP DATABASE dressshop TO DISK = 'C:\backup\dressshop.bak';
```

### Restore Database
```sql
RESTORE DATABASE dressshop FROM DISK = 'C:\backup\dressshop.bak';
```

## Security Best Practices

1. **Use strong passwords**
2. **Enable encryption**
3. **Limit network access**
4. **Regular security updates**
5. **Backup regularly**

## Support

If you encounter issues:
1. Check the console logs
2. Verify connection string
3. Test with SSMS
4. Check firewall settings
5. Review SQL Server error logs

## Next Steps

After successful migration:
1. Test all functionality
2. Update frontend image URLs
3. Set up monitoring
4. Configure backups
5. Optimize performance
