/**
 * IDeV Advanced — Windows Authenticode Signing & Timestamping Utility
 * Automates signing of release binaries using signtool.exe or PowerShell.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function signBinaries() {
  console.log('===============================================================');
  console.log('  IDeV Advanced — Windows Code Signing & Verification');
  console.log('===============================================================\n');

  const releaseDir = path.join(__dirname, '../release');
  const setupExe = path.join(releaseDir, 'IDeV-Setup-0.3.8.exe');
  const appExe = path.join(releaseDir, 'win-unpacked/IDeV Advanced.exe');

  if (!fs.existsSync(setupExe)) {
    console.error('[-] Error: Installer not found at', setupExe);
    process.exit(1);
  }

  const certPath = process.env.CSC_LINK || process.argv[2];
  const certPass = process.env.CSC_KEY_PASSWORD || process.argv[3];
  const timestampUrl = 'http://timestamp.digicert.com';

  if (!certPath) {
    console.log('[i] Status: No signing certificate provided in CSC_LINK or arguments.');
    console.log('    To sign this release:');
    console.log('    1. Set environment variables:');
    console.log('       $env:CSC_LINK = "C:\\path\\to\\certificate.pfx"');
    console.log('       $env:CSC_KEY_PASSWORD = "your_certificate_password"');
    console.log('    2. Re-run:');
    console.log('       npm run dist');
    console.log('       node scripts/verify_distribution.js\n');

    // Display current signature status
    try {
      const status = execSync(`powershell -NoProfile -Command "(Get-AuthenticodeSignature '${setupExe}').Status.ToString()"`, { encoding: 'utf8' }).trim();
      console.log(`    Current Authenticode status for installer: [${status}]`);
    } catch {}
    return;
  }

  console.log('[+] Certificate specified:', certPath);
  console.log('[+] Target timestamp server:', timestampUrl);

  const targets = [appExe, setupExe].filter(f => fs.existsSync(f));
  for (const target of targets) {
    console.log(`[*] Signing ${path.basename(target)}...`);
    const psCmd = `powershell -NoProfile -Command "$pass = ConvertTo-SecureString '${certPass || ''}' -AsPlainText -Force; $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('${certPath}', $pass); Set-AuthenticodeSignature -FilePath '${target}' -Certificate $cert -TimestampServer '${timestampUrl}' -HashAlgorithm SHA256"`;
    try {
      execSync(psCmd, { stdio: 'inherit' });
      console.log(`[✓] Successfully signed ${path.basename(target)}`);
    } catch (err) {
      console.error(`[-] Failed to sign ${path.basename(target)}:`, err.message);
    }
  }

  // Run verification
  require('./verify_distribution');
}

signBinaries();
