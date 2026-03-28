const { execSync } = require('child_process');
const fs = require('fs');
try {
  execSync('npx tsc --noEmit', { encoding: 'utf-8' });
  console.log('Build successful');
} catch (error) {
  fs.writeFileSync('tsc_errors.txt', error.stdout, 'utf-8');
}
