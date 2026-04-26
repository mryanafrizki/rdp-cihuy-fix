#!/usr/bin/env node
/**
 * Encrypt Script Files (tele.sh, reinstall.sh, trans.sh)
 * 
 * This script encrypts the script files and saves them as .enc files.
 * The encrypted scripts will be packaged into rdp-installer.img.
 * Scripts will be decrypted on-the-fly when the .img is extracted.
 * 
 * Usage:
 *   node encrypt-scripts.js [--script tele|reinstall|trans|all]
 * 
 * Environment Variables:
 *   SCRIPT_ENCRYPTION_KEY - Master encryption key (base64, 32 bytes)
 *                            If not set, will generate a new key
 * 
 * Output:
 *   - rdp/scripts/tele.sh.enc
 *   - rdp/scripts/reinstall.sh.enc
 *   - rdp/scripts/trans.sh.enc
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const SCRIPTS_DIR = path.join(__dirname, 'rdp/scripts');

// Script files to encrypt
const SCRIPTS = {
    tele: {
        file: 'tele.sh',
        output: 'tele.sh.enc',
        description: 'Telegram bot installer script'
    },
    reinstall: {
        file: 'reinstall.sh',
        output: 'reinstall.sh.enc',
        description: 'Main reinstallation script'
    },
    trans: {
        file: 'trans.sh',
        output: 'trans.sh.enc',
        description: 'Translation/installation helper script'
    }
};

/**
 * Generate encryption key if not provided
 */
function generateEncryptionKey() {
    return crypto.randomBytes(32).toString('base64');
}

/**
 * Encrypt file using AES-256-GCM
 * Format: [IV (16 bytes)][AuthTag (16 bytes)][Encrypted Data]
 */
function encryptFile(filePath, keyBase64) {
    return new Promise((resolve, reject) => {
        try {
            const fileContent = fs.readFileSync(filePath);
            const keyBuffer = Buffer.from(keyBase64, 'base64');
            
            if (keyBuffer.length !== 32) {
                throw new Error('Encryption key must be 32 bytes (base64 decoded)');
            }
            
            // Generate random IV (16 bytes)
            const iv = crypto.randomBytes(16);
            
            // Create cipher
            const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
            
            // Encrypt
            const encrypted = Buffer.concat([
                cipher.update(fileContent),
                cipher.final()
            ]);
            
            // Get auth tag (16 bytes)
            const authTag = cipher.getAuthTag();
            
            // Format: [IV (16)][AuthTag (16)][Encrypted Data]
            const result = Buffer.concat([iv, authTag, encrypted]);
            
            resolve(result);
        } catch (error) {
            reject(error);
        }
    });
}


/**
 * Encrypt and save a single script
 */
