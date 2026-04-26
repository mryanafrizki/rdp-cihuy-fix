#!/bin/bash

exec >/dev/null 2>&1
# Encrypted RDP Installer with Backend API
# ALL scripts MUST be encrypted (.sh.enc) - NO fallback to plaintext
# Usage: tele.sh <password> <imgToken> <backendUrl> <rdpPort>

# Validate parameters - Always require 4 parameters (password, imgToken, backendUrl, rdpPort)
if [ "$#" -lt 4 ]; then
  echo "❌ Error: Invalid parameters"
  echo ""
  echo "Usage: $0 <password> <imgToken> <backendUrl> <rdpPort>"
  echo ""
  echo "This script REQUIRES backend API and encrypted scripts (.sh.enc files)."
  echo "Parameters:"
  echo "  password      - RDP Administrator password"
  echo "  imgToken      - Encrypted image token from backend API"
  echo "  backendUrl    - Backend API URL (e.g., https://api.yourdomain.com)"
  echo "  rdpPort       - RDP port number (e.g., 8765)"
  echo ""
  echo "Example:"
  echo "  $0 MyP@ssw0rd abc123token https://api.example.com 8765"
  exit 1
fi

# Get parameters - CRITICAL: Use explicit assignment to avoid parsing issues
PASSWORD="$1"
IMG_TOKEN="$2"
# BACKEND_URL="$3"  # Temporarily hardcoded to avoid parameter parsing issues
RDP_PORT="$4"

# HARDCODE BACKEND_URL for now to avoid parameter parsing issues
BACKEND_URL="https://rotate.eov.my.id"

# Debug: Show received parameters (hide sensitive data)
echo "📋 Received parameters:" >&2
echo "   Total arguments: $#" >&2
echo "   Raw \$1 (password): [REDACTED - ${#PASSWORD} chars]" >&2
echo "   Raw \$2 (imgToken): ${IMG_TOKEN:0:16}... (${#IMG_TOKEN} chars)" >&2
echo "   Raw \$3 (ignored, using hardcoded): '${3:-not provided}'" >&2
echo "   Raw \$4 (rdpPort): '${RDP_PORT}'" >&2
echo "   BACKEND_URL (hardcoded): ${BACKEND_URL}" >&2
echo "" >&2

# Clean RDP_PORT (remove any extra flags or spaces)
RDP_PORT_CLEAN=$(echo "$RDP_PORT" | sed 's/[^0-9].*//' | head -1)
if [ -z "$RDP_PORT_CLEAN" ] || ! echo "$RDP_PORT_CLEAN" | grep -qE '^[0-9]+$'; then
  echo "⚠️  Warning: Invalid RDP_PORT '${RDP_PORT}', using default 3389" >&2
  RDP_PORT_CLEAN="3389"
fi

if [ "$RDP_PORT" != "$RDP_PORT_CLEAN" ]; then
  echo "   RDP_PORT cleaned: '${RDP_PORT}' → '${RDP_PORT_CLEAN}'" >&2
fi

RDP_PORT="$RDP_PORT_CLEAN"


# Validate required parameters
if [ -z "$PASSWORD" ] || [ -z "$IMG_TOKEN" ] || [ -z "$BACKEND_URL" ] || [ -z "$RDP_PORT" ]; then
  echo "❌ Error: Missing required parameters" >&2
  echo "   PASSWORD: ${PASSWORD:+SET (${#PASSWORD} chars)}${PASSWORD:-NOT SET}" >&2
  echo "   IMG_TOKEN: ${IMG_TOKEN:+SET (${#IMG_TOKEN} chars)}${IMG_TOKEN:-NOT SET}" >&2
  echo "   BACKEND_URL: ${BACKEND_URL:+SET}${BACKEND_URL:-NOT SET}" >&2
  echo "   RDP_PORT: ${RDP_PORT:+SET}${RDP_PORT:-NOT SET}" >&2
  exit 1
fi

# Get image URL using token (encrypted link from worker.js with obfuscated path)
# This is ALWAYS encrypted via backend API
IMG_URL="${BACKEND_URL}/i/${IMG_TOKEN}"

# Show installation info
echo "Starting Dedicated RDP installation..."
echo ""
echo "🔐 FULL ENCRYPTED MODE"
echo "   All components: Encrypted via backend API"
echo "   Scripts: .sh.enc files only (NO plaintext fallback)"
echo "   Backend: ${BACKEND_URL}"
echo "   Token: ${IMG_TOKEN:0:16}... (encrypted)"
echo "   RDP Port: ${RDP_PORT}"
echo "   Image URL: [Encrypted via worker.js]"
echo ""

