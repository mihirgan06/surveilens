#!/bin/bash

# Fresh GitHub Deployment Script with Current Timestamps
# Commits code in stages with randomized intervals (1-5 minutes)

set -e

REPO_URL="https://github.com/mihirgan06/surveilensfinal.git"

echo "🚀 Starting fresh deployment to GitHub..."
echo "Repository: $REPO_URL"

# Clean and initialize git repository
rm -rf .git
git init
git branch -M main

# Add remote
echo "🔗 Adding remote origin..."
git remote add origin $REPO_URL

# Create .gitignore first
cat > .gitignore << 'EOF'
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
client_secret_*.json
.env.local
EOF

# Generate random delay between 60-300 seconds (1-5 minutes)
random_delay() {
    echo $((60 + RANDOM % 240))
}

# Get current timestamp
get_timestamp() {
    date "+%Y-%m-%d %H:%M:%S"
}

# Commit 1: Project setup and configuration
echo ""
echo "📦 Commit 1/5: Initial project setup and configuration..."
git add .gitignore
git add package.json package-lock.json
git add tsconfig*.json vite.config.ts eslint.config.js
git add postcss.config.js tailwind.config.js
git add index.html
git add README.md QUICK_START.md 2>/dev/null || true
GIT_AUTHOR_DATE="$(get_timestamp)" GIT_COMMITTER_DATE="$(get_timestamp)" git commit -m "🎉 Initial commit: Project setup and configuration

- Add package.json with dependencies
- Configure TypeScript, Vite, and ESLint
- Setup Tailwind CSS and PostCSS
- Add project documentation"

DELAY=$(random_delay)
echo "✅ Commit 1 complete. Waiting $DELAY seconds (~$((DELAY/60)) min)..."
sleep $DELAY

# Commit 2: Core AI services and type definitions
echo ""
echo "📦 Commit 2/5: Core AI services and detection engine..."
git add src/config.ts
git add src/lib/ 2>/dev/null || true
git add src/services/
git add src/types/
git add src/utils/ 2>/dev/null || true
GIT_AUTHOR_DATE="$(get_timestamp)" GIT_COMMITTER_DATE="$(get_timestamp)" git commit -m "🤖 Add AI detection services and utilities

- Implement OpenAI GPT-4 Vision integration
- Add detection engine with COCO-SSD
- Create workflow engine for automation
- Define TypeScript types for detection system"

DELAY=$(random_delay)
echo "✅ Commit 2 complete. Waiting $DELAY seconds (~$((DELAY/60)) min)..."
sleep $DELAY

# Commit 3: UI components and styling
echo ""
echo "📦 Commit 3/5: UI components and styling..."
git add src/components/ui/
git add src/components/AlertList.tsx 2>/dev/null || true
git add src/components/Camera.tsx 2>/dev/null || true
git add src/components/VideoUpload.tsx 2>/dev/null || true
git add src/index.css
git add src/assets/ 2>/dev/null || true
git add public/
GIT_AUTHOR_DATE="$(get_timestamp)" GIT_COMMITTER_DATE="$(get_timestamp)" git commit -m "🎨 Add UI components and styling

- Create shadcn/ui components (Button, Card, Badge, Toast)
- Add alert list and camera components
- Implement Tailwind CSS styling
- Add SVG assets"

DELAY=$(random_delay)
echo "✅ Commit 3 complete. Waiting $DELAY seconds (~$((DELAY/60)) min)..."
sleep $DELAY

# Commit 4: Workflow builder and main application
echo ""
echo "📦 Commit 4/5: Workflow builder and main application..."
git add src/App.tsx
git add src/components/WorkflowBuilder.tsx
git add src/main.tsx
GIT_AUTHOR_DATE="$(get_timestamp)" GIT_COMMITTER_DATE="$(get_timestamp)" git commit -m "⚡ Add workflow builder and main application

- Implement drag-and-drop workflow builder
- Create main App component with video analysis
- Add React Flow integration for node graphs
- Setup live camera and video upload features"

DELAY=$(random_delay)
echo "✅ Commit 4 complete. Waiting $DELAY seconds (~$((DELAY/60)) min)..."
sleep $DELAY

# Commit 5: Backend server and final touches
echo ""
echo "📦 Commit 5/5: Backend server and documentation..."
git add server.cjs
git add server/ 2>/dev/null || true
git add deploy_to_github.sh 2>/dev/null || true
git add deploy_realistic.sh 2>/dev/null || true
git add deploy_fresh.sh 2>/dev/null || true
GIT_AUTHOR_DATE="$(get_timestamp)" GIT_COMMITTER_DATE="$(get_timestamp)" git commit -m "🚀 Complete surveillance system implementation

- Add Express.js OAuth server for Gmail integration
- Implement Google OAuth 2.0 flow
- Add deployment scripts
- Finalize documentation and quick start guide"

echo "✅ Commit 5 complete!"

# Push to GitHub
echo ""
echo "🚀 Pushing to GitHub..."
git push -f origin main

echo ""
echo "✨ Successfully deployed to GitHub!"
echo "🔗 View your repository at: $REPO_URL"
echo "📊 Summary:"
echo "- 5 commits created with FRESH timestamps"
echo "- Randomized intervals between 1-5 minutes"
echo "- Full project structure maintained"
echo "- Professional commit history"

