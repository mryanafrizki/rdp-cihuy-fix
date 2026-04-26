#!/usr/bin/env node

/**
 * Build Secure Self-Extracting RDP Installer
 * 
 * Usage:
 *   node build-secure-installer.js <base-img-path> <master-key> [output-path]
 * 
 * Example:
 *   node build-secure-installer.js windows-base.img "my-master-key-32-chars!!" rdp-installer.img
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Configuration
const ALGORITHM = 'aes-256-cbc';
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;

/**
 * Encrypt data using AES-256-CBC with PBKDF2 key derivation
 * Compatible with OpenSSL: openssl enc -aes-256-cbc -pbkdf2
 */
function encryptData(data, password) {
    // Generate random salt
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Derive key using PBKDF2 (compatible with OpenSSL)
    const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt data
    const encrypted = Buffer.concat([
        cipher.update(data),
        cipher.final()
    ]);
    
    // Format: salt (16 bytes) + iv (16 bytes) + encrypted data
    // This format is compatible with OpenSSL
    const result = Buffer.concat([salt, iv, encrypted]);
    
    return {
        encrypted: result,
        salt: salt.toString('base64'),
        iv: iv.toString('base64')
    };
}

/**
 * Generate bash stub for self-extracting script
 */
function generateBashStub() {
    return `#!/bin/bash
# Self-Extracting Encrypted RDP Installer
# This script extracts and decrypts the encrypted payload

set -e

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

# Encryption constants (must match build-secure-installer.js)
PBKDF2_ITERATIONS=100000

# Default values
EXTRACT_DIR="/tmp/.rdp-installer-extracted"
USER_KEY=""
ENCRYPTED_MASTER_KEY=""
BACKEND_URL=""
RDP_PORT="3389"
PASSWORD=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --user-key)
            USER_KEY="$2"
            shift 2
            ;;
        --encrypted-master-key)
            ENCRYPTED_MASTER_KEY="$2"
            shift 2
            ;;
        --backend-url)
            BACKEND_URL="$2"
            shift 2
            ;;
        --rdp-port)
            RDP_PORT="$2"
            shift 2
            ;;
        --password)
            PASSWORD="$2"
            shift 2
            ;;
        *)
            echo -e "$RED Unknown option: $1 $NC"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$USER_KEY" ] || [ -z "$ENCRYPTED_MASTER_KEY" ]; then
    echo -e "$RED Error: --user-key and --encrypted-master-key are required $NC"
    echo "Usage: $0 --user-key <key> --encrypted-master-key <encrypted_key> [--backend-url <url>] [--rdp-port <port>] [--password <pass>]"
    exit 1
fi

echo -e "$GREEN 🔐 Starting secure RDP installer... $NC"

# Find marker line
MARKER_LINE=$(grep -n "^__ARCHIVE_BELOW__" "$0" | cut -d: -f1)
if [ -z "$MARKER_LINE" ]; then
    echo -e "$RED Error: Archive marker not found $NC"
    exit 1
fi

# Calculate line number after marker
PAYLOAD_START=$((MARKER_LINE + 1))

echo -e "$YELLOW 📦 Extracting encrypted payload... $NC"

# Extract encrypted payload (everything after marker)
PAYLOAD_FILE="/tmp/rdp-payload-$$.enc"
tail -n +$PAYLOAD_START "$0" > "$PAYLOAD_FILE"

# Step 1: Decrypt master key using user key
echo -e "$YELLOW 🔑 Decrypting master key... $NC"

# Decode base64 encrypted master key
ENCRYPTED_MASTER_KEY_BIN="/tmp/enc-master-key-$$.bin"
echo -n "$ENCRYPTED_MASTER_KEY" | base64 -d > "$ENCRYPTED_MASTER_KEY_BIN" 2>/dev/null

if [ $? -ne 0 ] || [ ! -s "$ENCRYPTED_MASTER_KEY_BIN" ]; then
    echo -e "$RED Error: Failed to decode encrypted master key $NC"
    rm -f "$PAYLOAD_FILE" "$ENCRYPTED_MASTER_KEY_BIN"
    exit 1
fi

# Extract salt (first 16 bytes) and IV (next 16 bytes) and encrypted data
SALT_FILE="/tmp/salt-$$.bin"
IV_FILE="/tmp/iv-$$.bin"
ENCRYPTED_KEY_FILE="/tmp/enc-key-data-$$.bin"

dd if="$ENCRYPTED_MASTER_KEY_BIN" of="$SALT_FILE" bs=1 count=16 2>/dev/null
dd if="$ENCRYPTED_MASTER_KEY_BIN" of="$IV_FILE" bs=1 skip=16 count=16 2>/dev/null
dd if="$ENCRYPTED_MASTER_KEY_BIN" of="$ENCRYPTED_KEY_FILE" bs=1 skip=32 2>/dev/null

SALT_HEX=$(xxd -p -c 256 "$SALT_FILE" | tr -d '\\n')
IV_HEX=$(xxd -p -c 256 "$IV_FILE" | tr -d '\\n')

# Decrypt master key with user key
MASTER_KEY=$(openssl enc -aes-256-cbc -d -pbkdf2 -iter $PBKDF2_ITERATIONS \
    -S "$SALT_HEX" \
    -iv "$IV_HEX" \
    -pass pass:"$USER_KEY" \
    -in "$ENCRYPTED_KEY_FILE" 2>/dev/null | strings | head -1 | tr -d '\\0\\n\\r')

rm -f "$ENCRYPTED_MASTER_KEY_BIN" "$SALT_FILE" "$IV_FILE" "$ENCRYPTED_KEY_FILE"

if [ -z "$MASTER_KEY" ]; then
    echo -e "$RED Error: Failed to decrypt master key $NC"
    rm -f "$PAYLOAD_FILE"
    exit 1
fi

# Step 2: Decrypt payload using master key
echo -e "$YELLOW 🔓 Decrypting installer image... $NC"
mkdir -p "$EXTRACT_DIR"
DECRYPTED_IMG="$EXTRACT_DIR/rdp-installer.img"

openssl enc -aes-256-cbc -d -pbkdf2 -iter $PBKDF2_ITERATIONS \
    -pass pass:"$MASTER_KEY" \
    -in "$PAYLOAD_FILE" \
    -out "$DECRYPTED_IMG" 2>/dev/null

if [ $? -ne 0 ] || [ ! -f "$DECRYPTED_IMG" ]; then
    echo -e "$RED Error: Failed to decrypt installer image $NC"
    rm -f "$PAYLOAD_FILE"
    exit 1
fi

rm -f "$PAYLOAD_FILE"

if [ ! -s "$DECRYPTED_IMG" ]; then
    echo -e "$RED Error: Decrypted image is empty $NC"
    rm -f "$DECRYPTED_IMG"
    exit 1
fi

echo -e "$GREEN ✅ Decryption successful $NC"
echo -e "$GREEN    Decrypted image: $DECRYPTED_IMG $NC"

export RDP_SCRIPTS_DIR="$EXTRACT_DIR"
export DECRYPTED_IMG_PATH="$DECRYPTED_IMG"
export BACKEND_URL
export RDP_PORT
export PASSWORD

echo -e "$GREEN 🚀 Starting installation... $NC"
echo -e "$GREEN ✅ Installer ready at: $DECRYPTED_IMG $NC"

exit 0

__ARCHIVE_BELOW__
`;
}