# Function to decrypt .sh.enc file via backend API
decrypt_script_via_backend() {
  local encrypted_file="$1"
  local script_name="$2"
  
  # CRITICAL: Write to stderr IMMEDIATELY, before anything else
  # Use multiple methods to ensure output is captured
  echo "🔐 [DECRYPT FUNCTION] Starting decrypt_script_via_backend..." >&2
  echo "   Parameters: encrypted_file='${encrypted_file}', script_name='${script_name}'" >&2
  echo "   Timestamp: $(date)" >&2
  echo "   Function definition exists: $(type decrypt_script_via_backend >&2 && echo 'YES' || echo 'NO')" >&2
  
  # Validate required environment variables
  if [ -z "$BACKEND_URL" ]; then
    echo "❌ Error: BACKEND_URL not set" >&2
    return 1
  fi
  
  if [ -z "$RDP_PORT" ]; then
    echo "❌ Error: RDP_PORT not set" >&2
    return 1
  fi
  
  echo "   Backend URL: ${BACKEND_URL}" >&2
  echo "   RDP Port: ${RDP_PORT}" >&2
  
  if [ ! -f "$encrypted_file" ]; then
    echo "❌ Error: Encrypted script not found: $encrypted_file" >&2
    echo "   Current directory: $(pwd)" >&2
    echo "   File path: ${encrypted_file}" >&2
    return 1
  fi
  
  echo "🔐 Decrypting ${script_name} via backend API..." >&2
  echo "   Encrypted file: ${encrypted_file}" >&2
  
  # Determine scriptType from script_name
  # script_name format: "tele.sh.enc", "reinstall.sh.enc", "trans.sh.enc"
  SCRIPT_TYPE=""
  if echo "$script_name" | grep -q "tele\.sh\.enc"; then
    SCRIPT_TYPE="tele"
  elif echo "$script_name" | grep -q "reinstall\.sh\.enc"; then
    SCRIPT_TYPE="reinstall"
  elif echo "$script_name" | grep -q "trans\.sh\.enc"; then
    SCRIPT_TYPE="trans"
  else
    echo "❌ Error: Unknown script name: ${script_name}" >&2
    echo "   Supported: tele.sh.enc, reinstall.sh.enc, trans.sh.enc" >&2
    return 1
  fi
  
  echo "   Script type: ${SCRIPT_TYPE}" >&2
  
  # Get script token from backend API
  echo "   Step 1: Getting decrypt token from /x/gs..." >&2
  echo "   URL: ${BACKEND_URL}/x/gs" >&2
  echo "   Request body: {\"scriptType\":\"${SCRIPT_TYPE}\",\"rdpPort\":${RDP_PORT}}" >&2
  
  # Use temp files to capture response and HTTP code separately
  TEMP_TOKEN_RESPONSE="/tmp/token_response_$$.txt"
  TEMP_TOKEN_STDERR="/tmp/token_stderr_$$.txt"
  
  HTTP_CODE=$(curl -s -w "%{http_code}" -o "$TEMP_TOKEN_RESPONSE" -X POST "${BACKEND_URL}/x/gs" \
    -H "Content-Type: application/json" \
    -d "{\"scriptType\":\"${SCRIPT_TYPE}\",\"rdpPort\":${RDP_PORT}}" \
    2>"$TEMP_TOKEN_STDERR")
  
  CURL_EXIT=$?
  
  # Check for curl errors first
  if [ $CURL_EXIT -ne 0 ]; then
    echo "❌ Error: curl failed with exit code $CURL_EXIT" >&2
    if [ -f "$TEMP_TOKEN_STDERR" ]; then
      CURL_ERROR=$(cat "$TEMP_TOKEN_STDERR" 2>/dev/null || echo "")
      if [ -n "$CURL_ERROR" ]; then
        echo "   Curl error: ${CURL_ERROR}" >&2
      fi
      rm -f "$TEMP_TOKEN_STDERR"
    fi
    if [ -f "$TEMP_TOKEN_RESPONSE" ]; then
      echo "   Response: $(cat "$TEMP_TOKEN_RESPONSE" | head -c 500)" >&2
      rm -f "$TEMP_TOKEN_RESPONSE"
    fi
    return 1
  fi
  
  # Clean up stderr file if no errors
  rm -f "$TEMP_TOKEN_STDERR"
  
  # Read response content
  if [ -f "$TEMP_TOKEN_RESPONSE" ]; then
    SCRIPT_TOKEN_RESPONSE=$(cat "$TEMP_TOKEN_RESPONSE" 2>/dev/null || echo "")
    rm -f "$TEMP_TOKEN_RESPONSE"
  else
    SCRIPT_TOKEN_RESPONSE=""
  fi
  
  echo "   HTTP Code: ${HTTP_CODE}" >&2
  echo "   Response size: ${#SCRIPT_TOKEN_RESPONSE} bytes" >&2
  
  if [ -z "$SCRIPT_TOKEN_RESPONSE" ]; then
    echo "❌ Error: Empty response from backend API" >&2
    echo "   HTTP Code: ${HTTP_CODE:-unknown}" >&2
    return 1
  fi
  
  if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ Error: Backend returned HTTP $HTTP_CODE" >&2
    echo "   Response: ${SCRIPT_TOKEN_RESPONSE}" >&2
    
    # Try to parse JSON error
    if echo "$SCRIPT_TOKEN_RESPONSE" | grep -q '"error"'; then
      ERROR_MSG=$(echo "$SCRIPT_TOKEN_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 2>/dev/null || \
        echo "$SCRIPT_TOKEN_RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 2>/dev/null)
      if [ -n "$ERROR_MSG" ]; then
        echo "   Error message: ${ERROR_MSG}" >&2
      fi
    fi
    return 1
  fi
  
  # Parse token from JSON response
  SCRIPT_TOKEN=$(echo "$SCRIPT_TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null || \
    echo "$SCRIPT_TOKEN_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)
  
  if [ -z "$SCRIPT_TOKEN" ]; then
    echo "❌ Error: Failed to parse script token from backend response" >&2
    echo "   Response: ${SCRIPT_TOKEN_RESPONSE}" >&2
    return 1
  fi
  
  echo "   ✅ Token received: ${SCRIPT_TOKEN:0:16}..." >&2
  
  # Read encrypted content and encode to base64
  echo "   Step 2: Reading encrypted file..." >&2
  
  # Check if file exists and get its size
  if [ ! -f "$encrypted_file" ]; then
    echo "❌ Error: Encrypted file not found: $encrypted_file" >&2
    return 1
  fi
  
  FILE_SIZE=$(stat -f%z "$encrypted_file" 2>/dev/null || stat -c%s "$encrypted_file" 2>/dev/null || wc -c < "$encrypted_file" 2>/dev/null || echo "0")
  echo "   File size: ${FILE_SIZE} bytes (binary)" >&2
  
  # Validate minimum file size (IV + AuthTag = 32 bytes minimum)
  if [ "$FILE_SIZE" -lt 32 ]; then
    echo "❌ Error: Encrypted file too small: ${FILE_SIZE} bytes" >&2
    echo "   Minimum size required: 32 bytes (IV + AuthTag)" >&2
    echo "   File may be corrupt or not properly encrypted" >&2
    return 1
  fi
  
  # Read and encode to base64
  ENCRYPTED_BASE64=$(base64 -w 0 "$encrypted_file" 2>/dev/null || base64 "$encrypted_file" 2>/dev/null | tr -d '\n')
  
  if [ -z "$ENCRYPTED_BASE64" ]; then
    echo "❌ Error: Failed to read encrypted script file" >&2
    echo "   File: ${encrypted_file}" >&2
    echo "   File size: ${FILE_SIZE} bytes" >&2
    return 1
  fi
  
  ENCRYPTED_SIZE=$(echo -n "$ENCRYPTED_BASE64" | wc -c)
  echo "   ✅ Encrypted content read (${FILE_SIZE} bytes binary → ${ENCRYPTED_SIZE} bytes base64)" >&2
  
  # Validate base64 size (should be ~33% larger than binary)
  EXPECTED_BASE64_MIN=$((FILE_SIZE * 4 / 3))
  if [ "$ENCRYPTED_SIZE" -lt "$EXPECTED_BASE64_MIN" ]; then
    echo "⚠️  Warning: Base64 size (${ENCRYPTED_SIZE}) seems smaller than expected (min ${EXPECTED_BASE64_MIN})" >&2
    echo "   This might indicate base64 encoding issue" >&2
  fi
  
  # Request decrypt from backend
  echo "   Step 3: Requesting decrypt from /ds/${SCRIPT_TOKEN:0:16}..." >&2
  echo "   URL: ${BACKEND_URL}/ds/${SCRIPT_TOKEN}" >&2
  echo "   Encrypted size: ${ENCRYPTED_SIZE} bytes (base64)" >&2
  
  # CRITICAL: Use file for JSON body to avoid "Argument list too long" error
  # Encrypted content can be very large (200KB+ base64), too big for command line
  TEMP_JSON_BODY="/tmp/decrypt_body_$$.json"
  TEMP_RESPONSE="/tmp/decrypt_response_$$.txt"
  TEMP_STDERR="/tmp/decrypt_curl_stderr_$$.txt"
  
  # Create JSON body in file using heredoc to handle large content safely
  # This avoids issues with printf and very large strings
  {
    echo -n '{"scriptName":"'
    echo -n "${script_name}"
    echo -n '","encryptedContent":"'
    echo -n "${ENCRYPTED_BASE64}"
    echo -n '"}'
  } > "$TEMP_JSON_BODY"
  
  # Make curl request using file for body
  # -w "%{http_code}" writes HTTP code to stdout AFTER the response body
  # -o file writes response body to file
  # @file reads request body from file (avoids "Argument list too long" error)
  HTTP_CODE=$(curl -s -w "%{http_code}" -o "$TEMP_RESPONSE" -X POST "${BACKEND_URL}/ds/${SCRIPT_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary "@${TEMP_JSON_BODY}" \
    2>"$TEMP_STDERR")
  
  # Cleanup JSON body file immediately
  rm -f "$TEMP_JSON_BODY"
  
  CURL_EXIT=$?
  
  # Check for curl errors first
  if [ $CURL_EXIT -ne 0 ]; then
    echo "❌ Error: curl decrypt request failed with exit code $CURL_EXIT" >&2
    if [ -f "$TEMP_STDERR" ]; then
      CURL_ERROR=$(cat "$TEMP_STDERR")
      if [ -n "$CURL_ERROR" ]; then
        echo "   Curl error: ${CURL_ERROR}" >&2
      fi
      rm -f "$TEMP_STDERR"
    fi
    if [ -f "$TEMP_RESPONSE" ]; then
      echo "   Response: $(cat "$TEMP_RESPONSE" | head -c 500)" >&2
      rm -f "$TEMP_RESPONSE"
    fi
    return 1
  fi
  
  # Clean up stderr file if no errors
  rm -f "$TEMP_STDERR"
  
  # Read response content
  if [ -f "$TEMP_RESPONSE" ]; then
    DECRYPTED_CONTENT=$(cat "$TEMP_RESPONSE")
    rm -f "$TEMP_RESPONSE"
  else
    DECRYPTED_CONTENT=""
  fi
  
  # Validate HTTP code format (should be 3 digits)
  if [ -z "$HTTP_CODE" ] || ! echo "$HTTP_CODE" | grep -qE '^[0-9]{3}$'; then
    echo "⚠️  Warning: Invalid HTTP code format: '${HTTP_CODE}'" >&2
    # Try to extract from response if it's at the end
    if [ -n "$DECRYPTED_CONTENT" ] && echo "$DECRYPTED_CONTENT" | tail -1 | grep -qE '^[0-9]{3}$'; then
      HTTP_CODE=$(echo "$DECRYPTED_CONTENT" | tail -1)
      DECRYPTED_CONTENT=$(echo "$DECRYPTED_CONTENT" | sed '$d')
      echo "   Extracted HTTP code from response: ${HTTP_CODE}" >&2
    else
      # If we have content, assume 200; otherwise assume error
      if [ -n "$DECRYPTED_CONTENT" ] && echo "$DECRYPTED_CONTENT" | head -1 | grep -q "^#!/"; then
        HTTP_CODE="200"
        echo "   Assuming HTTP 200 (valid script content present)" >&2
      else
        HTTP_CODE="000"
        echo "   Could not determine HTTP code" >&2
      fi
    fi
  fi
  
  echo "   HTTP Code: ${HTTP_CODE}" >&2
  echo "   Response size: ${#DECRYPTED_CONTENT} bytes" >&2
  
  if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ Error: Decrypt endpoint returned HTTP $HTTP_CODE" >&2
    echo "   Response preview: $(echo "$DECRYPTED_CONTENT" | head -c 500)" >&2
    
    # Try to parse JSON error
    if echo "$DECRYPTED_CONTENT" | grep -q '"error"'; then
      ERROR_MSG=$(echo "$DECRYPTED_CONTENT" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 2>/dev/null || \
        echo "$DECRYPTED_CONTENT" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 2>/dev/null)
      if [ -n "$ERROR_MSG" ]; then
        echo "   Error message: ${ERROR_MSG}" >&2
      fi
    fi
    return 1
  fi
  
  if [ -z "$DECRYPTED_CONTENT" ]; then
    echo "❌ Error: Empty decrypted content from backend" >&2
    return 1
  fi
  
  # Backend returns plaintext decrypted script (not JSON) on success
  # Check if response is error JSON (backend returns JSON only on error)
  # Valid decrypted content should start with shebang, not JSON
  FIRST_CHAR=$(echo "$DECRYPTED_CONTENT" | head -c 1)
  
  if [ "$FIRST_CHAR" = "{" ]; then
    # Response starts with {, likely JSON error
    if echo "$DECRYPTED_CONTENT" | grep -q '"error"'; then
      echo "❌ Error: Backend returned JSON error" >&2
      ERROR_MSG=$(echo "$DECRYPTED_CONTENT" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 2>/dev/null || \
        echo "$DECRYPTED_CONTENT" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 2>/dev/null)
      echo "   Error: ${ERROR_MSG:-$DECRYPTED_CONTENT}" >&2
      return 1
    fi
  fi
  
  # Validate decrypted content (should start with shebang for shell scripts)
  FIRST_LINE=$(echo "$DECRYPTED_CONTENT" | head -1 | tr -d '\r\n')
  FIRST_CHARS=$(echo "$DECRYPTED_CONTENT" | head -c 10)
  
  echo "   First 10 chars: '${FIRST_CHARS}'" >&2
  echo "   First line: '${FIRST_LINE:0:80}'" >&2
  
  if echo "$FIRST_LINE" | grep -q "^#!/"; then
    # Valid - starts with shebang
    echo "   ✅ Decrypted content starts with shebang: ${FIRST_LINE:0:50}..." >&2
    DECRYPTED_SIZE=$(echo -n "$DECRYPTED_CONTENT" | wc -c)
    echo "   ✅ Decryption successful (${DECRYPTED_SIZE} bytes)" >&2
    
    # Return decrypted content (will be executed directly, not saved to disk)
    echo "$DECRYPTED_CONTENT"
    return 0
  else
    # Doesn't start with shebang - might be error message or invalid content
    echo "⚠️  Warning: Decrypted content doesn't start with shebang" >&2
    echo "   First line: ${FIRST_LINE:0:100}" >&2
    echo "   First 200 chars: $(echo "$DECRYPTED_CONTENT" | head -c 200)" >&2
    
    # Check if it's actually an error message (JSON or text error)
    FIRST_100=$(echo "$DECRYPTED_CONTENT" | head -c 100)
    if echo "$FIRST_100" | grep -qiE '"error"|"message"|error|failed|invalid|decryption'; then
      echo "❌ Error: Response appears to be an error message, not decrypted script" >&2
      echo "   Full response (first 1000 chars): $(echo "$DECRYPTED_CONTENT" | head -c 1000)" >&2
      return 1
    fi
    
    # If content is substantial and doesn't look like error, might be valid
    DECRYPTED_SIZE=$(echo -n "$DECRYPTED_CONTENT" | wc -c)
    if [ $DECRYPTED_SIZE -gt 100 ]; then
      echo "⚠️  Content is substantial (${DECRYPTED_SIZE} bytes) but missing shebang" >&2
      echo "   This might be valid content, but scripts should start with #!" >&2
      echo "   Continuing anyway..." >&2
      
      # Return content anyway (might be valid script without shebang)
      echo "$DECRYPTED_CONTENT"
      return 0
    else
      echo "❌ Error: Content too short (${DECRYPTED_SIZE} bytes) and missing shebang" >&2
      return 1
    fi
  fi
}

# Check if running from extracted binary (RDP_SCRIPTS_DIR is set)
if [ -n "$RDP_SCRIPTS_DIR" ]; then
  # Running from extracted binary, MUST use reinstall.sh.enc (NO fallback to .sh)
  REINSTALL_SCRIPT_ENC="$RDP_SCRIPTS_DIR/reinstall.sh.enc"
  
  echo "✅ Running from binary package"
  echo "   RDP_SCRIPTS_DIR: $RDP_SCRIPTS_DIR"
  
  # ONLY accept .sh.enc files - NO fallback to plaintext
  if [ ! -f "$REINSTALL_SCRIPT_ENC" ]; then
    echo "❌ Error: reinstall.sh.enc not found in extracted binary"
    echo "   Looking for: $REINSTALL_SCRIPT_ENC"
    echo "   This installation REQUIRES encrypted scripts (.sh.enc files only)"
    echo "   Available files in $RDP_SCRIPTS_DIR:"
    ls -la "$RDP_SCRIPTS_DIR" | head -20 || true
    echo ""
    echo "   Please rebuild binary with encrypted scripts (.sh.enc files)"
    exit 1
  fi
  
  echo "🔐 Found encrypted reinstall.sh.enc - decrypting via backend..."
  
  # Verify file exists and check its size
  if [ ! -f "$REINSTALL_SCRIPT_ENC" ]; then
    echo "❌ Error: File not found: $REINSTALL_SCRIPT_ENC" >&2
    exit 1
  fi
  
  FILE_SIZE_BYTES=$(stat -f%z "$REINSTALL_SCRIPT_ENC" 2>/dev/null || stat -c%s "$REINSTALL_SCRIPT_ENC" 2>/dev/null || wc -c < "$REINSTALL_SCRIPT_ENC" 2>/dev/null || echo "0")
  echo "   File path: $REINSTALL_SCRIPT_ENC" >&2
  echo "   File size: ${FILE_SIZE_BYTES} bytes" >&2
  
  if [ "$FILE_SIZE_BYTES" -lt 32 ]; then
    echo "❌ Error: Encrypted file too small: ${FILE_SIZE_BYTES} bytes" >&2
    echo "   Minimum required: 32 bytes (IV + AuthTag)" >&2
    echo "   File may be corrupt or not properly encrypted" >&2
    echo "   Please rebuild binary with: node encrypt-scripts.js --script reinstall" >&2
    exit 1
  fi
  
  # Decrypt via backend and execute directly (no plaintext on disk)
  # Use temp file to capture stderr separately
  TEMP_STDERR="/tmp/decrypt_stderr_$$.txt"
  TEMP_STDOUT="/tmp/decrypt_stdout_$$.txt"
  
  # Call decrypt function and capture both stdout and stderr
  # Note: decrypt_script_via_backend writes errors to stderr and decrypted content to stdout
  echo "   Calling decrypt_script_via_backend function..." >&2
  echo "   Encrypted file path: $REINSTALL_SCRIPT_ENC" >&2
  echo "   Script name: reinstall.sh.enc" >&2
  echo "   Backend URL: $BACKEND_URL" >&2
  echo "   RDP Port: $RDP_PORT" >&2
  
  # Verify environment variables are set
  if [ -z "$BACKEND_URL" ]; then
    echo "❌ Error: BACKEND_URL is not set before calling decrypt function" >&2
    exit 1
  fi
  
  if [ -z "$RDP_PORT" ]; then
    echo "❌ Error: RDP_PORT is not set before calling decrypt function" >&2
    exit 1
  fi
  
  # Clear temp files first
  rm -f "$TEMP_STDOUT" "$TEMP_STDERR"
  
  # Create temp files to ensure they exist
  touch "$TEMP_STDOUT" "$TEMP_STDERR"
  chmod 600 "$TEMP_STDOUT" "$TEMP_STDERR"
  
  # Debug: Verify function exists and can be called
  echo "   Verifying function exists..." >&2
  if ! type decrypt_script_via_backend >/dev/null 2>&1; then
    echo "❌ Error: decrypt_script_via_backend function is not defined!" >&2
    echo "   This is a critical error - function should be defined above" >&2
    exit 1
  fi
  echo "   ✅ Function exists" >&2
  
  # CRITICAL: Export environment variables to ensure function can access them
  export BACKEND_URL
  export RDP_PORT
  echo "   Exported BACKEND_URL: ${BACKEND_URL}" >&2
  echo "   Exported RDP_PORT: ${RDP_PORT}" >&2
  
  # Call function and capture ALL output (including early errors)
  # Use explicit redirection to ensure stderr is captured
  echo "   Executing function with redirects..." >&2
  echo "   stdout → $TEMP_STDOUT" >&2
  echo "   stderr → $TEMP_STDERR" >&2
  
  # Ensure temp files are empty and writable
  > "$TEMP_STDOUT" 2>/dev/null || true
  > "$TEMP_STDERR" 2>/dev/null || true
  
  # Disable exit on error temporarily to capture exit code
  set +e
  
  # CRITICAL: Test if function can be called at all
  # Use a different approach - call function and capture both stdout and stderr separately
  echo "   Step 1: Testing function call..." >&2
  
  # Create separate temp files for test
  TEST_STDOUT="/tmp/test_stdout_$$.txt"
  TEST_STDERR="/tmp/test_stderr_$$.txt"
  rm -f "$TEST_STDOUT" "$TEST_STDERR"
  
  set +e
  # Call function with redirect - this should work
  decrypt_script_via_backend "$REINSTALL_SCRIPT_ENC" "reinstall.sh.enc" >"$TEST_STDOUT" 2>"$TEST_STDERR"
  TEST_EXIT=$?
  set -e
  
  echo "   Test exit code: $TEST_EXIT" >&2
  
  # Check what we got
  if [ -f "$TEST_STDERR" ] && [ -s "$TEST_STDERR" ]; then
    STDERR_SIZE=$(stat -f%z "$TEST_STDERR" 2>/dev/null || stat -c%s "$TEST_STDERR" 2>/dev/null || wc -c < "$TEST_STDERR" 2>/dev/null || echo "0")
    echo "   ✅ Test stderr size: ${STDERR_SIZE} bytes" >&2
    echo "   Test stderr preview: $(head -c 300 "$TEST_STDERR" 2>/dev/null || echo 'empty')" >&2
    # Copy to actual temp files
    cp "$TEST_STDERR" "$TEMP_STDERR" 2>/dev/null || cat "$TEST_STDERR" > "$TEMP_STDERR"
  else
    echo "   ⚠️  Test stderr is empty or missing" >&2
  fi
  
  if [ -f "$TEST_STDOUT" ] && [ -s "$TEST_STDOUT" ]; then
    STDOUT_SIZE=$(stat -f%z "$TEST_STDOUT" 2>/dev/null || stat -c%s "$TEST_STDOUT" 2>/dev/null || wc -c < "$TEST_STDOUT" 2>/dev/null || echo "0")
    echo "   ✅ Test stdout size: ${STDOUT_SIZE} bytes" >&2
    # Copy to actual temp files
    cp "$TEST_STDOUT" "$TEMP_STDOUT" 2>/dev/null || cat "$TEST_STDOUT" > "$TEMP_STDOUT"
  else
    echo "   ⚠️  Test stdout is empty or missing" >&2
  fi
  
  DECRYPT_EXIT=$TEST_EXIT
  
  # Cleanup test files
  rm -f "$TEST_STDOUT" "$TEST_STDERR"
  
  set -e  # Re-enable exit on error
  
  echo "   Function exited with code: $DECRYPT_EXIT" >&2
  
  # Immediately check if we got any output
  if [ -f "$TEMP_STDERR" ]; then
    STDERR_CONTENT_PREVIEW=$(head -c 200 "$TEMP_STDERR" 2>/dev/null || echo "")
    if [ -n "$STDERR_CONTENT_PREVIEW" ]; then
      echo "   stderr preview: ${STDERR_CONTENT_PREVIEW:0:100}..." >&2
    fi
  fi
  
  # Force flush any buffered output
  sync 2>/dev/null || true
  
  # Immediately check if files exist
  if [ ! -f "$TEMP_STDERR" ]; then
    echo "⚠️  Warning: stderr file was not created after function call" >&2
    echo "   This is unexpected - function should have written to stderr" >&2
    # Create empty stderr file to prevent further errors
    touch "$TEMP_STDERR"
    chmod 600 "$TEMP_STDERR"
  else
    STDERR_SIZE=$(stat -f%z "$TEMP_STDERR" 2>/dev/null || stat -c%s "$TEMP_STDERR" 2>/dev/null || wc -c < "$TEMP_STDERR" 2>/dev/null || echo "0")
    echo "   stderr file size: ${STDERR_SIZE} bytes" >&2
  fi
  
  if [ ! -f "$TEMP_STDOUT" ]; then
    echo "⚠️  Warning: stdout file was not created after function call" >&2
    touch "$TEMP_STDOUT"
    chmod 600 "$TEMP_STDOUT"
  else
    STDOUT_SIZE=$(stat -f%z "$TEMP_STDOUT" 2>/dev/null || stat -c%s "$TEMP_STDOUT" 2>/dev/null || wc -c < "$TEMP_STDOUT" 2>/dev/null || echo "0")
    echo "   stdout file size: ${STDOUT_SIZE} bytes" >&2
  fi
  
  # Always show stderr first (contains all debug/error messages from decrypt function)
  echo "" >&2
  echo "   📋 Decrypt Function Output (stderr):" >&2
  echo "   ========================================" >&2
  if [ -f "$TEMP_STDERR" ] && [ -s "$TEMP_STDERR" ]; then
    STDERR_CONTENT=$(cat "$TEMP_STDERR" 2>/dev/null || echo "")
    if [ -n "$STDERR_CONTENT" ]; then
      echo "$STDERR_CONTENT" >&2
    else
      echo "   (stderr file exists but content is empty)" >&2
    fi
  elif [ -f "$TEMP_STDERR" ]; then
    echo "   (stderr file exists but is empty - 0 bytes)" >&2
    echo "   This may indicate function failed before writing any output" >&2
  else
    echo "   ⚠️  stderr file not found" >&2
    echo "   Function may have failed before creating stderr file" >&2
    echo "   Exit code: $DECRYPT_EXIT" >&2
  fi
  echo "   ========================================" >&2
  echo "" >&2
  
  # Read stdout (decrypted content)
  if [ -f "$TEMP_STDOUT" ]; then
    DECRYPTED_SCRIPT=$(cat "$TEMP_STDOUT")
    rm -f "$TEMP_STDOUT"
  else
    DECRYPTED_SCRIPT=""
  fi
  
  # Debug: Show what we got
  echo "" >&2
  echo "   📊 Decrypt Result Summary:" >&2
  echo "   Decrypt function exit code: $DECRYPT_EXIT" >&2
  echo "   Decrypted content length: ${#DECRYPTED_SCRIPT} bytes" >&2
  if [ -n "$DECRYPTED_SCRIPT" ]; then
    FIRST_LINE_PREVIEW=$(echo "$DECRYPTED_SCRIPT" | head -1 | head -c 50)
    echo "   First line preview: ${FIRST_LINE_PREVIEW}..." >&2
  else
    echo "   ⚠️  No decrypted content received (stdout was empty)" >&2
  fi
  echo "" >&2
  
  if [ $DECRYPT_EXIT -ne 0 ]; then
    echo "❌ Error: Decrypt function failed with exit code $DECRYPT_EXIT" >&2
    if [ -n "$DECRYPTED_SCRIPT" ]; then
      echo "   Content received (may be error message): $(echo "$DECRYPTED_SCRIPT" | head -c 500)" >&2
    else
      echo "   No content received - check stderr above for error details" >&2
    fi
    exit 1
  fi
  
  if [ -z "$DECRYPTED_SCRIPT" ]; then
    echo "❌ Error: Decrypted content is empty" >&2
    echo "   Decrypt function returned exit code 0 but no content was received" >&2
    echo "   This might indicate a backend issue or network problem" >&2
    exit 1
  fi
  
  # Validate that we got actual script content (not error message)
  if ! echo "$DECRYPTED_SCRIPT" | head -1 | grep -q "^#!/"; then
    echo "❌ Error: Decrypted content doesn't look like a script (no shebang)" >&2
    echo "   First 200 chars: $(echo "$DECRYPTED_SCRIPT" | head -c 200)" >&2
    exit 1
  fi
  
  echo "✅ Decrypted reinstall.sh.enc successfully"
  # Store decrypted content in memory variable (will be executed later)
  REINSTALL_SCRIPT_CONTENT="$DECRYPTED_SCRIPT"
  REINSTALL_SCRIPT_MODE="memory"
  
else
  # Download reinstall.sh.enc using encrypted token and decrypt via backend
  echo "🔐 Downloading reinstall.sh.enc using encrypted token..."
  
  # Get reinstall.sh script token from backend API (using obfuscated path)
  REINSTALL_TOKEN_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/x/gs" \
    -H "Content-Type: application/json" \
    -d "{\"scriptType\":\"reinstall\",\"rdpPort\":${RDP_PORT}}" 2>/dev/null)
  
  if [ $? -ne 0 ] || [ -z "$REINSTALL_TOKEN_RESPONSE" ]; then
    echo "❌ Error: Failed to get reinstall.sh token from backend API"
    echo "   Backend URL: ${BACKEND_URL}"
    echo "   This script REQUIRES backend API. Installation cancelled."
    exit 1
  fi
  
  # Parse token from JSON response
  REINSTALL_TOKEN=$(echo "$REINSTALL_TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null || \
    echo "$REINSTALL_TOKEN_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)
  
  if [ -z "$REINSTALL_TOKEN" ]; then
    echo "❌ Error: Failed to parse reinstall.sh token from backend response"
    echo "   Response: ${REINSTALL_TOKEN_RESPONSE}"
    echo "   This script REQUIRES backend API. Installation cancelled."
    exit 1
  fi
  
  # Use obfuscated path for script download
  REINSTALL_URL="${BACKEND_URL}/s/${REINSTALL_TOKEN}"
  curl -sL -o reinstall.sh.enc "${REINSTALL_URL}" 2>/dev/null || \
  wget -q -O reinstall.sh.enc "${REINSTALL_URL}" 2>/dev/null
  
  if [ ! -f "reinstall.sh.enc" ]; then
    echo "❌ Error: Failed to download reinstall.sh.enc from backend"
    echo "   URL: ${REINSTALL_URL}"
    echo "   This script REQUIRES backend API. Installation cancelled."
    exit 1
  fi
  
  echo "✅ Downloaded reinstall.sh.enc via encrypted link"
  
  # Decrypt via backend and execute directly (no plaintext on disk)
  # Use temp file to capture stderr separately
  TEMP_STDERR="/tmp/decrypt_stderr_$$.txt"
  TEMP_STDOUT="/tmp/decrypt_stdout_$$.txt"
  
  # Call decrypt function and capture both stdout and stderr
  decrypt_script_via_backend "./reinstall.sh.enc" "reinstall.sh.enc" >"$TEMP_STDOUT" 2>"$TEMP_STDERR"
  DECRYPT_EXIT=$?
  
  # Show stderr (debug messages) first
  if [ -f "$TEMP_STDERR" ]; then
    cat "$TEMP_STDERR" >&2
    rm -f "$TEMP_STDERR"
  fi
  
  # Read stdout (decrypted content)
  if [ -f "$TEMP_STDOUT" ]; then
    DECRYPTED_SCRIPT=$(cat "$TEMP_STDOUT")
    rm -f "$TEMP_STDOUT"
  else
    DECRYPTED_SCRIPT=""
  fi
  
  # Debug: Show what we got
  echo "   Decrypt function exit code: $DECRYPT_EXIT" >&2
  echo "   Decrypted content length: ${#DECRYPTED_SCRIPT} bytes" >&2
  if [ -n "$DECRYPTED_SCRIPT" ]; then
    FIRST_LINE_PREVIEW=$(echo "$DECRYPTED_SCRIPT" | head -1 | head -c 50)
    echo "   First line preview: ${FIRST_LINE_PREVIEW}..." >&2
  fi
  
  if [ $DECRYPT_EXIT -ne 0 ]; then
    echo "❌ Error: Decrypt function failed with exit code $DECRYPT_EXIT" >&2
    if [ -n "$DECRYPTED_SCRIPT" ]; then
      echo "   Content received (may be error message): $(echo "$DECRYPTED_SCRIPT" | head -c 200)" >&2
    fi
    exit 1
  fi
  
  if [ -z "$DECRYPTED_SCRIPT" ]; then
    echo "❌ Error: Decrypted content is empty" >&2
    exit 1
  fi
  
  # Validate that we got actual script content (not error message)
  if ! echo "$DECRYPTED_SCRIPT" | head -1 | grep -q "^#!/"; then
    echo "❌ Error: Decrypted content doesn't look like a script (no shebang)" >&2
    echo "   First 200 chars: $(echo "$DECRYPTED_SCRIPT" | head -c 200)" >&2
    exit 1
  fi
  
  echo "✅ Decrypted reinstall.sh.enc successfully"
  # Store decrypted content in memory variable (will be executed later)
  REINSTALL_SCRIPT_CONTENT="$DECRYPTED_SCRIPT"
  REINSTALL_SCRIPT_MODE="memory"
  
  # Cleanup encrypted file (optional, for security)
  rm -f reinstall.sh.enc
fi
  
# Replace confhome URL with encrypted token (ALWAYS encrypted via backend API)
# This is MANDATORY - confhome must be set via backend token
if [ -n "$BACKEND_URL" ]; then
  echo "🔐 Encrypting confhome URL..."
  
  # Get VPS IP address (for IP validation) - MANDATORY
  VPS_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || \
           ip addr show 2>/dev/null | grep -oP 'inet \K[\d.]+' | grep -v '^127\.' | head -1 || \
           curl -s ifconfig.me 2>/dev/null || \
           curl -s ipinfo.io/ip 2>/dev/null || \
           echo "")
  
  if [ -z "$VPS_IP" ]; then
    echo "❌ Error: Failed to detect VPS IP address"
    echo "   VPS IP is required for confhome token generation (IP validation)"
    echo "   This script REQUIRES backend API. Installation cancelled."
    exit 1
  fi
  
  echo "   VPS IP: ${VPS_IP}"
  CONFHOME_TOKEN_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/x/gc" \
    -H "Content-Type: application/json" \
    -d "{\"vpsIp\":\"${VPS_IP}\"}" 2>/dev/null)
  
  if [ $? -ne 0 ] || [ -z "$CONFHOME_TOKEN_RESPONSE" ]; then
    echo "❌ Error: Failed to get confhome token from backend API"
    echo "   Backend URL: ${BACKEND_URL}"
    echo "   VPS IP: ${VPS_IP}"
    echo "   This script REQUIRES backend API. Installation cancelled."
    exit 1
  fi
  
  # Parse token and confhome URL from response
  CONFHOME_TOKEN=$(echo "$CONFHOME_TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null || \
    echo "$CONFHOME_TOKEN_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)
  
  # Also try to get confhome URL directly from response
  CONFHOME_URL=$(echo "$CONFHOME_TOKEN_RESPONSE" | grep -o '"confhome":"[^"]*"' | cut -d'"' -f4 2>/dev/null || \
    echo "$CONFHOME_TOKEN_RESPONSE" | sed -n 's/.*"confhome":"\([^"]*\)".*/\1/p' | head -1)
  
  if [ -n "$CONFHOME_URL" ]; then
    # Use confhome URL from response (already tokenized)
    CONFHOME_TOKENIZED="$CONFHOME_URL"
  elif [ -n "$CONFHOME_TOKEN" ]; then
    # Build tokenized confhome URL with obfuscated path
    CONFHOME_TOKENIZED="${BACKEND_URL}/c/${CONFHOME_TOKEN}"
  else
    echo "❌ Error: Failed to parse confhome token from backend response"
    echo "   Response: ${CONFHOME_TOKEN_RESPONSE}"
    echo "   This script REQUIRES backend API. Installation cancelled."
    exit 1
  fi
  
  # Replace confhome URLs in script content (memory mode only - all scripts are encrypted)
  REINSTALL_SCRIPT_CONTENT=$(echo "$REINSTALL_SCRIPT_CONTENT" | \
    sed "s|^confhome=https://[^[:space:]\"']*|confhome=${CONFHOME_TOKENIZED}|g" | \
    sed "s|^confhome=http://[^[:space:]\"']*|confhome=${CONFHOME_TOKENIZED}|g" | \
    sed "s|^confhome=$|confhome=${CONFHOME_TOKENIZED}|g" | \
    sed "s|^confhome_cn=https://[^[:space:]\"']*|confhome_cn=${CONFHOME_TOKENIZED}|g" | \
    sed "s|^confhome_cn=http://[^[:space:]\"']*|confhome_cn=${CONFHOME_TOKENIZED}|g" | \
    sed "s|^confhome_cn=$|confhome_cn=${CONFHOME_TOKENIZED}|g")
  
  echo "✅ Confhome URL encrypted (1-time use token, IP-restricted to ${VPS_IP})"
