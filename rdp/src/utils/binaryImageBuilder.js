const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * Build binary .img file yang berisi semua script instalasi
 * Binary ini adalah self-extracting archive yang bisa langsung di-run
 */
class BinaryImageBuilder {
    constructor() {
        this.scriptsDir = path.join(__dirname, '../../scripts');
        this.outputDir = path.join(__dirname, '../../dist');
        this.tempDir = path.join(__dirname, '../../temp/builder');
    }

    /**
     * Get semua script files yang perlu di-package
     * ONLY use .enc files - NO fallback to .sh files
     */
    getScriptFiles() {
        const scriptsDir = this.scriptsDir;
        const files = [];

        // Scripts yang HARUS di-encrypt (ONLY .enc files, NO .sh fallback)
        // NOTE: trans.sh temporarily disabled from encryption for debugging
        const encryptableScripts = [
            'tele.sh',
            'reinstall.sh'
            // 'trans.sh' - temporarily disabled, using plaintext
        ];

        // Scripts lainnya (plaintext, tidak di-encrypt)
        const otherScripts = [
            'get-xda.sh',
            'initrd-network.sh',
            'ubuntu-storage-early.sh',
            'resize.sh',
            'ttys.sh',
            'fix-eth-name.sh',
            'get-frpc-url.sh',
            'cloud-init-fix-onlink.sh',
            'windows-driver-utils.sh'
        ];

        // Process encryptable scripts (ONLY use .enc, NO fallback to .sh)
        // This ensures binary ONLY contains encrypted scripts
        encryptableScripts.forEach(scriptName => {
            const encPath = path.join(scriptsDir, scriptName + '.enc');
            const shPath = path.join(scriptsDir, scriptName);
            
            if (fs.existsSync(encPath)) {
                // Use encrypted version
                files.push({
                    name: scriptName + '.enc',
                    path: encPath,
                    relative: scriptName + '.enc',
                    isEncrypted: true
                });
                console.log(`  ✓ ${scriptName}.enc (encrypted)`);
            } else {
                // NO fallback - require .enc files
                console.error(`  ❌ ${scriptName}.enc NOT FOUND!`);
                console.error(`     Run: node encrypt-scripts.js --script ${scriptName.replace('.sh', '')}`);
                throw new Error(`Encrypted script not found: ${scriptName}.enc. Please run: node encrypt-scripts.js`);
            }
        });
        
        // Handle trans.sh as plaintext (temporarily disabled from encryption)
        const transShPath = path.join(scriptsDir, 'trans.sh');
        if (fs.existsSync(transShPath)) {
            files.push({
                name: 'trans.sh',
                path: transShPath,
                relative: 'trans.sh',
                isEncrypted: false
            });
            console.log(`  ✓ trans.sh (plaintext - encryption disabled for debugging)`);
        } else {
            console.warn(`  ⚠️  trans.sh not found (optional)`);
        }

        // Process other scripts (always plaintext)
        const mainScripts = otherScripts;

        // Windows scripts
        const windowsScripts = [
            'windows-setup.bat',
            'windows-resize.bat',
            'windows-pass.bat',
            'windows-change-rdp-port.bat',
            'windows-allow-ping.bat',
            'windows-del-gpo.bat',
            'windows-frpc.bat',
            'windows-set-netconf.bat',
            'windows.xml',
            'windows-frpc.xml',
            'wmic.ps1'
        ];

        // Config files
        const configFiles = [
            'debian.cfg',
            'redhat.cfg',
            'ubuntu.yaml',
            'cloud-init.yaml',
            'frpc-example.toml',
            'frpc.service',
            'fix-eth-name.initd',
            'fix-eth-name.service',
            'logviewer.html',
            'logviewer-nginx.conf'
        ];

        // Collect other files (plaintext)
        [...mainScripts, ...windowsScripts, ...configFiles].forEach(file => {
            const filePath = path.join(scriptsDir, file);
            if (fs.existsSync(filePath)) {
                files.push({
                    name: file,
                    path: filePath,
                    relative: file,
                    isEncrypted: false
                });
                console.log(`  ✓ ${file}`);
            }
        });

        // Add subdirectories
        const subdirs = ['fix'];
        subdirs.forEach(subdir => {
            const subdirPath = path.join(scriptsDir, subdir);
            if (fs.existsSync(subdirPath)) {
                const subdirFiles = fs.readdirSync(subdirPath);
                subdirFiles.forEach(file => {
                    const filePath = path.join(subdirPath, file);
                    if (fs.statSync(filePath).isFile()) {
                        files.push({
                            name: file,
                            path: filePath,
                            relative: path.join(subdir, file)
                        });
                    }
                });
            }
        });

        return files;
    }

