#!/bin/bash
set -e

echo "🎬 Playwriter MCP - Initializing Development Environment"
echo "========================================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

echo "✓ Node.js $(node --version) found"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm first."
    exit 1
fi

echo "✓ npm $(npm --version) found"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install
echo "✓ Dependencies installed"

# Download and extract Playwriter extension
echo ""
echo "📦 Setting up Playwriter extension..."
mkdir -p /tmp/playwriter-ext

if [ ! -f /tmp/playwriter-ext/playwriter.crx ]; then
    echo "  Downloading Playwriter extension from Chrome Web Store..."
    curl -sL "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=999.0.0.0&acceptformat=crx2,crx3&x=id%3Djfeammnjpkecdekppnclgkkffahnhfhe%26uc" \
        -o /tmp/playwriter-ext/playwriter.crx
    echo "✓ Extension downloaded ($(ls -lh /tmp/playwriter-ext/playwriter.crx | awk '{print $5}'))"
fi

if [ ! -d /tmp/playwriter-ext/playwriter-unpacked ]; then
    echo "  Extracting extension..."
    cd /tmp/playwriter-ext
    rm -rf playwriter-unpacked playwriter.zip
    dd if=playwriter.crx of=playwriter.zip bs=1 skip=16 2>/dev/null
    unzip -q -o playwriter.zip -d playwriter-unpacked
    cd - > /dev/null
    echo "✓ Extension extracted"
fi

# Initialize git if not present
if [ ! -d .git ]; then
    echo ""
    echo "🔧 Initializing git repository..."
    git init
    git add .
    git commit -m "chore: initialize playwriter mcp harness"
    echo "✓ Git repository initialized"
fi

# Create directories
echo ""
echo "📁 Creating project structure..."
mkdir -p ~/.config/chromium-autoplay
echo "✓ Directories created"

echo ""
echo "✅ Development environment ready!"
echo ""
echo "Quick Start:"
echo "  npm start          - Launch browser + MCP + extension"
echo ""
echo "Features:"
echo "  ✓ Visible Chromium browser"
echo "  ✓ Playwriter extension auto-loaded"
echo "  ✓ 22 MCP automation tools available"
echo "  ✓ Browser navigates to http://localhost"
echo ""
echo "Architecture:"
echo "  HTTP Server (localhost:80)"
echo "    └─ Chromium Browser (visible, persistent context)"
echo "       └─ Playwriter Extension (puzzle icon in toolbar)"
echo "          └─ MCP Client (22 tools)"
echo ""