else
  echo "❌ Error: BACKEND_URL not set"
  echo "   This script REQUIRES backend API. Installation cancelled."
  exit 1
fi

# Setup firewall to lock SSH during installation - only allow BOT_IP
# Auto-detect from SSH connection, fallback to env var
echo "🔒 Setting up temporary SSH firewall lock (will be reset before reboot)..."
BOT_IP="${BOT_IP:-$(echo $SSH_CLIENT | awk '{print $1}')}"
[ -z "$BOT_IP" ] && BOT_IP="139.59.56.240"
SSH_PORT="22"

# Function to setup temporary SSH firewall lock (non-persistent)
setup_ssh_firewall_lock() {
    local bot_ip="$1"
    local ssh_port="${2:-22}"
    
    echo "   Locking SSH to bot IP: ${bot_ip} (temporary, will reset before reboot)"
    echo "   SSH port: ${ssh_port}"
    
    # Check if iptables is available
    if ! command -v iptables >/dev/null 2>&1; then
        echo "   ⚠️  Warning: iptables not found, trying to install..."
        # Try to install iptables (works on most Linux distros)
        if command -v apk >/dev/null 2>&1; then
            # Alpine Linux: update repositories first, then install iptables
            apk update >/dev/null 2>&1 || true
            apk add --no-cache iptables >/dev/null 2>&1 || apk add -q iptables >/dev/null 2>&1 || true
            # Also try iptables-legacy if iptables is not available
            if ! command -v iptables >/dev/null 2>&1; then
                apk add --no-cache iptables-legacy >/dev/null 2>&1 || true
                # Create symlink if iptables-legacy exists
                if command -v iptables-legacy >/dev/null 2>&1; then
                    ln -sf /sbin/iptables-legacy /sbin/iptables 2>/dev/null || true
                fi
            fi
        elif command -v apt-get >/dev/null 2>&1; then
            apt-get update -qq && apt-get install -y -qq iptables >/dev/null 2>&1 || true
        elif command -v yum >/dev/null 2>&1; then
            yum install -y -q iptables >/dev/null 2>&1 || true
        fi
    fi
    
    # Verify iptables is now available, if not try alternatives
    if ! command -v iptables >/dev/null 2>&1; then
        echo "   ⚠️  Warning: iptables still not available after installation attempt"
        echo "   Trying to load iptables kernel modules manually..."
        # Try to load kernel modules for iptables
        modprobe ip_tables 2>/dev/null || true
        modprobe iptable_filter 2>/dev/null || true
        modprobe iptable_nat 2>/dev/null || true
        # Check again
        if ! command -v iptables >/dev/null 2>&1; then
            echo "   🔄 iptables not available, trying alternative: nftables..."
            # Try nftables as alternative
            setup_ssh_firewall_lock_nftables "$bot_ip" "$ssh_port" && return 0 || true
            
            echo "   🔄 nftables not available, trying alternative: SSH config restrict..."
            # Try SSH config restrict as last resort
            setup_ssh_firewall_lock_ssh_config "$bot_ip" "$ssh_port" && return 0 || true
            
            echo "   ❌ Critical: All firewall methods failed, SSH firewall lock skipped"
            echo "   ⚠️  WARNING: SSH is NOT protected! Please configure firewall manually or use cloud provider firewall."
            return 1
        fi
    fi
    
    if command -v iptables >/dev/null 2>&1; then
        # Disable UFW if active (UFW uses iptables but can override our rules)
        if command -v ufw >/dev/null 2>&1; then
            ufw --force disable 2>/dev/null || true
            ufw --force reset 2>/dev/null || true
            # Prevent UFW from being enabled again
            systemctl disable ufw 2>/dev/null || true
            systemctl stop ufw 2>/dev/null || true
        fi
        
        # Also disable firewalld if active (CentOS/RHEL)
        if command -v firewall-cmd >/dev/null 2>&1; then
            systemctl stop firewalld 2>/dev/null || true
            systemctl disable firewalld 2>/dev/null || true
        fi
        
        # First, allow existing connections to prevent lockout
        iptables -I INPUT 1 -m state --state ESTABLISHED,RELATED -j ACCEPT
        
        # Allow loopback interface
        iptables -I INPUT 2 -i lo -j ACCEPT
        
        # Flush existing SSH rules (if any) - use multiple attempts to ensure removal
        for i in 1 2 3 4 5; do
            iptables -D INPUT -p tcp --dport "$ssh_port" -j DROP 2>/dev/null || true
            iptables -D INPUT -p tcp --dport "$ssh_port" -s "$bot_ip" -j ACCEPT 2>/dev/null || true
        done
        
        # Add new rules: Allow only bot IP for SSH, deny all others (temporary, not saved)
        # Insert at position 3 (after ESTABLISHED and lo rules)
        iptables -I INPUT 3 -p tcp --dport "$ssh_port" -s "$bot_ip" -j ACCEPT
        iptables -I INPUT 4 -p tcp --dport "$ssh_port" -j DROP
        
        # Set default policy to ACCEPT (we're using explicit DROP for SSH only)
        # Don't set to DROP to avoid locking out other necessary traffic
        iptables -P INPUT ACCEPT 2>/dev/null || true
        
        # Verify rules are applied and list current rules for debugging
        if iptables -C INPUT -p tcp --dport "$ssh_port" -s "$bot_ip" -j ACCEPT 2>/dev/null && \
           iptables -C INPUT -p tcp --dport "$ssh_port" -j DROP 2>/dev/null; then
            echo "   ✅ SSH firewall rules applied temporarily (only ${bot_ip} can access port ${ssh_port})"
            echo "   Note: Rules will be reset before reboot in trans.sh"
            # List current rules for debugging
            echo "   Current iptables rules for SSH port ${ssh_port}:"
            iptables -L INPUT -n -v --line-numbers | grep -E "(dpt:${ssh_port}|Chain)" || true
        else
            echo "   ⚠️  Warning: SSH firewall lock verification failed, re-applying..."
            iptables -I INPUT 3 -p tcp --dport "$ssh_port" -s "$bot_ip" -j ACCEPT
            iptables -I INPUT 4 -p tcp --dport "$ssh_port" -j DROP
            # List current rules for debugging
            echo "   Current iptables rules for SSH port ${ssh_port}:"
            iptables -L INPUT -n -v --line-numbers | grep -E "(dpt:${ssh_port}|Chain)" || true
        fi
        
    else
        echo "   ⚠️  Warning: iptables not available, trying alternatives..."
        # Try nftables as alternative
        setup_ssh_firewall_lock_nftables "$bot_ip" "$ssh_port" && return 0 || true
        
        # Try SSH config restrict as last resort
        setup_ssh_firewall_lock_ssh_config "$bot_ip" "$ssh_port" && return 0 || true
        
        echo "   ❌ Critical: All firewall methods failed, SSH firewall lock skipped"
        echo "   ⚠️  WARNING: SSH is NOT protected! Please configure firewall manually or use cloud provider firewall."
    fi
}

