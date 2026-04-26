#!/usr/bin/env node

/**
 * Script untuk rebuild binary .img dengan encrypted scripts (.sh.enc files)
 * ONLY supports encrypted scripts - NO plaintext fallback
 * Usage: node build-binary-img.js
 */

const BinaryImageBuilder = require('./rdp/src/utils/binaryImageBuilder');
const path = require('path');
const fs = require('fs');

console.log('========================================');
console.log('🔨 Rebuild Binary .img (Encrypted Scripts Only)');
console.log('========================================\n');

// Check if encrypted scripts exist (REQUIRED - NO fallback to plaintext)
const encryptedScripts = ['tele.sh.enc', 'reinstall.sh.enc', 'trans.sh.enc'];
const scriptsDir = path.join(__dirname, 'rdp/scripts');
let foundEncrypted = 0;
const missingScripts = [];

console.log('🔍 Checking for encrypted scripts (.sh.enc files)...');
encryptedScripts.forEach(encFile => {
    const encPath = path.join(scriptsDir, encFile);
    if (fs.existsSync(encPath)) {
        console.log(`   ✅ Found: ${encFile}`);
        foundEncrypted++;
    } else {
        console.log(`   ❌ Missing: ${encFile}`);
        missingScripts.push(encFile);
    }
});

// REQUIRE all encrypted scripts - NO fallback
if (foundEncrypted === 0) {
    console.log('\n❌ ERROR: No encrypted scripts found!');
    console.log('   This binary REQUIRES encrypted scripts (.sh.enc files only)');
    console.log('   NO plaintext fallback is supported');
    console.log('\n   To encrypt scripts, run:');
    console.log('   node encrypt-scripts.js\n');
    process.exit(1);
} else if (foundEncrypted < encryptedScripts.length) {
    console.log(`\n❌ ERROR: Only ${foundEncrypted}/${encryptedScripts.length} encrypted scripts found!`);
    console.log('   Missing scripts:');
    missingScripts.forEach(script => {
        console.log(`     - ${script}`);
    });
    console.log('\n   This binary REQUIRES ALL encrypted scripts (.sh.enc files)');
    console.log('   NO plaintext fallback is supported');
    console.log('\n   To encrypt all scripts, run:');
    console.log('   node encrypt-scripts.js\n');
    process.exit(1);
} else {
    console.log(`\n✅ All ${encryptedScripts.length} scripts are encrypted!`);
    console.log('   Binary will use encrypted scripts (.sh.enc files only)');
    console.log('   NO plaintext fallback\n');
}

// Build binary
const builder = new BinaryImageBuilder();

try {
    const outputPath = path.join(__dirname, 'rdp/dist/rdp-installer-azovest.img');
    const result = builder.build(outputPath);
    
    console.log('========================================');
    console.log('🎉 Binary Built Successfully!');
    console.log('========================================\n');
    
    console.log('📦 Details:');
    console.log(`   Path: ${result.path}`);
    console.log(`   Size: ${result.sizeMB} MB`);
    console.log(`   Files: ${result.filesCount}`);
    console.log(`   SHA256: ${result.checksum}\n`);
    
    console.log('✅ Next steps:');
    console.log('1. Test binary locally:');
    console.log(`   cd rdp/dist && ./rdp-installer.img --extract-only`);
    console.log('');
    console.log('2. Upload to server:');
    console.log(`   scp ${result.path} user@juhuw.store:/path/to/update/rdp-installer.img`);
    console.log('');
    console.log('3. Update environment variable (if not set):');
    console.log('   export RDP_BINARY_IMG_URL="https://juhuw.store/update/rdp-installer.img"');
    console.log('');
    console.log('4. Test RDP installation with encrypted scripts! 🔐');
    console.log('   Note: Binary contains ONLY encrypted scripts (.sh.enc files)');
    console.log('   NO plaintext fallback - all scripts require backend decryption');
    
} catch (error) {
    console.error('\n❌ Build failed:', error.message);
    console.error(error.stack);
    process.exit(1);
}
