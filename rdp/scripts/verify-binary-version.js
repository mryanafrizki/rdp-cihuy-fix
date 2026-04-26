#!/usr/bin/env node

/**
 * Script untuk verify apakah binary .img sudah menggunakan versi terbaru
 * Checks:
 * 1. Apakah tele.sh di binary sudah menggunakan hardcoded BACKEND_URL
 * 2. Build timestamp/version dari binary
 * 3. Crosscheck dengan source file
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const BINARY_PATH = path.join(__dirname, 'rdp/dist/rdp-installer-azovest.img');
const SOURCE_TELE_SH = path.join(__dirname, 'rdp/scripts/tele.sh');

console.log('========================================');
console.log('🔍 Verify Binary Version');
console.log('========================================\n');

// Check if binary exists
if (!fs.existsSync(BINARY_PATH)) {
    console.error('❌ Binary not found:', BINARY_PATH);
    console.error('   Run: node build-binary-img.js');
    process.exit(1);
}

console.log('📦 Binary file:', BINARY_PATH);
const binaryStats = fs.statSync(BINARY_PATH);
console.log(`   Size: ${(binaryStats.size / (1024 * 1024)).toFixed(2)} MB`);
console.log(`   Modified: ${binaryStats.mtime.toISOString()}\n`);

// Extract binary to temp directory
const tempDir = path.join(__dirname, 'temp', 'verify-binary');
if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

console.log('📦 Extracting binary...');
try {
    // Try to extract using --extract-only
    execSync(`"${BINARY_PATH}" --extract-only`, {
        cwd: tempDir,
        stdio: 'pipe'
    });
} catch (e) {
    // Manual extraction
    const binaryContent = fs.readFileSync(BINARY_PATH, 'utf8');
    const archiveStart = binaryContent.indexOf('__ARCHIVE_BELOW__');
    if (archiveStart > 0) {
        const archiveStartLine = binaryContent.substring(0, archiveStart).split('\n').length;
        execSync(`tail -n +${archiveStartLine + 1} "${BINARY_PATH}" | tar -xz`, {
            cwd: tempDir,
            stdio: 'pipe'
        });
    }
}

// Find extracted tele.sh
const extractedTeleSh = path.join(tempDir, '.rdp-installer-extracted', 'tele.sh');
if (!fs.existsSync(extractedTeleSh)) {
    // Try alternative location
    const found = findFile(tempDir, 'tele.sh');
    if (found) {
        found = found;
    } else {
        console.error('❌ tele.sh not found in extracted binary');
        process.exit(1);
    }
}

console.log('✅ Binary extracted\n');

// Check build info from binary header
console.log('📋 Checking build info...');
const binaryContent = fs.readFileSync(BINARY_PATH, 'utf8');
const buildTimestampMatch = binaryContent.match(/Build Timestamp: ([^\n]+)/);
const buildVersionMatch = binaryContent.match(/Build Version: ([^\n]+)/);

if (buildTimestampMatch) {
    console.log(`   Build Timestamp: ${buildTimestampMatch[1]}`);
}
if (buildVersionMatch) {
    console.log(`   Build Version: ${buildVersionMatch[1]}`);
}
console.log('');

// Check if tele.sh in binary has hardcoded BACKEND_URL
console.log('🔍 Checking tele.sh in binary...');
const extractedTeleContent = fs.readFileSync(extractedTeleSh, 'utf8');

const hasHardcodedBackend = extractedTeleContent.includes('BACKEND_URL="https://rotate.eov.my.id"');
const hasParameterBackend = extractedTeleContent.includes('BACKEND_URL="$3"');

console.log(`   Has hardcoded BACKEND_URL: ${hasHardcodedBackend ? '✅ YES' : '❌ NO'}`);
console.log(`   Has parameter BACKEND_URL (\$3): ${hasParameterBackend ? '⚠️  YES (OLD VERSION)' : '✅ NO'}`);

if (hasHardcodedBackend && !hasParameterBackend) {
    console.log('   ✅ Binary uses hardcoded BACKEND_URL (NEW VERSION)');
} else if (hasParameterBackend) {
    console.log('   ❌ Binary still uses parameter BACKEND_URL (OLD VERSION)');
    console.log('   ⚠️  Need to rebuild binary!');
}

console.log('');

// Crosscheck with source file
console.log('🔍 Crosschecking with source file...');
if (!fs.existsSync(SOURCE_TELE_SH)) {
    console.error('❌ Source tele.sh not found:', SOURCE_TELE_SH);
} else {
    const sourceTeleContent = fs.readFileSync(SOURCE_TELE_SH, 'utf8');
    const sourceHasHardcoded = sourceTeleContent.includes('BACKEND_URL="https://rotate.eov.my.id"');
    
    console.log(`   Source has hardcoded BACKEND_URL: ${sourceHasHardcoded ? '✅ YES' : '❌ NO'}`);
    
    if (sourceHasHardcoded && hasHardcodedBackend) {
        console.log('   ✅ Source and binary match (both use hardcoded BACKEND_URL)');
    } else if (sourceHasHardcoded && !hasHardcodedBackend) {
        console.log('   ⚠️  Source has hardcoded but binary does not!');
        console.log('   ⚠️  Need to rebuild binary!');
    } else if (!sourceHasHardcoded) {
        console.log('   ⚠️  Source does not have hardcoded BACKEND_URL!');
        console.log('   ⚠️  Need to update source file first!');
    }
}

console.log('');

// Check for other important changes
console.log('🔍 Checking for other important features...');
const checks = {
    'Has decrypt_script_via_backend function': extractedTeleContent.includes('decrypt_script_via_backend()'),
    'Has .sh.enc support': extractedTeleContent.includes('.sh.enc'),
    'Has BACKEND_URL hardcoded': hasHardcodedBackend,
    'Uses RDP_SCRIPTS_DIR': extractedTeleContent.includes('RDP_SCRIPTS_DIR'),
};

Object.entries(checks).forEach(([check, result]) => {
    console.log(`   ${result ? '✅' : '❌'} ${check}`);
});

console.log('');

// Summary
console.log('========================================');
console.log('📊 Summary');
console.log('========================================\n');

if (hasHardcodedBackend && !hasParameterBackend) {
    console.log('✅ Binary is UP TO DATE');
    console.log('   - Uses hardcoded BACKEND_URL');
    console.log('   - No parameter parsing issues');
} else {
    console.log('❌ Binary is OUT OF DATE');
    console.log('   - Still uses parameter BACKEND_URL');
    console.log('   - Need to rebuild: node build-binary-img.js');
}

// Cleanup
fs.rmSync(tempDir, { recursive: true, force: true });

function findFile(dir, filename) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            const found = findFile(fullPath, filename);
            if (found) return found;
        } else if (file.name === filename) {
            return fullPath;
        }
    }
    return null;
}

