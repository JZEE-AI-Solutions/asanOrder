# LIVE Deployment script for Order Management System (PowerShell)
# This script deploys everything to production

Write-Host "🚀 LIVE DEPLOYMENT - Order Management System" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Function to print colored output
function Write-Status {
    param($Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param($Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if we're in the right directory
if (-not (Test-Path "package.json") -or -not (Test-Path "backend") -or -not (Test-Path "frontend")) {
    Write-Error "Please run this script from the project root directory"
    exit 1
}

Write-Status "Starting LIVE deployment process..."

# Step 1: Stop any running development servers
Write-Status "Stopping development servers..."
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Success "Development servers stopped"

# Step 2: Check Git status
Write-Status "Checking Git status..."
if (-not (Test-Path ".git")) {
    Write-Error "Git repository not initialized. Please run 'git init' first"
    exit 1
}

# Check for uncommitted changes
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Warning "You have uncommitted changes. Committing them now..."
    git add .
    git commit -m "Deploy: Prepare for LIVE deployment

- Fixed customer data consistency issues
- Added customer management features
- Fixed duplicate customer creation
- Updated field mapping for form data extraction
- Enhanced customer portal functionality"
    Write-Success "Changes committed"
}

# Step 3: Install dependencies
Write-Status "Installing dependencies..."

Write-Status "Installing root dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install root dependencies"
    exit 1
}

Write-Status "Installing backend dependencies..."
Set-Location backend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install backend dependencies"
    exit 1
}
Set-Location ..

Write-Status "Installing frontend dependencies..."
Set-Location frontend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install frontend dependencies"
    exit 1
}
Set-Location ..

Write-Success "All dependencies installed"

# Step 4: Build frontend
Write-Status "Building frontend for production..."
Set-Location frontend
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Success "Frontend build successful"
} else {
    Write-Error "Frontend build failed"
    exit 1
}
Set-Location ..

# Step 5: Prepare environment files
Write-Status "Preparing environment files..."

# Copy production environment files
if (Test-Path "backend/env.production") {
    Copy-Item "backend/env.production" "backend/.env"
    Write-Success "Backend environment file prepared"
} else {
    Write-Error "backend/env.production not found"
    exit 1
}

if (Test-Path "frontend/env.production") {
    Copy-Item "frontend/env.production" "frontend/.env.production"
    Write-Success "Frontend environment file prepared"
} else {
    Write-Error "frontend/env.production not found"
    exit 1
}

# Step 6: Run database migrations on LIVE
Write-Status "Running database migrations on LIVE database..."

Set-Location backend

# Generate Prisma client
Write-Status "Generating Prisma client..."
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to generate Prisma client"
    exit 1
}

# Run migrations
Write-Status "Running database migrations..."
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Error "Database migration failed"
    exit 1
}

Write-Success "Database migrations completed"

# Step 7: Seed the database
Write-Status "Seeding LIVE database..."
node prisma/seed.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Database seeding failed"
    exit 1
}

Write-Success "Database seeded successfully"

Set-Location ..

# Step 8: Git operations
Write-Status "Performing Git operations..."

# Add all files
git add .

# Check if there are changes to commit
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Status "Committing deployment changes..."
    git commit -m "Deploy: LIVE deployment ready

- All dependencies installed
- Frontend built for production
- Database migrations applied
- Database seeded with initial data
- Environment files configured
- Ready for production deployment"
    Write-Success "Deployment changes committed"
} else {
    Write-Status "No new changes to commit"
}

# Step 9: Push to GitHub
Write-Status "Pushing to GitHub..."
git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-Success "Code pushed to GitHub successfully"
} else {
    Write-Error "Failed to push to GitHub"
    exit 1
}

# Step 10: Final status
Write-Success "🎉 LIVE DEPLOYMENT PREPARATION COMPLETE!"
Write-Host ""
Write-Host "📋 Deployment Summary:" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host "✅ Dependencies installed"
Write-Host "✅ Frontend built for production"
Write-Host "✅ Environment files configured"
Write-Host "✅ Database migrations applied"
Write-Host "✅ Database seeded with initial data"
Write-Host "✅ Code pushed to GitHub"
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "==============" -ForegroundColor Cyan
Write-Host "1. Your code is now on GitHub"
Write-Host "2. If using Render.com, it will automatically deploy"
Write-Host "3. If using other platforms, follow their deployment process"
Write-Host "4. Monitor the deployment logs"
Write-Host "5. Test the live application"
Write-Host ""
Write-Host "🔗 Important URLs:" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
Write-Host "Backend API: https://asanorder.onrender.com"
Write-Host "Frontend: https://asanorderui.onrender.com"
Write-Host ""
Write-Host "📊 Database Status:" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host "✅ Migrations applied"
Write-Host "✅ Initial data seeded"
Write-Host "✅ Ready for production use"
Write-Host ""
Write-Success "Deployment process completed successfully! 🎉"
