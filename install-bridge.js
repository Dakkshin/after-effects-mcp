// install-bridge.js
// Script to install the After Effects MCP Bridge to the ScriptUI Panels folder
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Modules replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Possible After Effects installation paths for macOS
const possiblePaths = [
  '/Applications/Adobe After Effects 2025/Adobe After Effects 2025.app',
  '/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app',
  '/Applications/Adobe After Effects 2023/Adobe After Effects 2023.app',
  '/Applications/Adobe After Effects 2022/Adobe After Effects 2022.app',
  '/Applications/Adobe After Effects 2021/Adobe After Effects 2021.app'
];

// Find valid After Effects installation
let afterEffectsPath = null;
for (const testPath of possiblePaths) {
  if (fs.existsSync(testPath)) {
    // Extract the base directory from the .app path
    afterEffectsPath = path.dirname(testPath);
    break;
  }
}

if (!afterEffectsPath) {
  console.error('Error: Could not find After Effects installation.');
  console.error('Please manually copy the bridge script and json2.js to your After Effects ScriptUI Panels folder.');
  console.error('Source: build/scripts/mcp-bridge-auto.jsx and build/scripts/json2.js');
  console.error('Target: /Applications/Adobe After Effects [VERSION]/Scripts/ScriptUI Panels/');
  process.exit(1);
}

// Define source and destination paths for macOS
const sourceScript = path.join(__dirname, 'build', 'scripts', 'mcp-bridge-auto.jsx');
const sourceJson2 = path.join(__dirname, 'build', 'scripts', 'json2.js');
const destinationFolder = path.join(afterEffectsPath, 'Scripts', 'ScriptUI Panels');
const destinationScript = path.join(destinationFolder, 'mcp-bridge-auto.jsx');
const destinationJson2 = path.join(destinationFolder, 'json2.js');

// Ensure source script exists
if (!fs.existsSync(sourceScript)) {
  console.error(`Error: Source script not found at ${sourceScript}`);
  console.error('Please run "npm run build" first to generate the script.');
  process.exit(1);
}

// Ensure json2.js exists
if (!fs.existsSync(sourceJson2)) {
  console.error(`Error: json2.js not found at ${sourceJson2}`);
  console.error('Please run "npm run build" first to generate the script.');
  process.exit(1);
}

// Create destination folder if it doesn't exist
if (!fs.existsSync(destinationFolder)) {
  try {
    fs.mkdirSync(destinationFolder, { recursive: true });
  } catch (error) {
    console.error(`Error creating destination folder: ${error.message}`);
    process.exit(1);
  }
}

// Copy the script using cp command (macOS/Linux)
try {
  console.log(`Installing bridge script to ${destinationScript}...`);
  console.log(`Installing json2.js to ${destinationJson2}...`);
  
  // Try regular copy first, then sudo if permission denied
  try {
    execSync(`sudo cp "${sourceScript}" "${destinationScript}"`, { stdio: 'inherit' });
    execSync(`sudo cp "${sourceJson2}" "${destinationJson2}"`, { stdio: 'inherit' });
  } catch (copyError) {
    if (copyError.message.includes('Permission denied') || copyError.message.includes('EACCES')) {
      console.log('Permission denied, trying with sudo...');
      execSync(`sudo cp "${sourceScript}" "${destinationScript}"`, { stdio: 'inherit' });
      execSync(`sudo cp "${sourceJson2}" "${destinationJson2}"`, { stdio: 'inherit' });
    } else {
      throw copyError;
    }
  }
  
  console.log('Bridge script and json2.js installed successfully!');
  console.log('\nImportant next steps:');
  console.log('1. Open After Effects');
  console.log('2. Go to After Effects > Preferences > Scripting & Expressions');
  console.log('3. Enable "Allow Scripts to Write Files and Access Network"');
  console.log('4. Restart After Effects');
  console.log('5. Open the bridge panel: Window > mcp-bridge-auto.jsx');
} catch (error) {
  console.error(`Error installing script: ${error.message}`);
  console.error('\nPlease try manual installation:');
  console.error(`1. Copy: ${sourceScript}`);
  console.error(`2. To: ${destinationScript}`);
  console.error(`3. Copy: ${sourceJson2}`);
  console.error(`4. To: ${destinationJson2}`);
  process.exit(1);
} 