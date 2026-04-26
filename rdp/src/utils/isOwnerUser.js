// Re-export isOwnerUser from root utils
// This file exists to support require paths that expect it in rdp/src/utils/
// Path from rdp/src/utils/ to utils/ is ../../utils/
const path = require('path');

// Try to require from root utils first
let rootIsOwnerUser;
try {
  // From rdp/src/utils/ to utils/ = ../../utils/
  rootIsOwnerUser = require(path.join(__dirname, '../../utils/isOwnerUser'));
} catch (e) {
  // If not found, create a simple implementation
  function isOwnerUser(ctx) {
    const ownerId = String(process.env.OWNER_TELEGRAM_ID || '').trim();
    const userId = String(ctx?.from?.id || '');
    return userId === ownerId;
  }
  rootIsOwnerUser = { isOwnerUser };
}

module.exports = rootIsOwnerUser;