    /**
     * Create self-extracting archive header
     */
    createExtractorHeader() {
        // Add build timestamp and version for verification
        const buildTimestamp = new Date().toISOString();
        const buildVersion = `v${Date.now()}`;
        
        return `#!/bin/bash
# Binary Build Info (for verification)
# Build Timestamp: ${buildTimestamp}
# Build Version: ${buildVersion}
# This binary contains encrypted scripts (.sh.enc files only)
# Self-extracting RDP Installer Binary
# This file contains all installation scripts packaged into one binary

set -e

# Get script directory
SCRIPT_DIR="\$(cd "\$(dirname "\$0")" && pwd)"
EXTRACT_DIR="\${SCRIPT_DIR}/.rdp-installer-extracted"

# Debug: Show extraction start
echo "Starting binary extraction..." >&2
echo "Script dir: \${SCRIPT_DIR}" >&2
echo "Extract dir: \${EXTRACT_DIR}" >&2

# Create extraction directory
mkdir -p "\${EXTRACT_DIR}" || {
    echo "ERROR: Failed to create extraction directory" >&2
    exit 1
}

# Find archive start (after this header)
ARCHIVE_START=\$(awk '/^__ARCHIVE_BELOW__/ {print NR + 1; exit 0; }' "\$0")

if [ -z "\$ARCHIVE_START" ]; then
    echo "ERROR: Archive marker not found" >&2
    exit 1
fi

echo "Archive starts at line: \${ARCHIVE_START}" >&2

# Extract archive
echo "Extracting archive..." >&2
if ! tail -n +\${ARCHIVE_START} "\$0" | tar -xz -C "\${EXTRACT_DIR}" 2>&1; then
    echo "ERROR: Failed to extract archive" >&2
    exit 1
fi

# Verify extraction (ONLY check for encrypted scripts - NO plaintext fallback)
if [ ! -f "\${EXTRACT_DIR}/tele.sh.enc" ]; then
    echo "ERROR: tele.sh.enc not found after extraction" >&2
    echo "   This binary REQUIRES encrypted scripts (.sh.enc files only)" >&2
    echo "Extracted files:" >&2
    ls -la "\${EXTRACT_DIR}" >&2 || true
    exit 1
fi

# All scripts MUST be encrypted (.enc files only)
echo "🔐 Encrypted scripts detected (.enc files)" >&2
echo "   Scripts will be decrypted on-the-fly via backend API" >&2

echo "Extraction successful!" >&2
echo "Extracted files:" >&2
ls -la "\${EXTRACT_DIR}" | head -10 >&2 || true

# Note: .enc files are not executable, they need to be decrypted first via backend
# Only set permissions for other non-encrypted scripts (if any)
chmod +x "\${EXTRACT_DIR}"/*.sh 2>/dev/null || true
chmod +x "\${EXTRACT_DIR}"/*/*.sh 2>/dev/null || true
# Fix Windows CRLF line endings (\\r) that break bash scripts
for f in "\${EXTRACT_DIR}"/*.sh "\${EXTRACT_DIR}"/*/*.sh "\${EXTRACT_DIR}"/*.sh.enc; do
  [ -f "\$f" ] && sed -i 's/\\r\$//' "\$f" 2>/dev/null || true
done
# .enc files will be decrypted on-the-fly, not executed directly

# Export scripts directory for use in scripts
export RDP_SCRIPTS_DIR="\${EXTRACT_DIR}"
echo "RDP_SCRIPTS_DIR=\${RDP_SCRIPTS_DIR}" >&2

# Display build info for verification
echo "📦 Binary Build Info:" >&2
echo "   Build Timestamp: ${buildTimestamp}" >&2
echo "   Build Version: ${buildVersion}" >&2
echo "" >&2

# Verify RDP_SCRIPTS_DIR is set
if [ -z "\${RDP_SCRIPTS_DIR}" ]; then
    echo "ERROR: RDP_SCRIPTS_DIR not set" >&2
    exit 1
fi

# Run main script
if [ "\$1" = "--extract-only" ]; then
    echo "Extracted to: \${EXTRACT_DIR}"
    echo "Files:"
    ls -la "\${EXTRACT_DIR}" | head -20
    exit 0
fi

# ONLY support encrypted scripts (.sh.enc) - NO plaintext fallback
if [ ! -f "\${EXTRACT_DIR}/tele.sh.enc" ]; then
    echo "ERROR: tele.sh.enc not found" >&2
    echo "   This binary REQUIRES encrypted scripts (.sh.enc files only)" >&2
    exit 1
fi

# Encrypted mode: scripts are .enc files
# tele.sh.enc needs to be decrypted via backend before execution
# tele.sh will handle decryption on-the-fly via backend API
echo "🔐 Encrypted scripts detected (.sh.enc files only)" >&2
echo "   Scripts will be decrypted on-the-fly via backend API" >&2
echo "   NO plaintext fallback - encrypted scripts only" >&2

# Decrypt tele.sh.enc via backend API before execution
# tele.sh.enc cannot be executed directly - it must be decrypted first
# We'll decrypt it using backendUrl from arguments (3rd argument: <password> <imgToken> <backendUrl> <rdpPort>)
echo "🔐 Decrypting tele.sh.enc via backend API..." >&2

# Get backendUrl from arguments (3rd argument)
# CRITICAL: Use explicit assignment and validate format
BACKEND_URL_FROM_ARGS="\$3"

# Debug: Show what we received
echo "   Raw argument \$3: '\$BACKEND_URL_FROM_ARGS'" >&2

# Validate that $3 is actually a URL, not a password or other argument
if echo "\$BACKEND_URL_FROM_ARGS" | grep -qE '^--password='; then
    echo "❌ ERROR: Argument \$3 appears to be a password, not a backend URL!" >&2
    echo "   This indicates parameter parsing error" >&2
    echo "   Received: '\$BACKEND_URL_FROM_ARGS'" >&2
    echo "   Expected: URL starting with http:// or https://" >&2
    echo "   All arguments received:" >&2
    echo "     \$1: [REDACTED]" >&2
    echo "     \$2: \${2:0:20}..." >&2
    echo "     \$3: '\$BACKEND_URL_FROM_ARGS'" >&2
    echo "     \$4: '\$4'" >&2
    exit 1
fi

if [ -z "\$BACKEND_URL_FROM_ARGS" ]; then
    echo "❌ ERROR: Backend URL not provided in arguments" >&2
    echo "   Usage: ./rdp-installer-azovest.img <password> <imgToken> <backendUrl> <rdpPort>" >&2
    exit 1
fi

# Validate URL format
if ! echo "\$BACKEND_URL_FROM_ARGS" | grep -qE '^https?://'; then
    echo "❌ ERROR: Invalid backend URL format" >&2
    echo "   Received: '\$BACKEND_URL_FROM_ARGS'" >&2
    echo "   Expected: URL starting with http:// or https://" >&2
    exit 1
fi

# Get rdpPort from arguments (4th argument)
# Usage: ./rdp-installer-azovest.img <password> <imgToken> <backendUrl> <rdpPort>
RDP_PORT_FROM_ARGS="\$4"

# If rdpPort contains extra flags (e.g., "3389 --legacy-binary"), extract just the port number
# Remove everything after first space or non-digit
RDP_PORT_CLEAN=\$(echo "\$RDP_PORT_FROM_ARGS" | sed 's/[^0-9].*//' | head -1)

# Default to 3389 if not provided or invalid
if [ -z "\$RDP_PORT_CLEAN" ] || ! echo "\$RDP_PORT_CLEAN" | grep -qE '^[0-9]+$'; then
    echo "⚠️  Warning: Invalid RDP_PORT from arguments: '\${RDP_PORT_FROM_ARGS}', using default 3389" >&2
    RDP_PORT_CLEAN="3389"
fi

echo "   RDP Port from arguments: \${RDP_PORT_FROM_ARGS}" >&2
echo "   RDP Port (cleaned): \${RDP_PORT_CLEAN}" >&2

# Get decrypt token for tele.sh.enc
DECRYPT_TOKEN_RESPONSE=\$(curl -s -X POST "\${BACKEND_URL_FROM_ARGS}/x/gs" \\
  -H "Content-Type: application/json" \\
  -d "{\\"scriptType\\":\\"tele\\",\\"rdpPort\\":\${RDP_PORT_CLEAN}}" 2>/dev/null)

if [ \$? -ne 0 ] || [ -z "\$DECRYPT_TOKEN_RESPONSE" ]; then
    echo "❌ ERROR: Failed to get decrypt token from backend" >&2
    echo "   Backend URL: \${BACKEND_URL_FROM_ARGS}" >&2
    exit 1
fi

# Parse token
DECRYPT_TOKEN=\$(echo "\$DECRYPT_TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null)

if [ -z "\$DECRYPT_TOKEN" ]; then
    echo "❌ ERROR: Failed to parse decrypt token" >&2
    exit 1
fi

# Read encrypted content and encode to base64
ENCRYPTED_BASE64=\$(base64 -w 0 "\${EXTRACT_DIR}/tele.sh.enc" 2>/dev/null || base64 "\${EXTRACT_DIR}/tele.sh.enc" 2>/dev/null | tr -d '\\n')

# Request decrypt from backend
# Use temp file to capture response and HTTP code
TEMP_DECRYPT_RESPONSE="/tmp/decrypt_tele_response_\$\$.txt"
TEMP_DECRYPT_STDERR="/tmp/decrypt_tele_stderr_\$\$.txt"

HTTP_CODE=\$(curl -s -w "%{http_code}" -o "\$TEMP_DECRYPT_RESPONSE" -X POST "\${BACKEND_URL_FROM_ARGS}/ds/\${DECRYPT_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d "{\\"scriptName\\":\\"tele.sh.enc\\",\\"encryptedContent\\":\\"\${ENCRYPTED_BASE64}\\"}" 2>"\$TEMP_DECRYPT_STDERR")

CURL_EXIT=\$?

# Check curl errors
if [ \$CURL_EXIT -ne 0 ]; then
    echo "❌ ERROR: curl failed with exit code \$CURL_EXIT" >&2
    if [ -f "\$TEMP_DECRYPT_STDERR" ]; then
        echo "   Curl error: \$(cat "\$TEMP_DECRYPT_STDERR")" >&2
        rm -f "\$TEMP_DECRYPT_STDERR"
    fi
    rm -f "\$TEMP_DECRYPT_RESPONSE"
    exit 1
fi

rm -f "\$TEMP_DECRYPT_STDERR"

# Read response
if [ -f "\$TEMP_DECRYPT_RESPONSE" ]; then
    DECRYPTED_TELE=\$(cat "\$TEMP_DECRYPT_RESPONSE")
    rm -f "\$TEMP_DECRYPT_RESPONSE"
else
    DECRYPTED_TELE=""
fi

echo "   HTTP Code: \${HTTP_CODE}" >&2
echo "   Response size: \${#DECRYPTED_TELE} bytes" >&2

# Check HTTP code
if [ "\$HTTP_CODE" != "200" ]; then
    echo "❌ ERROR: Decrypt endpoint returned HTTP \$HTTP_CODE" >&2
    echo "   Response: \$(echo "\$DECRYPTED_TELE" | head -c 500)" >&2
    
    # Try to parse JSON error
    if echo "\$DECRYPTED_TELE" | grep -q '"error"'; then
        ERROR_MSG=\$(echo "\$DECRYPTED_TELE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 2>/dev/null || \\
          echo "\$DECRYPTED_TELE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 2>/dev/null)
        if [ -n "\$ERROR_MSG" ]; then
            echo "   Error message: \${ERROR_MSG}" >&2
        fi
    fi
    exit 1
fi

if [ -z "\$DECRYPTED_TELE" ]; then
    echo "❌ ERROR: Empty decrypted content from backend" >&2
    exit 1
fi

# Backend returns plaintext decrypted script on success (HTTP 200)
# Check if response is error JSON (backend returns JSON only on error with HTTP 200)
# Valid decrypted content should start with shebang, not JSON
FIRST_CHAR=\$(echo "\$DECRYPTED_TELE" | head -c 1)
FIRST_LINE=\$(echo "\$DECRYPTED_TELE" | head -1 | tr -d '\\r\\n')

echo "   First char: '\${FIRST_CHAR}'" >&2
echo "   First line preview: \${FIRST_LINE:0:80}..." >&2

# If response starts with {, it's likely JSON error (even with HTTP 200)
if [ "\$FIRST_CHAR" = "{" ]; then
    if echo "\$DECRYPTED_TELE" | grep -q '"error"'; then
        echo "❌ ERROR: Backend returned JSON error (even with HTTP 200)" >&2
        ERROR_MSG=\$(echo "\$DECRYPTED_TELE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 2>/dev/null || \\
          echo "\$DECRYPTED_TELE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 2>/dev/null)
        echo "   Error: \${ERROR_MSG:-$DECRYPTED_TELE}" >&2
        exit 1
    fi
fi

# Validate decrypted content (should start with shebang for shell scripts)
if echo "\$FIRST_LINE" | grep -q "^#!/"; then
    # Valid - starts with shebang
    echo "   ✅ Decrypted content starts with shebang: \${FIRST_LINE:0:50}..." >&2
else
    # Doesn't start with shebang - check if it's an error message
    FIRST_100=\$(echo "\$DECRYPTED_TELE" | head -c 100)
    if echo "\$FIRST_100" | grep -qiE '"error"|"message"|error|failed|invalid|decryption'; then
        echo "❌ ERROR: Response appears to be an error message, not decrypted script" >&2
        echo "   Response: \$(echo "\$DECRYPTED_TELE" | head -c 500)" >&2
        exit 1
    fi
    
    # If content is substantial, might still be valid (some scripts don't have shebang)
    DECRYPTED_SIZE=\$(echo -n "\$DECRYPTED_TELE" | wc -c)
    if [ \$DECRYPTED_SIZE -lt 100 ]; then
        echo "❌ ERROR: Content too short (\${DECRYPTED_SIZE} bytes) and missing shebang" >&2
        echo "   Response: \${DECRYPTED_TELE}" >&2
        exit 1
    else
        echo "⚠️  Warning: Content doesn't start with shebang but is substantial (\${DECRYPTED_SIZE} bytes)" >&2
        echo "   Continuing anyway..." >&2
    fi
fi

# Save decrypted tele.sh to temporary file and execute
TEMP_TELE="/tmp/tele_\$\$.sh"
echo "\$DECRYPTED_TELE" > "\$TEMP_TELE"
# Fix Windows CRLF line endings
sed -i 's/\\r\$//' "\$TEMP_TELE" 2>/dev/null || true
chmod +x "\$TEMP_TELE"

echo "✅ Decrypted tele.sh.enc successfully" >&2
echo "" >&2
echo "📋 Starting installation script..." >&2

# PATCH: Remove output suppression from tele.sh so we can see errors
# tele.sh line 3 has: exec >/dev/null 2>&1
# We need to remove or comment it out
sed -i 's|^exec >/dev/null 2>&1|# exec >/dev/null 2>&1 # PATCHED: output enabled for debugging|' "\$TEMP_TELE"

echo "📋 tele.sh patched: output suppression removed" >&2

# Execute decrypted tele.sh with all arguments, capture output
LOG_FILE="/tmp/tele_install_\$\$.log"
bash "\$TEMP_TELE" "\$1" "\$2" "\$3" "\$4" 2>&1 | tee "\$LOG_FILE"
EXIT_CODE=\${PIPESTATUS[0]}

# Show last 50 lines of log if failed
if [ \$EXIT_CODE -ne 0 ]; then
    echo "" >&2
    echo "❌ tele.sh failed with exit code \$EXIT_CODE" >&2
    echo "📋 Last 50 lines of output:" >&2
    tail -50 "\$LOG_FILE" >&2 2>/dev/null || true
fi

# Cleanup
rm -f "\$LOG_FILE"

# Cleanup decrypted tele.sh immediately
rm -f "\$TEMP_TELE"

# Cleanup on exit
rm -rf "\${EXTRACT_DIR}" 2>/dev/null || true

exit \$EXIT_CODE

__ARCHIVE_BELOW__
`;
    }

