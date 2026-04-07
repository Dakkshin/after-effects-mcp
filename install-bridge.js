// install-bridge.js
// Script to install the After Effects MCP Bridge to the ScriptUI Panels folder
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Modules replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect platform
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const requestedVersionArg = process.argv.find((arg) => arg.startsWith('--ae-version='));
const requestedVersion = process.env.AE_VERSION || (requestedVersionArg ? requestedVersionArg.split('=')[1] : null);
const requestedPath = process.env.AE_PATH || null;

// Possible After Effects installation paths (common locations)
const possiblePaths = isMac
  ? [
      '/Applications/Adobe After Effects 2026',
      '/Applications/Adobe After Effects 2025',
      '/Applications/Adobe After Effects 2024',
      '/Applications/Adobe After Effects 2023',
      '/Applications/Adobe After Effects 2022',
      '/Applications/Adobe After Effects 2021',
      '/Applications/Adobe After Effects 2020'
    ]
  : [
      'C:\\Program Files\\Adobe\\Adobe After Effects 2026',
      'C:\\Program Files\\Adobe\\Adobe After Effects 2025',
      'C:\\Program Files\\Adobe\\Adobe After Effects 2024',
      'C:\\Program Files\\Adobe\\Adobe After Effects 2023',
      'C:\\Program Files\\Adobe\\Adobe After Effects 2022',
      'C:\\Program Files\\Adobe\\Adobe After Effects 2021',
      'C:\\Program Files\\Adobe\\Adobe After Effects 2020'
    ];

function getRequestedPathFromVersion(version) {
  if (!version) {
    return null;
  }

  const normalizedVersion = String(version).trim();
  return isMac
    ? `/Applications/Adobe After Effects ${normalizedVersion}`
    : `C:\\Program Files\\Adobe\\Adobe After Effects ${normalizedVersion}`;
}

// Find valid After Effects installation
let afterEffectsPath = null;
const installedPaths = possiblePaths.filter((testPath) => fs.existsSync(testPath));

if (requestedPath) {
  if (!fs.existsSync(requestedPath)) {
    console.error(`Error: Requested After Effects path does not exist: ${requestedPath}`);
    process.exit(1);
  }
  afterEffectsPath = requestedPath;
} else if (requestedVersion) {
  const versionPath = getRequestedPathFromVersion(requestedVersion);
  if (!versionPath || !fs.existsSync(versionPath)) {
    console.error(`Error: Requested After Effects version not found: ${requestedVersion}`);
    console.error(`Looked for: ${versionPath}`);
    process.exit(1);
  }
  afterEffectsPath = versionPath;
} else {
  afterEffectsPath = installedPaths.length > 0 ? installedPaths[0] : null;
}

if (!afterEffectsPath) {
  console.error('Error: Could not find After Effects installation.');
  console.error('Please manually copy the bridge script to your After Effects ScriptUI Panels folder.');
  console.error('Source: build/scripts/mcp-bridge-auto.jsx');
  if (isMac) {
    console.error('Target: /Applications/Adobe After Effects [VERSION]/Scripts/ScriptUI Panels/');
  } else {
    console.error('Target: C:\\Program Files\\Adobe\\Adobe After Effects [VERSION]\\Support Files\\Scripts\\ScriptUI Panels\\');
  }
  process.exit(1);
}

if (!requestedPath && !requestedVersion && installedPaths.length > 1) {
  console.warn(`Multiple After Effects installations found. Using: ${afterEffectsPath}`);
  console.warn('Set AE_VERSION or AE_PATH to target a different version.');
}

// Define source and destination paths
const sourceScript = path.join(__dirname, 'build', 'scripts', 'mcp-bridge-auto.jsx');
const destinationFolder = isMac
  ? path.join(afterEffectsPath, 'Scripts', 'ScriptUI Panels')
  : path.join(afterEffectsPath, 'Support Files', 'Scripts', 'ScriptUI Panels');
const destinationScript = path.join(destinationFolder, 'mcp-bridge-auto.jsx');

// Ensure source script exists
if (!fs.existsSync(sourceScript)) {
  console.error(`Error: Source script not found at ${sourceScript}`);
  console.error('Please run "npm run build" first to generate the script.');
  process.exit(1);
}

function escapePowerShellString(value) {
  return value.replace(/'/g, "''");
}

// Create destination folder if it doesn't exist
if (!fs.existsSync(destinationFolder)) {
  try {
    fs.mkdirSync(destinationFolder, { recursive: true });
  } catch (error) {
    console.error(`Error creating destination folder: ${error.message}`);
    console.error('You may need administrative privileges to install the script.');
    process.exit(1);
  }
}

// Copy the script
try {
  console.log(`Installing bridge script to ${destinationScript}...`);

  if (isMac) {
    // On Mac, try direct copy first, then sudo if needed
    try {
      fs.copyFileSync(sourceScript, destinationScript);
    } catch {
      // If direct copy fails, try with sudo
      execSync(`sudo cp "${sourceScript}" "${destinationScript}"`, { stdio: 'inherit' });
    }
  } else {
    // On Windows, direct copy may fail under Program Files without admin rights.
    // Fall back to an elevated PowerShell process and wait for it to finish.
    try {
      fs.copyFileSync(sourceScript, destinationScript);
    } catch {
      const tempScriptPath = path.join(__dirname, 'install-bridge-elevated.ps1');
      const elevatedScript = [
        '$ErrorActionPreference = "Stop"',
        `Copy-Item -LiteralPath '${escapePowerShellString(sourceScript)}' -Destination '${escapePowerShellString(destinationScript)}' -Force`,
        'if (-not (Test-Path -LiteralPath $args[1])) { throw "Destination file was not created." }'
      ].join('\r\n');

      fs.writeFileSync(tempScriptPath, elevatedScript, 'utf8');

      try {
        const startProcessCommand = [
          '$ErrorActionPreference = "Stop"',
          `$proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${escapePowerShellString(tempScriptPath)}','${escapePowerShellString(sourceScript)}','${escapePowerShellString(destinationScript)}')`,
          'if ($null -eq $proc) { throw "Failed to start elevated PowerShell process." }',
          'if ($proc.ExitCode -ne 0) { throw "Elevated copy failed with exit code $($proc.ExitCode)." }'
        ].join('; ');

        execSync(`powershell -NoProfile -Command "${startProcessCommand}"`, { stdio: 'inherit' });
      } finally {
        if (fs.existsSync(tempScriptPath)) {
          fs.unlinkSync(tempScriptPath);
        }
      }
    }
  }

  if (!fs.existsSync(destinationScript)) {
    throw new Error(`Bridge script was not found after installation: ${destinationScript}`);
  }

  console.log('Bridge script installed successfully!');
  console.log('\nImportant next steps:');
  console.log('1. Open After Effects');
  if (isMac) {
    console.log('2. Go to After Effects > Settings > Scripting & Expressions');
  } else {
    console.log('2. Go to Edit > Preferences > Scripting & Expressions');
  }
  console.log('3. Enable "Allow Scripts to Write Files and Access Network"');
  console.log('4. Restart After Effects');
  console.log('5. Open the bridge panel: Window > mcp-bridge-auto.jsx');
} catch (error) {
  console.error(`Error installing script: ${error.message}`);
  console.error('\nPlease try manual installation:');
  console.error(`1. Copy: ${sourceScript}`);
  console.error(`2. To: ${destinationScript}`);
  if (isMac) {
    console.error('3. You may need to run with sudo or copy manually via Finder');
  } else {
    console.error('3. You may need to run as administrator or use File Explorer with admin rights');
  }
  process.exit(1);
} 
