/**
 * Session manager for callback data
 * Maps short IDs to full data to avoid Telegram's 64-byte limit
 */

const sessions = new Map();
let counter = 1000;

/**
 * Create a short session ID for callback data
 * @param {string} userId - User ID
 * @param {object} data - Data to store (e.g., {accountId, dropletId, action})
 * @returns {string} - Short session ID
 */
function createSession(userId, data) {
  const sessionId = `s${counter++}`;
  const key = `${userId}:${sessionId}`;
  
  sessions.set(key, {
    data,
    createdAt: Date.now()
  });
  
  // Auto-cleanup old sessions (> 1 hour)
  if (counter % 100 === 0) {
    cleanOldSessions();
  }
  
  return sessionId;
}

/**
 * Get data from session
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @returns {object|null} - Stored data or null
 */
function getSession(userId, sessionId) {
  const key = `${userId}:${sessionId}`;
  const session = sessions.get(key);
  
  if (!session) {
    return null;
  }
  
  return session.data;
}

/**
 * Delete a session
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 */
function deleteSession(userId, sessionId) {
  const key = `${userId}:${sessionId}`;
  sessions.delete(key);
}

/**
 * Clean sessions older than 1 hour
 */
function cleanOldSessions() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  for (const [key, session] of sessions.entries()) {
    if (session.createdAt < oneHourAgo) {
      sessions.delete(key);
    }
  }
}

// Auto cleanup every 10 minutes
setInterval(cleanOldSessions, 10 * 60 * 1000);

module.exports = {
  createSession,
  getSession,
  deleteSession
};

