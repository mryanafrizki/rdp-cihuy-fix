# Setup environment variables for all apps
# This script copies .env.example files to .env for each app

Write-Host "Setting up environment files..." -ForegroundColor Green

# Copy .env.example to .env for all apps
if (-not (Test-Path "apps/web/.env")) {
    Copy-Item "apps/web/.env.example" "apps/web/.env"
    Write-Host "[+] Created apps/web/.env" -ForegroundColor Green
} else {
    Write-Host "[*] apps/web/.env already exists (skipped)" -ForegroundColor Yellow
}

if (-not (Test-Path "apps/worker/.env")) {
    Copy-Item "apps/worker/.env.example" "apps/worker/.env"
    Write-Host "[+] Created apps/worker/.env" -ForegroundColor Green
} else {
    Write-Host "[*] apps/worker/.env already exists (skipped)" -ForegroundColor Yellow
}

if (-not (Test-Path "apps/ubuntu-service/.env")) {
    Copy-Item "apps/ubuntu-service/.env.example" "apps/ubuntu-service/.env"
    Write-Host "[+] Created apps/ubuntu-service/.env" -ForegroundColor Green
} else {
    Write-Host "[*] apps/ubuntu-service/.env already exists (skipped)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Environment files setup complete!" -ForegroundColor Green
Write-Host "Please update the .env files with actual values:" -ForegroundColor Cyan
Write-Host "  - Supabase URL and keys from https://supabase.com/dashboard"
Write-Host "  - Atlantic API key from your Atlantic account"
Write-Host "  - Ubuntu webhook URL and API key for your Ubuntu server"

