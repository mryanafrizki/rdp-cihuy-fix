class SessionManager {
    constructor() {
        this.userSessions = new Map();
        this.adminSessions = new Map();
        this.depositSessions = new Map();
        this.accountSessions = new Map();
        this.sessionTimeouts = new Map();
        
        // Session timeout in milliseconds (30 minutes)
        this.SESSION_TIMEOUT = 30 * 60 * 1000;
        
        // Cleanup expired sessions every 5 minutes
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 5 * 60 * 1000);
    }

    setUserSession(chatId, session) {
        // Normalize chatId to number for consistency
        const normalizedChatId = Number(chatId);
        
        // Store with both number and string for compatibility
        const sessionData = {
            ...session,
            lastActivity: Date.now()
        };
        
        this.userSessions.set(normalizedChatId, sessionData);
        this.userSessions.set(String(chatId), sessionData);
        
        // Clear existing timeout
        const timeoutKey = normalizedChatId;
        if (this.sessionTimeouts.has(timeoutKey)) {
            clearTimeout(this.sessionTimeouts.get(timeoutKey));
        }
        
        // Set new timeout
        const timeout = setTimeout(() => {
            this.clearUserSession(normalizedChatId);
        }, this.SESSION_TIMEOUT);
        
        this.sessionTimeouts.set(timeoutKey, timeout);
        
        // Only log non-admin sessions to reduce spam
        if (session.action && !session.action.includes('waiting_custom_')) {
           //  console.info(`[SESSION] Set user session for ${normalizedChatId}:`, { action: session.action, messageId: session.messageId });
        }
    }

    getUserSession(chatId) {
        // Normalize to number first
        const normalizedChatId = Number(chatId);
        const stringChatId = String(chatId);
        
        // Try all possible formats
        let session = this.userSessions.get(normalizedChatId);
        if (!session) {
            session = this.userSessions.get(stringChatId);
        }
        if (!session) {
            session = this.userSessions.get(chatId);
        }
        
        if (session) {
            // Update last activity
            session.lastActivity = Date.now();
            // Only log non-admin custom price sessions to reduce spam
            if (session.action && !session.action.includes('waiting_custom_')) {
             //    console.info(`[SESSION] Found session for ${chatId}:`, { action: session.action, messageId: session.messageId });
            }
            return session;
        }
        return null;
    }

    clearUserSession(chatId) {
        // Clear both number and string format
        const normalizedChatId = Number(chatId);
        this.userSessions.delete(normalizedChatId);
        this.userSessions.delete(String(chatId));
        this.userSessions.delete(chatId);
        
        const timeoutKey = normalizedChatId;
        if (this.sessionTimeouts.has(timeoutKey)) {
            clearTimeout(this.sessionTimeouts.get(timeoutKey));
            this.sessionTimeouts.delete(timeoutKey);
        }
        if (this.sessionTimeouts.has(chatId)) {
            clearTimeout(this.sessionTimeouts.get(chatId));
            this.sessionTimeouts.delete(chatId);
        }
    }

    setAdminSession(chatId, session) {
        this.adminSessions.set(chatId, {
            ...session,
            lastActivity: Date.now()
        });
    }

    getAdminSession(chatId) {
        const session = this.adminSessions.get(chatId);
        if (session) {
            session.lastActivity = Date.now();
            return session;
        }
        return null;
    }

    clearAdminSession(chatId) {
        this.adminSessions.delete(chatId);
    }

    setDepositSession(chatId, session) {
        // Normalize chatId to number for consistency
        const normalizedChatId = Number(chatId);
        this.depositSessions.set(normalizedChatId, {
            ...session,
            lastActivity: Date.now()
        });
        // Also set with string version for compatibility
        this.depositSessions.set(String(chatId), {
            ...session,
            lastActivity: Date.now()
        });
    }

    getDepositSession(chatId) {
        // Try both string and number format for chatId
        let session = this.depositSessions.get(chatId);
        if (!session) {
            session = this.depositSessions.get(String(chatId));
        }
        if (!session) {
            session = this.depositSessions.get(Number(chatId));
        }
        
        if (session) {
            session.lastActivity = Date.now();
            return session;
        }
        return null;
    }

    clearDepositSession(chatId) {
        // Clear both string and number format
        this.depositSessions.delete(chatId);
        this.depositSessions.delete(String(chatId));
        this.depositSessions.delete(Number(chatId));
    }

    setAccountSession(chatId, session) {
        this.accountSessions.set(chatId, {
            ...session,
            lastActivity: Date.now()
        });
    }

    getAccountSession(chatId) {
        const session = this.accountSessions.get(chatId);
        if (session) {
            session.lastActivity = Date.now();
            return session;
        }
        return null;
    }

    clearAccountSession(chatId) {
        this.accountSessions.delete(chatId);
    }

    clearAllSessions(chatId) {
        this.clearUserSession(chatId);
        this.clearAdminSession(chatId);
        this.clearDepositSession(chatId);
        this.clearAccountSession(chatId);
    }

    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredChatIds = [];

        // Check user sessions
        for (const [chatId, session] of this.userSessions.entries()) {
            if (now - session.lastActivity > this.SESSION_TIMEOUT) {
                expiredChatIds.push(chatId);
            }
        }

        // Check admin sessions
        for (const [chatId, session] of this.adminSessions.entries()) {
            if (now - session.lastActivity > this.SESSION_TIMEOUT) {
                expiredChatIds.push(chatId);
            }
        }

        // Check deposit sessions
        for (const [chatId, session] of this.depositSessions.entries()) {
            if (now - session.lastActivity > this.SESSION_TIMEOUT) {
                expiredChatIds.push(chatId);
            }
        }

        // Check account sessions
        for (const [chatId, session] of this.accountSessions.entries()) {
            if (now - session.lastActivity > this.SESSION_TIMEOUT) {
                expiredChatIds.push(chatId);
            }
        }

        // Clear expired sessions
        expiredChatIds.forEach(chatId => {
            this.clearAllSessions(chatId);
        });

        if (expiredChatIds.length > 0) {
           // console.info(`🧹 Cleaned up ${expiredChatIds.length} expired sessions`);
        }
    }

    getSessionStats() {
        return {
            userSessions: this.userSessions.size,
            adminSessions: this.adminSessions.size,
            depositSessions: this.depositSessions.size,
            accountSessions: this.accountSessions.size,
            totalTimeouts: this.sessionTimeouts.size
        };
    }

    // Method to check if session is valid
    isSessionValid(chatId, sessionType = 'user') {
        let session;
        switch (sessionType) {
            case 'user':
                session = this.getUserSession(chatId);
                break;
            case 'admin':
                session = this.getAdminSession(chatId);
                break;
            case 'deposit':
                session = this.getDepositSession(chatId);
                break;
            case 'account':
                session = this.getAccountSession(chatId);
                break;
            default:
                return false;
        }
        
        if (!session) return false;
        
        // Check if session is expired
        const now = Date.now();
        return (now - session.lastActivity) < this.SESSION_TIMEOUT;
    }
}

module.exports = SessionManager;