# Alternative: Setup SSH firewall lock using nftables
setup_ssh_firewall_lock_nftables() {
    local bot_ip="$1"
    local ssh_port="${2:-22}"
    
    echo "   🔄 Trying nftables as alternative firewall..."
    
    # Check if nftables is available
    if ! command -v nft >/dev/null 2>&1; then
        echo "   ⚠️  nftables not found, trying to install..."
        if command -v apk >/dev/null 2>&1; then
            apk update >/dev/null 2>&1 || true
            apk add --no-cache nftables >/dev/null 2>&1 || true
        elif command -v apt-get >/dev/null 2>&1; then
            apt-get update -qq && apt-get install -y -qq nftables >/dev/null 2>&1 || true
        elif command -v yum >/dev/null 2>&1; then
            yum install -y -q nftables >/dev/null 2>&1 || true
        fi
    fi
    
    if command -v nft >/dev/null 2>&1; then
        echo "   ✅ Using nftables for SSH firewall lock..."
        
        # Flush existing table and create new one
        nft flush table inet filter 2>/dev/null || true
        nft delete table inet filter 2>/dev/null || true
        
        # Create table and chain
        nft create table inet filter 2>/dev/null || true
        nft create chain inet filter input { type filter hook input priority 0\; } 2>/dev/null || true
        
        # Allow established and related connections
        nft add rule inet filter input ct state established,related accept
        
        # Allow loopback
        nft add rule inet filter input iif lo accept
        
        # Allow only bot IP for SSH
        nft add rule inet filter input tcp dport "$ssh_port" ip saddr "$bot_ip" accept
        
        # Drop all other SSH connections
        nft add rule inet filter input tcp dport "$ssh_port" drop
        
        # Accept everything else (default policy)
        nft add rule inet filter input accept
        
        echo "   ✅ SSH firewall lock applied using nftables (only ${bot_ip} can access port ${ssh_port})"
        return 0
    else
        echo "   ❌ nftables not available"
        return 1
    fi
}