async function encryptAndSaveScript(scriptName, encryptionKey) {
    const script = SCRIPTS[scriptName];
    if (!script) {
        throw new Error(`Unknown script: ${scriptName}`);
    }
    
    const filePath = path.join(SCRIPTS_DIR, script.file);
    const outputPath = path.join(SCRIPTS_DIR, script.output);
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`Script file not found: ${filePath}`);
    }
    
    console.log(`\n🔐 Encrypting ${script.file}...`);
    console.log(`   Description: ${script.description}`);
    console.log(`   Source: ${filePath}`);
    
    const fileSize = fs.statSync(filePath).size;
    console.log(`   Original size: ${(fileSize / 1024).toFixed(2)}KB`);
    
    // Encrypt
    const encryptedData = await encryptFile(filePath, encryptionKey);
    const encryptedSize = encryptedData.length;
    console.log(`   Encrypted size: ${(encryptedSize / 1024).toFixed(2)}KB`);
    
    // Save encrypted file
    fs.writeFileSync(outputPath, encryptedData);
    console.log(`   ✅ Saved: ${outputPath}`);
    
    return {
        script: scriptName,
        file: script.file,
        output: script.output,
        originalSize: fileSize,
        encryptedSize: encryptedSize,
        outputPath: outputPath
    };
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    const scriptArg = args.find(arg => arg.startsWith('--script='))?.split('=')[1] || 
                     args.includes('--script') ? args[args.indexOf('--script') + 1] : 'all';
    
    // Get encryption key
    let encryptionKey = process.env.SCRIPT_ENCRYPTION_KEY || 'wmJIl9CxWVZw9kNLsavb/IjbWY+WWgv8t9ly1/tTP/w=';
    
    if (!encryptionKey) {
        console.log('⚠️  SCRIPT_ENCRYPTION_KEY not set in environment');
        console.log('   Generating new encryption key...');
        encryptionKey = generateEncryptionKey();
        console.log(`\n🔑 Generated encryption key:`);
        console.log(`   ${encryptionKey}`);
        console.log(`\n⚠️  IMPORTANT: Save this key and set it as SCRIPT_ENCRYPTION_KEY in your backend!`);
        console.log(`   Add to wrangler.toml or environment variables:\n`);
        console.log(`   SCRIPT_ENCRYPTION_KEY = "${encryptionKey}"\n`);
    } else {
        console.log(`🔑 Using encryption key from environment`);
        console.log(`   Key: ${encryptionKey.substring(0, 16)}...`);
    }
    
    console.log(`\n📦 Scripts directory: ${SCRIPTS_DIR}`);
    console.log(`\n🚀 Starting encryption process...\n`);
    
    try {
        const scriptsToProcess = scriptArg === 'all' 
            ? Object.keys(SCRIPTS) 
            : [scriptArg];
        
        const results = [];
        
        for (const scriptName of scriptsToProcess) {
            if (!SCRIPTS[scriptName]) {
                console.error(`❌ Unknown script: ${scriptName}`);
                console.error(`   Available: ${Object.keys(SCRIPTS).join(', ')}, all`);
                continue;
            }
            
            try {
                const result = await encryptAndSaveScript(scriptName, encryptionKey);
                results.push(result);
            } catch (error) {
                console.error(`❌ Failed to encrypt ${scriptName}: ${error.message}`);
            }
        }
        
        // Summary
        console.log(`\n📊 Summary:`);
        console.log(`   Scripts processed: ${results.length}`);
        let totalOriginal = 0;
        let totalEncrypted = 0;
        
        results.forEach(result => {
            totalOriginal += result.originalSize;
            totalEncrypted += result.encryptedSize;
            console.log(`   - ${result.file} → ${result.output}: ${(result.originalSize / 1024).toFixed(2)}KB → ${(result.encryptedSize / 1024).toFixed(2)}KB`);
        });
        
        console.log(`\n   Total: ${(totalOriginal / 1024).toFixed(2)}KB → ${(totalEncrypted / 1024).toFixed(2)}KB`);
        console.log(`\n✅ All scripts encrypted successfully!`);
        console.log(`\n📦 Encrypted files saved to: ${SCRIPTS_DIR}`);
        console.log(`   These .enc files will be packaged into rdp-installer.img`);
        
        if (!process.env.SCRIPT_ENCRYPTION_KEY) {
            console.log(`\n⚠️  IMPORTANT: Save this encryption key!`);
            console.log(`   Set SCRIPT_ENCRYPTION_KEY in your backend environment (wrangler.toml):`);
            console.log(`   SCRIPT_ENCRYPTION_KEY = "${encryptionKey}"`);
            console.log(`\n   This key is needed to decrypt scripts when .img is extracted.`);
        } else {
            console.log(`\n✅ Encryption key is set in environment`);
            console.log(`   Make sure SCRIPT_ENCRYPTION_KEY is also set in backend for decryption.`);
        }
        
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    }
}

// Run
if (require.main === module) {
    main().catch(error => {
        console.error(`\n❌ Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { encryptFile, encryptAndSaveScript };

