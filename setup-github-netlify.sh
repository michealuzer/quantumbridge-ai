#!/bin/bash
# Exit on error
set -e

echo "============================================="
echo " Starting GitHub & Netlify CI/CD Setup       "
echo "============================================="

# 1. Initialize Git
if [ ! -d ".git" ]; then
    echo "Initializing local Git repository..."
    git init
    git branch -M main
else
    echo "Git repository is already initialized."
fi

# 2. Commit files
echo "Staging all files..."
git add -A
echo "Committing files..."
# Ignore if there is nothing to commit
git commit -m "Initial commit of Quantum AI control panel" || echo "Nothing new to commit"

# 3. Authenticate and Create GitHub Repository
echo "Checking GitHub CLI auth status..."
if ! gh auth status >/dev/null 2>&1; then
    echo "GitHub CLI (gh) is not authenticated. Starting login flow..."
    gh auth login
fi

# Get the current directory name to use as default repo name
REPO_NAME="quantumbridge-ai"
echo "Creating public GitHub repository: $REPO_NAME..."

# Create repo and push
if ! gh repo view "$REPO_NAME" >/dev/null 2>&1; then
    gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
else
    echo "Repository $REPO_NAME already exists on GitHub. Pushing local main branch..."
    git push -u origin main
fi

# 4. Initialize Netlify CI/CD
echo "Connecting project to Netlify Continuous Deployment..."
npx netlify init

echo "============================================="
echo " Setup successfully completed!               "
echo "============================================="