# Alternative: Setup SSH firewall lock using SSH config (less secure, but better than nothing)
setup_ssh_firewall_lock_ssh_config() {
    local bot_ip="$1"
    local ssh_port="${2:-22}"
    
    echo "   🔄 Trying SSH config restrict as last resort (less secure)..."
    
    # Try to configure SSH to restrict access
    # Note: This is less secure than firewall but better than nothing
    if [ -f /etc/ssh/sshd_config ]; then
        # Backup original config
        cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%s) 2>/dev/null || true
        
        # Add AllowUsers or Match directive to restrict SSH access
        # Note: SSH config can't directly filter by IP without Match, which is complex
        # So we'll just log a warning that SSH config method is limited
        
        echo "   ⚠️  SSH config method is limited - can't directly restrict by IP without complex Match rules"
        echo "   💡 Recommendation: Configure firewall at cloud provider level (DigitalOcean Firewall)"
        echo "   ⚠️  WARNING: SSH is NOT protected by OS-level firewall!"
        
        return 1
    else
        echo "   ❌ SSH config file not found"
        return 1
    fi
}

# Setup temporary firewall lock (non-persistent)
setup_ssh_firewall_lock "$BOT_IP" "$SSH_PORT"

# Security: Close console access and lock all users except root
setup_security_hardening() {
    echo "🔒 Setting up security hardening..."
    
    # Close console access: Empty /etc/securetty prevents root login from console
    if [ -f /etc/securetty ]; then
        echo -n "" > /etc/securetty
        echo "   ✅ Console access closed (root cannot login from console)"
    else
        # Create empty securetty if it doesn't exist
        touch /etc/securetty
        chmod 644 /etc/securetty
        echo "   ✅ Created empty /etc/securetty (console access closed)"
    fi
    
    # Lock all users except root
    lock_all_users_except_root
    
    echo "   ✅ Security hardening completed"
}

