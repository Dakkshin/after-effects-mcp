#!/usr/bin/env node

// install-bridge.js
// Script to install the After Effects MCP Bridge to the ScriptUI Panels folder

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// ES Modules replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Possible After Effects installation paths (common locations)
const possiblePaths = {
  darwin: [
    '/Applications/Adobe After Effects 2025',
    '/Applications/Adobe After Effects 2024',
    '/Applications/Adobe After Effects 2023',
    '/Applications/Adobe After Effects 2022',
    '/Applications/Adobe After Effects 2021'
  ],
  win32: [
    'C:\\Program Files\\Adobe\\Adobe After Effects 2025',
    'C:\\Program Files\\Adobe\\Adobe After Effects 2024',
    'C:\\Program Files\\Adobe\\Adobe After Effects 2023',
    'C:\\Program Files\\Adobe\\Adobe After Effects 2022',
    'C:\\Program Files\\Adobe\\Adobe After Effects 2021'
  ]
};

// Find valid After Effects installation
const findAfterEffectsPath = (platform) => {
  for (const testPath of possiblePaths[platform]) {
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }
  return null;
};

const platform = os.platform();
const afterEffectsPath = findAfterEffectsPath(platform);

if (!afterEffectsPath) {
  console.error('Error: Could not find After Effects installation.');
  console.error('Please manually copy the bridge script to your After Effects ScriptUI Panels folder.');
  console.error('Source: build/scripts/mcp-bridge-auto.jsx');
  console.error(`Target: ${platform === 'darwin' ? '/Applications/Adobe After Effects [VERSION]/Scripts/ScriptUI Panels/' : 'C:\\Program Files\\Adobe\\Adobe After Effects [VERSION]\\Support Files\\Scripts\\ScriptUI Panels\\'}`);
  process.exit(1);
}

// Define the source and destination paths
const sourceScript = path.join(__dirname, 'build', 'scripts', 'mcp-bridge-auto.jsx');
const destinationFolder = path.join(afterEffectsPath, platform === 'darwin' ? 'Scripts/ScriptUI Panels' : 'Support Files\\Scripts\\ScriptUI Panels');
const destinationScript = path.join(destinationFolder, 'mcp-bridge-auto.jsx');

// Check if the source script exists
if (!fs.existsSync(sourceScript)) {
  console.error(`Error: Source script not found at ${sourceScript}`);
  console.error("Please run 'npm run build' first to generate the script.");
  process.exit(1);
}

// Create the destination folder if it doesn't exist
if (!fs.existsSync(destinationFolder)) {
  console.log('Creating destination folder...');
  try {
    fs.mkdirSync(destinationFolder, { recursive: true });
  } catch (err) {
    console.error('Error creating destination folder. You may need administrative privileges.');
    process.exit(1);
  }
}

// Copy the script to the destination
console.log(`Installing bridge script to ${destinationScript}...`);
try {
  if (platform === 'win32') {
    // Use PowerShell with elevated privileges on Windows
    const command = `
      Start-Process PowerShell -Verb RunAs -ArgumentList "-Command Copy-Item -Path '${sourceScript.replace(/\\/g, '\\\\')}' -Destination '${destinationScript.replace(/\\/g, '\\\\')}' -Force"
    `;
    execSync(`powershell -Command "${command}"`, { stdio: 'inherit' });
  } else {
    fs.copyFileSync(sourceScript, destinationScript);
  }
} catch (err) {
  console.error('Error installing script. You may need to run this script with elevated privileges.');
  process.exit(1);
}

console.log('Bridge script installed successfully!');
console.log('');
console.log('Important next steps:');
console.log('1. Open After Effects');
console.log(`2. Go to ${platform === 'darwin' ? 'After Effects > Preferences > Scripting & Expressions' : 'Edit > Preferences > Scripting & Expressions'}`);
console.log("3. Enable 'Allow Scripts to Write Files and Access Network'");
console.log('4. Restart After Effects');
console.log('5. Open the bridge panel: Window > mcp-bridge-auto.jsx');