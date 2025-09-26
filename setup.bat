@echo off
echo Setting up Order Management System...
echo.

echo Installing root dependencies...
call npm install

echo.
echo Installing backend dependencies...
cd backend
call npm install

echo.
echo Setting up database...
copy env.example .env
call npx prisma generate
call npx prisma migrate dev --name init
call npm run db:seed

echo.
echo Installing frontend dependencies...
cd ..\frontend
call npm install

echo.
echo Setup complete!
echo.
echo To start the application:
echo 1. Backend: cd backend && npm run dev
echo 2. Frontend: cd frontend && npm run dev
echo 3. Or use: npm run dev (from root directory)
echo.
echo Default login credentials:
echo Admin: admin@orderms.com / admin123
echo Business Owner: business@dressshop.com / business123
echo Stock Keeper: stock@orderms.com / stock123
echo.
pause
