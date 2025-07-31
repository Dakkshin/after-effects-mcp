import { execSync } from 'child_process';
import os from 'os';

try {
  // Determine the operating system and execute the appropriate script
  if (os.platform() === 'darwin') {
    execSync('node install-bridge-macos.js', { stdio: 'inherit' });
  } else {
    execSync('node install-bridge-win.js', { stdio: 'inherit' });
  }
} catch (error) {
  console.error('Error during installation:', error.message);
  process.exit(1);
}