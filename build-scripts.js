// build-scripts.js
import { execSync } from 'child_process';
import os from 'os';

try {
  // Compile TypeScript
  execSync('tsc', { stdio: 'inherit' });

  // Copy scripts based on the operating system
  if (os.platform() === 'darwin') {
    execSync('cp -R ./src/scripts ./build/scripts', { stdio: 'inherit' });
  } else {
    execSync('xcopy .\\src\\scripts .\\build\\scripts /E /I /Y', { stdio: 'inherit' });
  }
} catch (error) {
  console.error('Error during build:', error.message);
  process.exit(1);
}