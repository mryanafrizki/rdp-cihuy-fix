/**
 * Validate inline keyboard buttons before sending
 * Helps debug BUTTON_DATA_INVALID errors
 */

function validateButtons(buttons, context = '') {
  console.log(`[ButtonValidator] Checking buttons for: ${context}`);
  
  if (!Array.isArray(buttons)) {
    console.error(`[ButtonValidator] ERROR: buttons is not an array!`);
    return false;
  }

  if (buttons.length === 0) {
    console.warn(`[ButtonValidator] WARNING: Empty buttons array for ${context}`);
    return true; // Empty is valid, just no keyboard
  }

  let isValid = true;

  buttons.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      console.error(`[ButtonValidator] ERROR: Row ${rowIndex} is not an array!`);
      isValid = false;
      return;
    }

    if (row.length === 0) {
      console.error(`[ButtonValidator] ERROR: Row ${rowIndex} is EMPTY! This causes BUTTON_DATA_INVALID`);
      isValid = false;
      return;
    }

    row.forEach((button, btnIndex) => {
      if (!button.text) {
        console.error(`[ButtonValidator] ERROR: Row ${rowIndex}, Button ${btnIndex} has no text!`);
        isValid = false;
      }

      if (!button.callback_data && !button.url) {
        console.error(`[ButtonValidator] ERROR: Row ${rowIndex}, Button ${btnIndex} has no callback_data or url!`);
        isValid = false;
      }

      if (button.callback_data) {
        const len = button.callback_data.length;
        if (len > 64) {
          console.error(`[ButtonValidator] ERROR: Row ${rowIndex}, Button ${btnIndex} callback_data TOO LONG: ${len} bytes (max 64)`);
          console.error(`  Data: "${button.callback_data}"`);
          isValid = false;
        } else {
          console.log(`  Row ${rowIndex}, Btn ${btnIndex}: "${button.text}" -> "${button.callback_data}" (${len} bytes) ✓`);
        }
      }
    });
  });

  if (!isValid) {
    console.error(`[ButtonValidator] ❌ VALIDATION FAILED for ${context}`);
  } else {
    console.log(`[ButtonValidator] ✅ All buttons valid for ${context}`);
  }

  return isValid;
}

module.exports = { validateButtons };

