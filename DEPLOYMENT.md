# Deployment Guide

This guide will help you deploy your Order Management System to GitHub and Render.com.

## 🚀 Prerequisites

1. **GitHub Account** - For version control
2. **Render.com Account** - For hosting
3. **Cloud Database** - SQL Server instance (Azure SQL, AWS RDS, or similar)
4. **Domain (Optional)** - For custom domain setup

## 📋 Pre-Deployment Checklist

- [x] ✅ Project structure is ready
- [x] ✅ Environment configuration files created
- [x] ✅ Render.com configuration added
- [x] ✅ Build scripts updated
- [x] ✅ API service configured for production
- [x] ✅ .gitignore updated

## 🔧 Step 1: GitHub Setup

### 1.1 Initialize Git Repository
```bash
# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Order Management System"

# Add remote origin (replace with your GitHub repo URL)
git remote add origin https://github.com/yourusername/asanOrder.git

# Push to GitHub
git push -u origin main
```

### 1.2 GitHub Repository Settings
- Go to your GitHub repository
- Navigate to Settings > Secrets and variables > Actions
- Add the following secrets if needed:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `OPENAI_API_KEY`

## 🌐 Step 2: Render.com Setup

### 2.1 Database Setup
You have several options for MS SQL Server hosting:

**Option 1: Azure SQL Database (Recommended)**
1. Create an Azure SQL Database
2. Get the connection string
3. Update your `DATABASE_URL` in environment variables

**Option 2: AWS RDS SQL Server**
1. Create an RDS SQL Server instance
2. Get the connection string
3. Update your `DATABASE_URL` in environment variables

**Option 3: CloudClusters (as mentioned in your env.example)**
1. Use your existing CloudClusters SQL Server
2. Update the connection string for production

**Option 4: Self-hosted SQL Server**
1. Set up SQL Server on a VPS
2. Configure firewall and security
3. Update connection string

### 2.2 Backend Deployment
1. **Create Web Service:**
   - Go to Render.com dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name:** `asanorder-backend`
     - **Environment:** `Node`
     - **Build Command:** `cd backend && npm install && npx prisma generate`
     - **Start Command:** `cd backend && npm start`
     - **Plan:** Free

2. **Environment Variables:**
   ```
   NODE_ENV=production
   DATABASE_URL=sqlserver://your-server:1433;database=asanorder;user=username;password=password;encrypt=true;trustServerCertificate=true
   JWT_SECRET=your-jwt-secret
   PORT=10000
   UPLOAD_DIR=uploads
   MAX_FILE_SIZE=5242880
   OPENAI_API_KEY=your-openai-key
   ```

### 2.3 Frontend Deployment
1. **Create Static Site:**
   - Go to Render.com dashboard
   - Click "New +" → "Static Site"
   - Connect your GitHub repository
   - Configure:
     - **Name:** `asanorder-frontend`
     - **Build Command:** `cd frontend && npm install && npm run build`
     - **Publish Directory:** `frontend/dist`
     - **Plan:** Free

2. **Environment Variables:**
   ```
   VITE_API_URL=https://asanorder-backend.onrender.com
   ```

## 🔄 Step 3: Database Migration

### 3.1 Verify Prisma Schema for SQL Server
Your current schema is already configured for SQL Server:
```prisma
// backend/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}
```

### 3.2 Run Migrations
```bash
# In your local backend directory
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

## 🚀 Step 4: Deploy

### 4.1 Deploy Backend
1. Push your changes to GitHub
2. Render.com will automatically build and deploy
3. Check the logs for any errors
4. Note the backend URL (e.g., `https://asanorder-backend.onrender.com`)

### 4.2 Deploy Frontend
1. Update `frontend/env.production` with your backend URL
2. Push changes to GitHub
3. Render.com will build and deploy the frontend
4. Note the frontend URL (e.g., `https://asanorder-frontend.onrender.com`)

## 🔧 Step 5: Post-Deployment Configuration

### 5.1 Update CORS Settings
In your backend `server.js`, update CORS to allow your frontend domain:
```javascript
app.use(cors({
  origin: ['https://asanorder-frontend.onrender.com', 'http://localhost:3000'],
  credentials: true
}));
```

### 5.2 File Storage Considerations
- **Current Setup:** Files are stored locally on Render.com
- **Limitation:** Files may be lost on server restart
- **Recommendation:** Use cloud storage (AWS S3, Cloudinary) for production

### 5.3 SSL/HTTPS
- Render.com provides free SSL certificates
- Your app will be accessible via HTTPS automatically

## 🧪 Step 6: Testing

### 6.1 Test Backend
```bash
# Health check
curl https://asanorder-backend.onrender.com/api/health

# Test API endpoints
curl https://asanorder-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@orderms.com","password":"admin123"}'
```

### 6.2 Test Frontend
1. Visit your frontend URL
2. Test login functionality
3. Test form creation and submission
4. Test file uploads

## 🔍 Troubleshooting

### Common Issues

1. **Build Failures:**
   - Check Render.com build logs
   - Ensure all dependencies are in package.json
   - Verify build commands are correct

2. **Database Connection Issues:**
   - Verify DATABASE_URL format
   - Check if database is accessible
   - Ensure Prisma schema matches database provider

3. **CORS Issues:**
   - Update CORS settings in backend
   - Check frontend API URL configuration

4. **File Upload Issues:**
   - Check file size limits
   - Verify upload directory permissions
   - Consider using cloud storage

### Debug Commands
```bash
# Check backend logs
# Go to Render.com dashboard → Your service → Logs

# Test database connection locally
cd backend
npx prisma db pull

# Test frontend build locally
cd frontend
npm run build
npm run preview
```

## 📊 Monitoring

### Render.com Dashboard
- Monitor service health
- Check resource usage
- View logs and errors
- Set up alerts

### Database Monitoring
- Monitor database performance
- Check connection limits
- Monitor storage usage

## 🔄 Updates and Maintenance

### Deploying Updates
1. Make changes locally
2. Test thoroughly
3. Commit and push to GitHub
4. Render.com will automatically redeploy

### Database Migrations
```bash
# Create migration
cd backend
npx prisma migrate dev --name your-migration-name

# Deploy migration
npx prisma migrate deploy
```

## 🎯 Production Checklist

- [ ] Database is properly configured
- [ ] Environment variables are set
- [ ] CORS is configured correctly
- [ ] File storage is set up (cloud storage recommended)
- [ ] SSL certificates are active
- [ ] Monitoring is set up
- [ ] Backup strategy is in place
- [ ] Error logging is configured
- [ ] Performance monitoring is active

## 📞 Support

If you encounter issues:
1. Check Render.com logs
2. Verify environment variables
3. Test locally first
4. Check GitHub issues
5. Review this deployment guide

---

**Your Order Management System is now ready for production! 🎉**
