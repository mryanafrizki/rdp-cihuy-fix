#!/bin/bash

# Ubuntu Deployment Script for Next.js Web Application with PM2
# This script handles: clone/pull repo, install deps, build, and start with PM2
# Usage: bash scripts/deploy-web.sh

set -e

# ============================================================================
# CONFIGURATION VARIABLES
# ============================================================================

# Repository URL - change this to your actual repository
REPO_URL="${REPO_URL:-https://github.com/your-org/rdp-web-panel.git}"

# Deployment directory
APP_DIR="${APP_DIR:-/var/www/rdp-web-panel}"

# Web application directory (relative to APP_DIR)
WEB_DIR="$APP_DIR/apps/web"

# PM2 ecosystem config file
ECOSYSTEM_CONFIG="$WEB_DIR/ecosystem.config.js"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

# Print colored output
print_info() {
  echo -e "\033[0;36m[INFO]\033[0m $1"
}

print_success() {
  echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

print_error() {
  echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

print_info "Checking prerequisites..."

# Check Node.js installation
if ! command_exists node; then
  print_error "Node.js is not installed. Please install Node.js 18+ first."
  exit 1
fi
print_success "Node.js found: $(node --version)"

# Check npm installation
if ! command_exists npm; then
  print_error "npm is not installed. Please install npm first."
  exit 1
fi
print_success "npm found: $(npm --version)"

# Check PM2 installation
if ! command_exists pm2; then
  print_error "PM2 is not installed. Installing PM2 globally..."
  npm install -g pm2
  print_success "PM2 installed successfully"
else
  print_success "PM2 found: $(pm2 --version)"
fi

# Check git installation
if ! command_exists git; then
  print_error "Git is not installed. Please install Git first."
  exit 1
fi
print_success "Git found: $(git --version)"

# ============================================================================
# REPOSITORY SETUP
# ============================================================================

print_info "Setting up repository..."

if [ -d "$APP_DIR" ]; then
  print_info "Repository directory exists. Pulling latest changes..."
  cd "$APP_DIR"
  git pull origin main || git pull origin master || {
    print_error "Failed to pull repository. Check your branch name."
    exit 1
  }
  print_success "Repository updated"
else
  print_info "Repository directory does not exist. Cloning repository..."
  git clone "$REPO_URL" "$APP_DIR" || {
    print_error "Failed to clone repository. Check the REPO_URL."
    exit 1
  }
  print_success "Repository cloned"
fi

# ============================================================================
# DEPENDENCY INSTALLATION
# ============================================================================

print_info "Installing dependencies..."

cd "$WEB_DIR"

# Install root dependencies
cd "$APP_DIR"
npm install || {
  print_error "Failed to install root dependencies."
  exit 1
}
print_success "Root dependencies installed"

# Install web app dependencies
cd "$WEB_DIR"
npm install || {
  print_error "Failed to install web app dependencies."
  exit 1
}
print_success "Web app dependencies installed"

# ============================================================================
# BUILD NEXT.JS APPLICATION
# ============================================================================

print_info "Building Next.js application..."

cd "$WEB_DIR"
npm run build || {
  print_error "Failed to build Next.js application."
  exit 1
}
print_success "Next.js build completed successfully"

# ============================================================================
# LOGS DIRECTORY SETUP
# ============================================================================

print_info "Setting up logs directory..."

mkdir -p "$WEB_DIR/logs" || {
  print_error "Failed to create logs directory."
  exit 1
}
print_success "Logs directory ready: $WEB_DIR/logs"

# ============================================================================
# PM2 PROCESS MANAGEMENT
# ============================================================================

print_info "Starting application with PM2..."

# Check if ecosystem config exists
if [ ! -f "$ECOSYSTEM_CONFIG" ]; then
  print_error "Ecosystem config not found at: $ECOSYSTEM_CONFIG"
  exit 1
fi

# Stop existing PM2 process if running
if pm2 list | grep -q "rdp-web-panel"; then
  print_info "Stopping existing PM2 process..."
  pm2 stop rdp-web-panel || true
  pm2 delete rdp-web-panel || true
fi

# Start application with PM2
cd "$WEB_DIR"
pm2 start "$ECOSYSTEM_CONFIG" --env production || {
  print_error "Failed to start application with PM2."
  exit 1
}
print_success "Application started with PM2"

# Save PM2 process list
pm2 save || {
  print_error "Failed to save PM2 process list."
  exit 1
}
print_success "PM2 process list saved"

# Setup PM2 startup script (for system reboot)
print_info "Setting up PM2 startup script..."
pm2 startup || {
  print_error "Failed to setup PM2 startup script. You may need to run: sudo pm2 startup"
}
print_success "PM2 startup script configured"

# ============================================================================
# DEPLOYMENT COMPLETE
# ============================================================================

print_success "Deployment completed successfully!"
print_info "Application is running with PM2"
print_info "View logs: pm2 logs rdp-web-panel"
print_info "Monitor: pm2 monit"
print_info "Status: pm2 status"

exit 0