/**
 * Main build function
 */
function buildSecureInstaller(baseImgPath, masterKey, outputPath) {
    console.log('🔨 Building secure self-extracting installer...');
    console.log(`   Base IMG: ${baseImgPath}`);
    console.log(`   Output: ${outputPath}`);
    
    // Read base IMG
    if (!fs.existsSync(baseImgPath)) {
        console.error(`❌ Error: Base IMG not found: ${baseImgPath}`);
        process.exit(1);
    }
    
    const baseImgData = fs.readFileSync(baseImgPath);
    console.log(`   Base IMG size: ${(baseImgData.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Encrypt base IMG with master key
    console.log('🔐 Encrypting base IMG...');
    const encrypted = encryptData(baseImgData, masterKey);
    console.log(`   Encrypted size: ${(encrypted.encrypted.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Salt: ${encrypted.salt.substring(0, 16)}...`);
    console.log(`   IV: ${encrypted.iv.substring(0, 16)}...`);
    
    // Generate bash stub
    console.log('📝 Generating bash stub...');
    const bashStub = generateBashStub();
    
    // Combine stub + encrypted payload
    console.log('📦 Combining stub + encrypted payload...');
    const finalContent = Buffer.concat([
        Buffer.from(bashStub, 'utf8'),
        Buffer.from('\n'), // Ensure newline before payload
        encrypted.encrypted
    ]);
    
    // Write output file
    fs.writeFileSync(outputPath, finalContent);
    fs.chmodSync(outputPath, 0o755); // Make executable
    
    console.log(`✅ Secure installer built: ${outputPath}`);
    console.log(`   Total size: ${(finalContent.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Stub size: ${(bashStub.length / 1024).toFixed(2)} KB`);
    console.log(`   Payload size: ${(encrypted.encrypted.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Save encryption info (for reference, not included in final file)
    const infoPath = outputPath + '.info.json';
    fs.writeFileSync(infoPath, JSON.stringify({
        algorithm: ALGORITHM,
        pbkdf2_iterations: PBKDF2_ITERATIONS,
        salt_length: SALT_LENGTH,
        iv_length: IV_LENGTH,
        base_img_size: baseImgData.length,
        encrypted_size: encrypted.encrypted.length,
        stub_size: bashStub.length,
        total_size: finalContent.length,
        created_at: new Date().toISOString()
    }, null, 2));
    
    console.log(`📄 Encryption info saved: ${infoPath}`);
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.error('Usage: node build-secure-installer.js <base-img-path> <master-key> [output-path]');
        console.error('');
        console.error('Example:');
        console.error('  node build-secure-installer.js windows-base.img "my-master-key-32-chars!!" rdp-installer.img');
        process.exit(1);
    }
    
    const baseImgPath = args[0];
    const masterKey = args[1];
    const outputPath = args[2] || 'rdp-installer.img';
    
    // Validate master key length (should be at least 32 chars for AES-256)
    if (masterKey.length < 32) {
        console.warn('⚠️  Warning: Master key should be at least 32 characters for AES-256');
    }
    
    buildSecureInstaller(baseImgPath, masterKey, outputPath);
}

module.exports = {
    buildSecureInstaller,
    encryptData,
    generateBashStub
};

