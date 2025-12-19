# Complete Guide: Deploying to Render.com

This guide will walk you through deploying your Order Management System to Render.com, including both the backend API and frontend.

## Prerequisites

1. **Render.com Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: Your code should be in a GitHub repository
3. **Database**: You'll need a PostgreSQL database (Render provides this)

---

## Step 1: Set Up PostgreSQL Database on Render

1. **Go to Render Dashboard** → Click **"New +"** → Select **"PostgreSQL"**

2. **Configure Database**:
   - **Name**: `asanorder-db` (or your preferred name)
   - **Database**: `asanorder` (or your preferred name)
   - **User**: `asanorder_user` (auto-generated, or your choice)
   - **Region**: Choose closest to your users
   - **PostgreSQL Version**: 15 or 16 (recommended)
   - **Plan**: Free tier is fine for testing, upgrade for production

3. **Save the Internal Database URL**:
   - After creation, Render will show you the **Internal Database URL**
   - It looks like: `postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/asanorder`
   - **Copy this URL** - you'll need it for the backend service

---

## Step 2: Deploy Backend API

1. **Go to Render Dashboard** → Click **"New +"** → Select **"Web Service"**

2. **Connect Your Repository**:
   - Connect your GitHub account if not already connected
   - Select your repository: `asanOrder` (or your repo name)
   - Click **"Connect"**

3. **Configure Backend Service**:
   - **Name**: `asanorder-api` (or your preferred name)
   - **Region**: Same as your database
   - **Branch**: `main` (or your production branch)
   - **Root Directory**: Leave empty (root of repo)
   - **Runtime**: `Node`
   - **Build Command**: 
     ```bash
     npm install && cd backend && npm install && npx prisma generate
     ```
   - **Start Command**: 
     ```bash
     cd backend && npx prisma migrate deploy && node server.js
     ```
   - **Plan**: Free tier for testing, upgrade for production

4. **Environment Variables** (Click "Add Environment Variable"):
   ```
   NODE_ENV=production
   DATABASE_URL=<paste-internal-database-url-from-step-1>
   JWT_SECRET=<generate-a-strong-random-secret>
   PORT=10000
   UPLOAD_DIR=uploads
   MAX_FILE_SIZE=5242880
   OPENAI_API_KEY=<your-openai-api-key-if-using-invoice-scanning>
   ```

   **Important Notes**:
   - Use the **Internal Database URL** from your PostgreSQL service
   - Generate a strong `JWT_SECRET`:
     - **Windows PowerShell**: `[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))`
     - **Linux/Mac**: `openssl rand -base64 32`
   - `PORT` should be `10000` or use `$PORT` (Render sets this automatically)
   - Add `FRONTEND_URL` after frontend is deployed (for CORS): `https://asanorderui.onrender.com`

5. **Click "Create Web Service"**

6. **Wait for Deployment**:
   - Render will build and deploy your backend
   - Note the service URL (e.g., `https://asanorder-api.onrender.com`)
   - This is your **Backend API URL**

---

## Step 3: Deploy Frontend

1. **Go to Render Dashboard** → Click **"New +"** → Select **"Static Site"**

2. **Connect Your Repository**:
   - Select the same repository
   - Click **"Connect"**

3. **Configure Frontend Service**:
   - **Name**: `asanorder-ui` (or your preferred name)
   - **Branch**: `main` (or your production branch)
   - **Root Directory**: `frontend`
   - **Build Command**: 
     ```bash
     npm install && npm run build
     ```
   - **Publish Directory**: `dist`

4. **Environment Variables**:
   ```
   VITE_API_URL=https://asanorder.onrender.com
   ```
   **Important**: Replace with your actual backend service URL. Your current backend is at `https://asanorder.onrender.com`

5. **Click "Create Static Site"**

6. **Wait for Deployment**:
   - Render will build and deploy your frontend
   - Note the site URL (e.g., `https://asanorder-ui.onrender.com`)
   - This is your **Frontend URL**

---

## Step 4: Update Environment Variables

After both services are deployed, you may need to update the frontend's `VITE_API_URL`:

1. Go to your **Frontend Static Site** on Render
2. Go to **"Environment"** tab
3. Update `VITE_API_URL` to match your backend URL
4. Click **"Save Changes"** - this will trigger a rebuild

---

## Step 5: Database Migrations

Your backend should automatically run migrations on startup (via `npx prisma migrate deploy` in the start command).

**To verify migrations ran successfully**:
1. Go to your Backend service logs
2. Look for: `✅ Prisma migrations applied successfully` or similar
3. If you see errors, check the logs and fix issues

**To manually run migrations** (if needed):
1. Go to your Backend service
2. Click **"Shell"** tab
3. Run:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

