# Update .env file to use PostgreSQL
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path (Split-Path -Parent $scriptDir) ".env"

Write-Host "Updating .env file for PostgreSQL..." -ForegroundColor Cyan

# Read current .env file
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    
    # Replace SQL Server connection string with PostgreSQL
    $postgresUrl = 'DATABASE_URL="postgresql://postgres:pass%40word1@localhost:5433/asanOrder?schema=public"'
    
    # Check if DATABASE_URL exists
    if ($content -match 'DATABASE_URL\s*=') {
        # Replace existing DATABASE_URL
        $content = $content -replace 'DATABASE_URL\s*="[^"]*"', $postgresUrl
        $content = $content -replace 'DATABASE_URL\s*=[^\r\n]*', $postgresUrl
        Write-Host "Updated existing DATABASE_URL" -ForegroundColor Green
    } else {
        # Add DATABASE_URL if it doesn't exist
        $content = "DATABASE_URL=$postgresUrl`r`n" + $content
        Write-Host "Added DATABASE_URL" -ForegroundColor Green
    }
    
    # Write back to file
    $content | Set-Content $envFile -NoNewline
    Write-Host ".env file updated successfully!" -ForegroundColor Green
    Write-Host "New DATABASE_URL: $postgresUrl" -ForegroundColor Yellow
} else {
    Write-Host ".env file not found. Creating new one..." -ForegroundColor Yellow
    
    $newContent = 'DATABASE_URL="postgresql://postgres:a3a295709073466a802bce04bac346c0@localhost:5432/asanOrder?schema=public"'
    $newContent += "`r`nJWT_SECRET=your_jwt_secret_here"
    $newContent += "`r`nNODE_ENV=development"
    
    $newContent | Set-Content $envFile
    Write-Host "Created new .env file" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! You can now proceed with the migration." -ForegroundColor Green