    /**
     * Build binary .img file
     */
    build(outputPath = null) {
        console.log('🔨 Building binary .img installer...');

        // Create output directory
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // Create temp directory
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        // Get all script files
        const files = this.getScriptFiles();
        console.log(`📦 Found ${files.length} files to package`);

        // Create temp archive directory
        const archiveDir = path.join(this.tempDir, 'archive');
        if (fs.existsSync(archiveDir)) {
            fs.rmSync(archiveDir, { recursive: true, force: true });
        }
        fs.mkdirSync(archiveDir, { recursive: true });

        // Copy all files to archive directory
        files.forEach(file => {
            const destPath = path.join(archiveDir, file.relative);
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(file.path, destPath);
            console.log(`  ✓ ${file.relative}`);
        });

        // Create tar.gz archive
        const archivePath = path.join(this.tempDir, 'archive.tar.gz');
        console.log('📦 Creating tar.gz archive...');
        
        try {
            // Use cross-platform approach: create tar.gz from archiveDir
            // On Windows, use forward slashes and absolute paths
            const archiveDirResolved = path.resolve(archiveDir);
            const archivePathResolved = path.resolve(archivePath);
            
            // Convert to forward slashes for tar command (works on both Windows and Unix)
            const archiveDirForTar = archiveDirResolved.replace(/\\/g, '/');
            const archivePathForTar = archivePathResolved.replace(/\\/g, '/');
            
            // Use tar with -C flag to specify directory (more reliable than chdir)
            // This avoids path resolution issues on Windows
            const tarCommand = `tar --force-local -czf "${archivePathForTar}" -C "${archiveDirForTar}" .`;
            
            console.log(`   Command: ${tarCommand}`);
            
            execSync(tarCommand, { 
                stdio: 'inherit',
                cwd: path.resolve(this.tempDir), // Use absolute path for cwd
                shell: false, // Don't use shell to avoid path issues
                env: { ...process.env, PATH: process.env.PATH } // Preserve PATH
            });
        } catch (error) {
            console.error('❌ Failed to create tar.gz archive:', error.message);
            console.error('   Archive dir:', archiveDir);
            console.error('   Archive path:', archivePath);
            console.error('   Platform:', process.platform);
            console.error('\n   Tip: Make sure tar is available in your PATH');
            console.error('   On Windows, tar should be available in Windows 10+ or via Git Bash');
            throw error;
        }

        // Create self-extracting binary
        const header = this.createExtractorHeader();
        const finalOutputPath = outputPath || path.join(this.outputDir, 'rdp-installer-azovest.img');
        
        console.log('🔨 Creating self-extracting binary...');
        
        // Combine header + archive
        const headerBuffer = Buffer.from(header, 'utf8');
        const archiveBuffer = fs.readFileSync(archivePath);
        const finalBuffer = Buffer.concat([headerBuffer, archiveBuffer]);

        // Write final binary
        fs.writeFileSync(finalOutputPath, finalBuffer);
        
        // Make executable
        try {
            fs.chmodSync(finalOutputPath, 0o755);
        } catch (e) {
            // Windows doesn't support chmod, that's OK
        }

        // Calculate checksum
        const hash = crypto.createHash('sha256');
        hash.update(finalBuffer);
        const checksum = hash.digest('hex');

        // Get file size
        const fileSize = finalBuffer.length;
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

        console.log('');
        console.log('✅ Binary .img built successfully!');
        console.log(`📁 Output: ${finalOutputPath}`);
        console.log(`📊 Size: ${fileSizeMB} MB (${fileSize.toLocaleString()} bytes)`);
        console.log(`🔐 SHA256: ${checksum}`);
        console.log('');

        // Cleanup temp files
        try {
            fs.rmSync(this.tempDir, { recursive: true, force: true });
        } catch (e) {
            // Ignore cleanup errors
        }

        return {
            path: finalOutputPath,
            size: fileSize,
            sizeMB: fileSizeMB,
            checksum: checksum,
            filesCount: files.length
        };
    }

    /**
     * Verify binary .img file
     */
    verify(binaryPath) {
        console.log(`🔍 Verifying binary: ${binaryPath}`);

        if (!fs.existsSync(binaryPath)) {
            throw new Error(`Binary file not found: ${binaryPath}`);
        }

        // Check if it's a valid self-extracting archive
        const content = fs.readFileSync(binaryPath, 'utf8');
        if (!content.includes('__ARCHIVE_BELOW__')) {
            throw new Error('Invalid binary format: missing archive marker');
        }

        if (!content.includes('#!/bin/bash')) {
            throw new Error('Invalid binary format: missing shebang');
        }

        console.log('✅ Binary verification passed');
        return true;
    }
}

module.exports = BinaryImageBuilder;