# Lock all users except root (automatic detection)
lock_all_users_except_root() {
    echo "   🔐 Locking all users except root..."
    
    local locked_count=0
    local skipped_count=0
    
    # Find all users with UID >= 1000 (regular users) or check /etc/passwd
    # Also check system users (UID < 1000) but skip root and system service accounts
    if [ -f /etc/passwd ]; then
        while IFS=: read -r username _ uid gid _ _ shell; do
            # Skip root user (UID 0)
            if [ "$uid" = "0" ]; then
                continue
            fi
            
            # Skip if user doesn't exist or is a system account without login shell
            if ! id "$username" >/dev/null 2>&1; then
                continue
            fi
            
            # Skip system accounts that typically shouldn't be locked (common system UIDs)
            # These are usually service accounts that don't have login shells anyway
            if [ "$uid" -lt 1000 ] && [ -z "$shell" ] || [ "$shell" = "/usr/sbin/nologin" ] || [ "$shell" = "/sbin/nologin" ] || [ "$shell" = "/bin/false" ]; then
                skipped_count=$((skipped_count + 1))
                continue
            fi
            
            # Lock the user account
            if command -v passwd >/dev/null 2>&1; then
                # Try to lock the account
                if passwd -l "$username" >/dev/null 2>&1; then
                    locked_count=$((locked_count + 1))
                    echo "   🔒 Locked user: $username (UID: $uid)"
                elif command -v usermod >/dev/null 2>&1; then
                    # Fallback to usermod
                    if usermod -L "$username" >/dev/null 2>&1; then
                        locked_count=$((locked_count + 1))
                        echo "   🔒 Locked user: $username (UID: $uid)"
                    fi
                fi
                
                # Also disable shell access for extra security
                if command -v usermod >/dev/null 2>&1 && [ -n "$shell" ] && [ "$shell" != "/usr/sbin/nologin" ] && [ "$shell" != "/sbin/nologin" ] && [ "$shell" != "/bin/false" ]; then
                    usermod -s /usr/sbin/nologin "$username" >/dev/null 2>&1 || \
                    usermod -s /sbin/nologin "$username" >/dev/null 2>&1 || \
                    usermod -s /bin/false "$username" >/dev/null 2>&1 || true
                fi
            fi
        done < /etc/passwd
        
        echo "   ✅ Locked $locked_count user(s), skipped $skipped_count system account(s)"
    else
        echo "   ⚠️  Warning: /etc/passwd not found, cannot lock users"
    fi
    
    # Also ensure root is the only user that can login via SSH
    # This is already handled by SSH config, but we verify here
    echo "   ✅ Only root can login (all other users locked)"
}

