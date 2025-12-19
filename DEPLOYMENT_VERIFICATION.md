# Deployment Verification Checklist

Your application is deployed at:
- **Frontend**: https://asanorderui.onrender.com
- **Backend API**: https://asanorder.onrender.com

## ✅ Configuration Checklist

### 1. Backend Environment Variables (Render Dashboard)

Go to your backend service (`asanorder`) → **Environment** tab and verify:

- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` is set (PostgreSQL connection string)
- [ ] `JWT_SECRET` is set (strong random secret, not the example one)
- [ ] `PORT=10000` or `PORT=$PORT`
- [ ] `UPLOAD_DIR=uploads`
- [ ] `MAX_FILE_SIZE=5242880`
- [ ] `OPENAI_API_KEY` is set (if using invoice scanning)
- [ ] `FRONTEND_URL=https://asanorderui.onrender.com` ⚠️ **IMPORTANT for CORS**

### 2. Frontend Environment Variables (Render Dashboard)

Go to your frontend service (`asanorderui`) → **Environment** tab and verify:

- [ ] `VITE_API_URL=https://asanorder.onrender.com` ⚠️ **MUST match your backend URL exactly**

### 3. CORS Configuration

The backend CORS is configured to allow requests from:
- `https://asanorderui.onrender.com`
- `http://localhost:3000` (for local development)

If you set `FRONTEND_URL` environment variable in the backend, it will use that instead.

## 🧪 Testing Your Deployment

### Test 1: Backend Health Check
```bash
curl https://asanorder.onrender.com/api/health
```
**Expected**: `{"status":"OK","timestamp":"..."}`

### Test 2: Backend API Endpoint
```bash
curl https://asanorder.onrender.com/api/auth/login
```
**Expected**: Error response (not 404), meaning the API is accessible

### Test 3: Frontend Connection
1. Open https://asanorderui.onrender.com in your browser
2. Open Developer Tools (F12) → Console tab
3. Try to log in
4. Check for any CORS errors or API connection errors

### Test 4: Network Requests
1. Open Developer Tools (F12) → Network tab
2. Try to log in or perform any action
3. Verify API requests are going to `https://asanorder.onrender.com/api/...`
4. Check that requests are not blocked by CORS

## 🔧 Common Issues & Fixes

### Issue: CORS Errors in Browser Console

**Symptoms**: 
- Browser console shows: `Access to fetch at 'https://asanorder.onrender.com/...' from origin 'https://asanorderui.onrender.com' has been blocked by CORS policy`

**Fix**:
1. Go to backend service → Environment tab
2. Add/Update: `FRONTEND_URL=https://asanorderui.onrender.com`
3. Save and wait for redeploy
4. The backend code already includes this URL in CORS configuration

### Issue: Frontend Can't Connect to Backend

**Symptoms**:
- Network errors in browser console
- API requests failing with 404 or connection errors

**Fix**:
1. Verify `VITE_API_URL` in frontend environment variables is exactly: `https://asanorder.onrender.com`
2. Make sure there's no trailing slash
3. After updating, the frontend will rebuild automatically
4. Wait for rebuild to complete

### Issue: Backend Returns 404 for API Routes

**Symptoms**:
- API calls return 404 Not Found

**Fix**:
1. Check backend logs in Render dashboard
2. Verify the backend service is running (not sleeping)
3. Check that routes are properly configured in `backend/server.js`

### Issue: Database Connection Errors

**Symptoms**:
- Backend logs show database connection errors
- API returns 500 errors

**Fix**:
1. Verify `DATABASE_URL` is correct in backend environment variables
2. Use the **Internal Database URL** (not External)
3. Check database service is running
4. Verify Prisma migrations ran successfully (check backend logs)

## 📊 Monitoring Your Deployment

### Backend Logs
1. Go to Render Dashboard → Your backend service (`asanorder`)
2. Click **"Logs"** tab
3. Monitor for errors, database connection issues, etc.

### Frontend Logs
1. Go to Render Dashboard → Your frontend service (`asanorderui`)
2. Click **"Logs"** tab
3. Check build logs for any errors

### Database
1. Go to Render Dashboard → Your database service
2. Monitor connection count, storage usage
3. Check backup status

## 🚀 Quick Fixes

### Update Frontend API URL
1. Frontend service → Environment tab
2. Update `VITE_API_URL` to `https://asanorder.onrender.com`
3. Save (triggers rebuild)

### Update Backend CORS
1. Backend service → Environment tab
2. Add/Update `FRONTEND_URL=https://asanorderui.onrender.com`
3. Save (triggers redeploy)

### Restart Services
1. Go to service → **Manual Deploy** → **Deploy latest commit**
2. Or wait for auto-deploy on next git push

## ✅ Final Verification

After fixing any issues, verify:

1. ✅ Backend health check works: https://asanorder.onrender.com/api/health
2. ✅ Frontend loads: https://asanorderui.onrender.com
3. ✅ No CORS errors in browser console
4. ✅ Login works
5. ✅ API requests succeed (check Network tab)
6. ✅ No errors in backend logs

---

**Need Help?**
- Check Render service logs first
- Verify all environment variables are set correctly
- Test backend API directly with curl/Postman
- Check browser console for frontend errors

