#!/usr/bin/env node

// install-fully-fixed-bridge.js
// Script to install the FULLY COMPATIBLE After Effects MCP Bridge

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Installing FULLY COMPATIBLE MCP Bridge for macOS...');

// Find After Effects installation
const possiblePaths = [
  '/Applications/Adobe After Effects 2025',
  '/Applications/Adobe After Effects 2024', 
  '/Applications/Adobe After Effects 2023'
];

let afterEffectsPath = null;
for (const testPath of possiblePaths) {
  if (fs.existsSync(testPath)) {
    afterEffectsPath = testPath;
    console.log(`Found After Effects at: ${testPath}`);
    break;
  }
}

if (!afterEffectsPath) {
  console.error('Error: Could not find After Effects installation.');
  process.exit(1);
}

const sourceScript = path.join(__dirname, 'mcp-bridge-auto-fully-fixed.jsx');
const destinationFolder = path.join(afterEffectsPath, 'Scripts', 'ScriptUI Panels');
const destinationScript = path.join(destinationFolder, 'mcp-bridge-auto-fully-fixed.jsx');

if (!fs.existsSync(sourceScript)) {
  console.error(`Error: Source script not found at ${sourceScript}`);
  process.exit(1);
}

if (!fs.existsSync(destinationFolder)) {
  fs.mkdirSync(destinationFolder, { recursive: true });
}

try {
  try {
    fs.copyFileSync(sourceScript, destinationScript);
    console.log('✅ FULLY FIXED bridge script installed successfully!');
  } catch (error) {
    if (error.code === 'EACCES') {
      console.log('Permission denied, trying with sudo...');
      execSync(`sudo cp "${sourceScript}" "${destinationScript}"`, { stdio: 'inherit' });
      console.log('✅ FULLY FIXED bridge script installed successfully with sudo!');
    } else {
      throw error;
    }
  }
  
  console.log('\\n🎉 INSTALLATION COMPLETE!');
  console.log('\\n📋 Next steps:');
  console.log('1. **Close the current MCP Bridge panel** in After Effects');
  console.log('2. Open: Window > mcp-bridge-auto-fully-fixed.jsx');
  console.log('\\n🔧 This version includes:');
  console.log('   • JSON polyfill (fixes "JSON is undefined")');
  console.log('   • Date.toISOString() polyfill (fixes timestamp errors)');
  console.log('   • Enhanced JSON.parse() (better compatibility)');
  console.log('   • Improved error handling');
  
} catch (error) {
  console.error(`\\n❌ Installation failed: ${error.message}`);
  process.exit(1);
}
