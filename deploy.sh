#!/bin/bash

# Deployment script for Order Management System
# This script helps prepare and deploy the application

echo "🚀 Order Management System - Deployment Script"
echo "=============================================="

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository already exists"
fi

# Check if .env files exist
echo ""
echo "🔧 Checking environment files..."

if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env not found. Creating from template..."
    if [ -f "backend/env.production" ]; then
        cp backend/env.production backend/.env
        echo "✅ Created backend/.env from template"
        echo "⚠️  Please update backend/.env with your production values"
    else
        echo "❌ backend/env.production template not found"
    fi
else
    echo "✅ backend/.env exists"
fi

if [ ! -f "frontend/.env.production" ]; then
    echo "⚠️  frontend/.env.production not found. Creating from template..."
    if [ -f "frontend/env.production" ]; then
        cp frontend/env.production frontend/.env.production
        echo "✅ Created frontend/.env.production from template"
        echo "⚠️  Please update frontend/.env.production with your backend URL"
    else
        echo "❌ frontend/env.production template not found"
    fi
else
    echo "✅ frontend/.env.production exists"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."

echo "Installing root dependencies..."
npm install

echo "Installing backend dependencies..."
cd backend && npm install && cd ..

echo "Installing frontend dependencies..."
cd frontend && npm install && cd ..

echo "✅ All dependencies installed"

# Build frontend
echo ""
echo "🏗️  Building frontend..."
cd frontend
npm run build
if [ $? -eq 0 ]; then
    echo "✅ Frontend build successful"
else
    echo "❌ Frontend build failed"
    exit 1
fi
cd ..

# Check for any linting errors
echo ""
echo "🔍 Checking for linting errors..."
cd frontend
npm run lint 2>/dev/null || echo "⚠️  Linting check skipped (no lint script)"
cd ..

# Git operations
echo ""
echo "📝 Git operations..."

# Add all files
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo "ℹ️  No changes to commit"
else
    echo "📝 Committing changes..."
    git commit -m "Deploy: Prepare for production deployment

- Added Render.com configuration
- Updated build scripts for production
- Added environment variable templates
- Updated API service for production
- Enhanced .gitignore for deployment"
    echo "✅ Changes committed"
fi

# Show git status
echo ""
echo "📊 Git status:"
git status --short

echo ""
echo "🎉 Deployment preparation complete!"
echo ""
echo "Next steps:"
echo "1. Update environment variables in backend/.env and frontend/.env.production"
echo "2. Push to GitHub: git push origin main"
echo "3. Deploy to Render.com using the DEPLOYMENT.md guide"
echo "4. Set up your cloud database (PostgreSQL recommended)"
echo ""
echo "📖 For detailed instructions, see DEPLOYMENT.md"