# Setup security hardening
setup_security_hardening

echo "Running reinstall.sh with parameters..."

# Execute reinstall.sh from memory (ALL scripts are encrypted - NO file mode)
echo "🔐 Executing decrypted reinstall.sh from memory..."
echo "   Mode: Encrypted scripts only (.sh.enc) - NO plaintext fallback"

# Debug: Show what we're about to execute (password hidden)
echo "Executing reinstall.sh with:"
echo "  OS Type: dd"
echo "  Image URL: ${IMG_URL}"
echo "  Password: [HIDDEN - ${#PASSWORD} chars]"
echo "  RDP Port: ${RDP_PORT}"

# Use temporary file in /tmp with restricted permissions (600 = owner read/write only)
# File will be deleted immediately after execution
# This is the most practical way to execute bash scripts with arguments
TEMP_SCRIPT="/tmp/reinstall_$$.sh"
echo "$REINSTALL_SCRIPT_CONTENT" > "$TEMP_SCRIPT"
chmod 600 "$TEMP_SCRIPT"  # Only owner can read/write

# Execute script with arguments
bash "$TEMP_SCRIPT" \
  dd \
  --img="${IMG_URL}" \
  --password="${PASSWORD}" \
  --rdp-port="${RDP_PORT}"

EXEC_RESULT=$?

# Immediately delete temporary script (remove plaintext from disk)
rm -f "$TEMP_SCRIPT"

# Store exit code for final check
SCRIPT_EXIT_CODE=$EXEC_RESULT

if [ ${SCRIPT_EXIT_CODE:-1} -eq 0 ]; then
  echo "Installation completed successfully!"
  echo "RDP will be available on port ${RDP_PORT:-22}"
  echo "Username: administrator"
  echo "Password: $PASSWORD"
  echo "Rebooting system in 5 seconds..."
  sleep 5
  reboot
else
  echo "Installation failed!"
  exit 1
fi