---

## Step 6: Verify Deployment

1. **Test Backend API**:
   - Visit: `https://asanorder.onrender.com/api/health` (should return `{"status":"OK"}`)
   - Or: `https://asanorder.onrender.com/api/auth/login` (should return an error, not 404)

2. **Test Frontend**:
   - Visit your frontend URL: `https://asanorderui.onrender.com`
   - Try logging in
   - Check browser console for any API connection errors
   - Verify API calls are going to `https://asanorder.onrender.com`

---

## Important Configuration Notes

### Backend Service

- **Auto-Deploy**: Enabled by default (deploys on every push to main branch)
- **Health Check Path**: `/api/health` (if you have one) or `/`
- **Instance Type**: Free tier spins down after 15 minutes of inactivity (first request will be slow)

### Frontend Service

- **Auto-Deploy**: Enabled by default
- **Custom Domain**: You can add a custom domain in the settings

### Database

- **Backups**: Free tier includes daily backups
- **Connection Pooling**: Consider using Render's connection pooling for better performance
- **Internal vs External URL**: Always use the **Internal Database URL** for backend services

---

## Troubleshooting

### Backend Won't Start

1. **Check Logs**: Go to Backend service → "Logs" tab
2. **Common Issues**:
   - Database connection errors → Check `DATABASE_URL` is correct
   - Port errors → Ensure using `$PORT` or `10000`
   - Prisma errors → Check migrations ran successfully

### Frontend Can't Connect to Backend

1. **Check `VITE_API_URL`**: Must match your backend service URL exactly
2. **Check CORS**: Backend should allow requests from frontend domain
3. **Check Browser Console**: Look for CORS or network errors

### Database Connection Issues

1. **Use Internal URL**: Always use the Internal Database URL (not External)
2. **Check Firewall**: Render databases allow connections from Render services automatically
3. **Verify Credentials**: Check username/password in the connection string

### Build Failures

1. **Check Build Logs**: Look for specific error messages
2. **Common Issues**:
   - Missing dependencies → Check `package.json` files
   - Prisma generation errors → Ensure `npx prisma generate` runs in build
   - Node version mismatch → Specify Node version in `package.json` or Render settings

---

## Production Checklist

- [ ] Database is on a paid plan (not free tier)
- [ ] Backend is on a paid plan (stays awake, no cold starts)
- [ ] Strong `JWT_SECRET` is set (not the example one)
- [ ] `OPENAI_API_KEY` is set (if using invoice scanning)
- [ ] Custom domain configured (optional but recommended)
- [ ] SSL certificates are active (automatic on Render)
- [ ] Environment variables are set correctly
- [ ] Database backups are enabled
- [ ] Monitoring/alerts are set up (optional)

---

## Quick Reference: Service URLs

After deployment, you'll have:

- **Backend API**: `https://asanorder.onrender.com`
- **Frontend**: `https://asanorderui.onrender.com`
- **Database**: Internal URL (only accessible from Render services)

**Your Current Deployment**:
- ✅ Frontend: https://asanorderui.onrender.com
- ✅ Backend API: https://asanorder.onrender.com

---

## Alternative: Using render.yaml (Infrastructure as Code)

If you prefer to define everything in code, you can use the existing `render.yaml` file:

1. **Update `render.yaml`** with your actual values:
   - The `render.yaml` file is already configured with PostgreSQL database
   - Database connection is automatically set up via `fromDatabase` reference
   - Frontend automatically gets backend URL via `fromService` reference

2. **Deploy via Render Dashboard**:
   - Go to **"New +"** → **"Blueprint"**
   - Connect your GitHub repository
   - Render will read `render.yaml` and create all services automatically
   - You'll only need to manually set `OPENAI_API_KEY` in the backend service

3. **After Blueprint Deployment**:
   - Go to your backend service → Environment tab
   - Add `OPENAI_API_KEY` if you're using invoice scanning
   - Add `FRONTEND_URL` with your frontend URL (for CORS)
   - The frontend will automatically get the backend URL from the service reference

**Advantages of Blueprint**:
- All services created in one go
- Database connection automatically configured
- Frontend automatically knows backend URL
- Easier to manage and update

---

## Need Help?

- **Render Documentation**: https://render.com/docs
- **Render Community**: https://community.render.com
- **Check Service Logs**: Always check logs first when troubleshooting

---

## Security Reminders

⚠️ **IMPORTANT**: 
- Never commit `.env` files to Git
- Use Render's environment variables (not hardcoded secrets)
- Use strong, unique `JWT_SECRET`
- Keep your database credentials secure
- Regularly rotate API keys and secrets

