#!/bin/bash

# LIVE Deployment script for Order Management System
# This script deploys everything to production

echo "🚀 LIVE DEPLOYMENT - Order Management System"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_status "Starting LIVE deployment process..."

# Step 1: Stop any running development servers
print_status "Stopping development servers..."
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
print_success "Development servers stopped"

# Step 2: Check Git status
print_status "Checking Git status..."
if [ ! -d ".git" ]; then
    print_error "Git repository not initialized. Please run 'git init' first"
    exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    print_warning "You have uncommitted changes. Committing them now..."
    git add .
    git commit -m "Deploy: Prepare for LIVE deployment

- Fixed customer data consistency issues
- Added customer management features
- Fixed duplicate customer creation
- Updated field mapping for form data extraction
- Enhanced customer portal functionality"
    print_success "Changes committed"
fi

# Step 3: Install dependencies
print_status "Installing dependencies..."

print_status "Installing root dependencies..."
npm install
if [ $? -ne 0 ]; then
    print_error "Failed to install root dependencies"
    exit 1
fi

print_status "Installing backend dependencies..."
cd backend && npm install
if [ $? -ne 0 ]; then
    print_error "Failed to install backend dependencies"
    exit 1
fi
cd ..

print_status "Installing frontend dependencies..."
cd frontend && npm install
if [ $? -ne 0 ]; then
    print_error "Failed to install frontend dependencies"
    exit 1
fi
cd ..

print_success "All dependencies installed"

# Step 4: Build frontend
print_status "Building frontend for production..."
cd frontend
npm run build
if [ $? -eq 0 ]; then
    print_success "Frontend build successful"
else
    print_error "Frontend build failed"
    exit 1
fi
cd ..

# Step 5: Prepare environment files
print_status "Preparing environment files..."

# Copy production environment files
if [ -f "backend/env.production" ]; then
    cp backend/env.production backend/.env
    print_success "Backend environment file prepared"
else
    print_error "backend/env.production not found"
    exit 1
fi

if [ -f "frontend/env.production" ]; then
    cp frontend/env.production frontend/.env.production
    print_success "Frontend environment file prepared"
else
    print_error "frontend/env.production not found"
    exit 1
fi

# Step 6: Run database migrations on LIVE
print_status "Running database migrations on LIVE database..."

cd backend

# Generate Prisma client
print_status "Generating Prisma client..."
npx prisma generate
if [ $? -ne 0 ]; then
    print_error "Failed to generate Prisma client"
    exit 1
fi

# Run migrations
print_status "Running database migrations..."
npx prisma migrate deploy
if [ $? -ne 0 ]; then
    print_error "Database migration failed"
    exit 1
fi

print_success "Database migrations completed"

# Step 7: Seed the database
print_status "Seeding LIVE database..."
node prisma/seed.js
if [ $? -ne 0 ]; then
    print_error "Database seeding failed"
    exit 1
fi

print_success "Database seeded successfully"

cd ..

# Step 8: Test the build
print_status "Testing production build..."

# Test backend
print_status "Testing backend..."
cd backend
timeout 10s npm start &
BACKEND_PID=$!
sleep 5

# Test if backend is running
if curl -s http://localhost:5000/api/health > /dev/null; then
    print_success "Backend is running correctly"
    kill $BACKEND_PID 2>/dev/null || true
else
    print_error "Backend test failed"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

cd ..

# Step 9: Git operations
print_status "Performing Git operations..."

# Add all files
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    print_status "No new changes to commit"
else
    print_status "Committing deployment changes..."
    git commit -m "Deploy: LIVE deployment ready

- All dependencies installed
- Frontend built for production
- Database migrations applied
- Database seeded with initial data
- Environment files configured
- Ready for production deployment"
    print_success "Deployment changes committed"
fi

# Step 10: Push to GitHub
print_status "Pushing to GitHub..."
git push origin main
if [ $? -eq 0 ]; then
    print_success "Code pushed to GitHub successfully"
else
    print_error "Failed to push to GitHub"
    exit 1
fi

# Step 11: Final status
print_success "🎉 LIVE DEPLOYMENT PREPARATION COMPLETE!"
echo ""
echo "📋 Deployment Summary:"
echo "======================"
echo "✅ Dependencies installed"
echo "✅ Frontend built for production"
echo "✅ Environment files configured"
echo "✅ Database migrations applied"
echo "✅ Database seeded with initial data"
echo "✅ Code pushed to GitHub"
echo ""
echo "🚀 Next Steps:"
echo "=============="
echo "1. Your code is now on GitHub"
echo "2. If using Render.com, it will automatically deploy"
echo "3. If using other platforms, follow their deployment process"
echo "4. Monitor the deployment logs"
echo "5. Test the live application"
echo ""
echo "🔗 Important URLs:"
echo "=================="
echo "Backend API: https://asanorder.onrender.com"
echo "Frontend: https://asanorderui.onrender.com"
echo ""
echo "📊 Database Status:"
echo "==================="
echo "✅ Migrations applied"
echo "✅ Initial data seeded"
echo "✅ Ready for production use"
echo ""
print_success "Deployment process completed successfully! 🎉"
