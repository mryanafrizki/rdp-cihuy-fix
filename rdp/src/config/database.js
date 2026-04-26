const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const db = new sqlite3.Database(path.join(__dirname, '../rdp.db'), (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
    console.info('Connected to SQLite database');
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Promisify database methods for easier async/await usage
const dbAsync = {
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    },

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    exec(sql) {
        return new Promise((resolve, reject) => {
            db.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

// Initialize database tables
async function initDatabase() {
    try {
        // Create users table if not exists
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id INTEGER PRIMARY KEY,
                balance REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create transactions table if not exists
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                type TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(telegram_id)
            )
        `);

        // Create pending_payments table for payment tracking
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS pending_payments (
                unique_code TEXT PRIMARY KEY,
                transaction_id TEXT,
                user_id INTEGER,
                amount INTEGER,
                expiry_time INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(telegram_id)
            )
        `);

        // Create rdp_installations table for RDP tracking
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS rdp_installations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                install_id TEXT UNIQUE NOT NULL,
                user_id INTEGER NOT NULL,
                ip_address TEXT,
                hostname TEXT,
                os_type TEXT NOT NULL,
                install_type TEXT NOT NULL DEFAULT 'docker',
                cost REAL NOT NULL DEFAULT 0,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(telegram_id)
            )
        `);
        
        // Add install_id column if it doesn't exist (migration)
        try {
            await dbAsync.run(`ALTER TABLE rdp_installations ADD COLUMN install_id TEXT`);
        } catch (e) {
            // Column already exists, ignore
        }
        
        // Create unique index for install_id if not exists
        try {
            await dbAsync.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_install_id ON rdp_installations(install_id)`);
        } catch (e) {
            // Index already exists, ignore
        }
        
        // Generate install_id for existing records without install_id
        try {
            const rowsWithoutInstallId = await dbAsync.all(
                `SELECT id FROM rdp_installations WHERE install_id IS NULL OR install_id = ''`
            );
            
            if (rowsWithoutInstallId && rowsWithoutInstallId.length > 0) {
                // Import here to avoid circular dependency
                const statsModule = require('../utils/statistics');
                const generateInstallId = statsModule.generateInstallId || (() => {
                    // Fallback if not available
                    const now = new Date();
                    const day = String(now.getDate()).padStart(2, '0');
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const year = now.getFullYear();
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    let randomStr = '';
                    for (let i = 0; i < 5; i++) {
                        randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    return `${day}${month}${year}-${randomStr}`;
                });
                for (const row of rowsWithoutInstallId) {
                    let installId = generateInstallId();
                    let attempts = 0;
                    const maxAttempts = 10;
                    
                    // Ensure unique install ID
                    while (attempts < maxAttempts) {
                        try {
                            await dbAsync.run(
                                `UPDATE rdp_installations SET install_id = ? WHERE id = ?`,
                                [installId, row.id]
                            );
                            break;
                        } catch (e) {
                            if (e.message && e.message.includes('UNIQUE constraint')) {
                                installId = generateInstallId();
                                attempts++;
                                continue;
                            }
                            throw e;
                        }
                    }
                }
                console.info(`[RDP DB] Generated install_id for ${rowsWithoutInstallId.length} existing records`);
            }
        } catch (e) {
            console.error('[RDP DB] Error generating install_id for existing records:', e);
        }

        // Create rdp_statistics table for tracking stats
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS rdp_statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stat_key TEXT UNIQUE NOT NULL,
                stat_value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create admin_settings table for admin configurations
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS admin_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for faster queries
        await dbAsync.exec(`
            CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
            CREATE INDEX IF NOT EXISTS idx_pending_payments_user_id ON pending_payments(user_id);
            CREATE INDEX IF NOT EXISTS idx_pending_payments_expiry ON pending_payments(expiry_time);
            CREATE INDEX IF NOT EXISTS idx_rdp_installations_user_id ON rdp_installations(user_id);
            CREATE INDEX IF NOT EXISTS idx_rdp_installations_status ON rdp_installations(status);
        `);

        // Migration: Add transaction_id column if it doesn't exist
        await migrateDatabase();

        console.info('Database tables initialized successfully');
    } catch (error) {
        console.error('Error initializing database tables:', error);
        process.exit(1);
    }
}

// Database migration function
async function migrateDatabase() {
    try {
        // Check if transaction_id column exists in pending_payments
        const tableInfo = await dbAsync.all("PRAGMA table_info(pending_payments)");
        const hasTransactionId = tableInfo.some(column => column.name === 'transaction_id');
        
        if (!hasTransactionId) {
            console.info('Running migration: Adding transaction_id column to pending_payments...');
            await dbAsync.exec('ALTER TABLE pending_payments ADD COLUMN transaction_id TEXT');
            console.info('✅ Migration completed: transaction_id column added');
        }

        // Check if hostname column exists in rdp_installations
        const rdpTableInfo = await dbAsync.all("PRAGMA table_info(rdp_installations)");
        const hasHostname = rdpTableInfo.some(column => column.name === 'hostname');
        
        if (!hasHostname && rdpTableInfo.length > 0) {
            console.info('Running migration: Adding hostname column to rdp_installations...');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN hostname TEXT');
            console.info('✅ Migration completed: hostname column added');
        }

        // Check if install_type and cost columns exist in rdp_installations
        const hasInstallType = rdpTableInfo.some(column => column.name === 'install_type');
        const hasCost = rdpTableInfo.some(column => column.name === 'cost');
        
        if (!hasInstallType && rdpTableInfo.length > 0) {
            console.info('Running migration: Adding install_type and cost columns to rdp_installations...');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN install_type TEXT DEFAULT "docker"');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN cost REAL DEFAULT 0');
            console.info('✅ Migration completed: install_type and cost columns added');
        } else if (!hasCost && rdpTableInfo.length > 0) {
            console.info('Running migration: Adding cost column to rdp_installations...');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN cost REAL DEFAULT 0');
            console.info('✅ Migration completed: cost column added');
        }
        
        // Migration: Allow ip_address to be NULL (since IP is entered later)
        // SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table if it has NOT NULL constraint
        if (rdpTableInfo.length > 0) {
            const ipAddressColumn = rdpTableInfo.find(column => column.name === 'ip_address');
            
            // Check if ip_address has NOT NULL constraint
            if (ipAddressColumn && ipAddressColumn.notnull === 1) {
                console.info('Running migration: Removing NOT NULL constraint from ip_address in rdp_installations...');
                
                try {
                    // Step 1: Create new table without NOT NULL constraint on ip_address
                    await dbAsync.exec(`
                        CREATE TABLE rdp_installations_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            install_id TEXT UNIQUE NOT NULL,
                            user_id INTEGER NOT NULL,
                            ip_address TEXT,
                            hostname TEXT,
                            os_type TEXT NOT NULL,
                            install_type TEXT NOT NULL DEFAULT 'docker',
                            cost REAL NOT NULL DEFAULT 0,
                            status TEXT DEFAULT 'pending',
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            completed_at TIMESTAMP NULL,
                            FOREIGN KEY (user_id) REFERENCES users(telegram_id)
                        )
                    `);
                    
                    // Step 2: Copy data from old table to new table
                    await dbAsync.exec(`
                        INSERT INTO rdp_installations_new 
                        (id, install_id, user_id, ip_address, hostname, os_type, install_type, cost, status, created_at, completed_at)
                        SELECT id, install_id, user_id, ip_address, hostname, os_type, install_type, cost, status, created_at, completed_at
                        FROM rdp_installations
                    `);
                    
                    // Step 3: Drop old table
                    await dbAsync.exec('DROP TABLE rdp_installations');
                    
                    // Step 4: Rename new table
                    await dbAsync.exec('ALTER TABLE rdp_installations_new RENAME TO rdp_installations');
                    
                    // Step 5: Recreate indexes
                    await dbAsync.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_install_id ON rdp_installations(install_id)');
                    await dbAsync.exec('CREATE INDEX IF NOT EXISTS idx_rdp_installations_user_id ON rdp_installations(user_id)');
                    await dbAsync.exec('CREATE INDEX IF NOT EXISTS idx_rdp_installations_status ON rdp_installations(status)');
                    
                    console.info('✅ Migration completed: ip_address now allows NULL');
                } catch (error) {
                    console.error('❌ Migration error when removing NOT NULL constraint from ip_address:', error);
                    console.warn('⚠️ Continuing with existing table structure. Some operations may fail.');
                }
            }
        }
        
        // Check if location_info column exists in rdp_installations
        const hasLocationInfo = rdpTableInfo.some(column => column.name === 'location_info');
        
        if (!hasLocationInfo && rdpTableInfo.length > 0) {
            console.info('Running migration: Adding location_info column to rdp_installations...');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN location_info TEXT');
            console.info('✅ Migration completed: location_info column added');
        }
        
        // Check if rdp_username column exists in rdp_installations
        const hasRdpUsername = rdpTableInfo.some(column => column.name === 'rdp_username');
        
        if (!hasRdpUsername && rdpTableInfo.length > 0) {
            console.info('Running migration: Adding rdp_username column to rdp_installations...');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN rdp_username TEXT');
            console.info('✅ Migration completed: rdp_username column added');
        }
        
        // Check if rdp_password column exists in rdp_installations
        const hasRdpPassword = rdpTableInfo.some(column => column.name === 'rdp_password');
        
        if (!hasRdpPassword && rdpTableInfo.length > 0) {
            console.info('Running migration: Adding rdp_password column to rdp_installations...');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN rdp_password TEXT');
            console.info('✅ Migration completed: rdp_password column added');
        }

        // Check if failed_at column exists in rdp_installations
        const hasFailedAt = rdpTableInfo.some(column => column.name === 'failed_at');
        
        if (!hasFailedAt && rdpTableInfo.length > 0) {
            console.info('Running migration: Adding failed_at column to rdp_installations...');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN failed_at TIMESTAMP NULL');
            console.info('✅ Migration completed: failed_at column added');
        }
        
        // Create rdp_tracking_requests table for tracking requests with owner approval
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS rdp_tracking_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT UNIQUE NOT NULL,
                requester_id INTEGER NOT NULL,
                install_id TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                owner_approved_at TIMESTAMP NULL,
                owner_rejected_at TIMESTAMP NULL,
                last_resent_at TIMESTAMP NULL,
                target_owner_type TEXT DEFAULT 'installer_owner',
                rejection_count INTEGER DEFAULT 0,
                FOREIGN KEY (requester_id) REFERENCES users(telegram_id)
            )
        `);
        
        // Migration: Add new columns if they don't exist
        try {
            const tableInfo = await dbAsync.all("PRAGMA table_info(rdp_tracking_requests)");
            const hasLastResentAt = tableInfo.some(column => column.name === 'last_resent_at');
            const hasTargetOwnerType = tableInfo.some(column => column.name === 'target_owner_type');
            const hasRejectionCount = tableInfo.some(column => column.name === 'rejection_count');
            
            if (!hasLastResentAt) {
                await dbAsync.exec('ALTER TABLE rdp_tracking_requests ADD COLUMN last_resent_at TIMESTAMP NULL');
                console.info('✅ Migration completed: last_resent_at column added to rdp_tracking_requests');
            }
            if (!hasTargetOwnerType) {
                await dbAsync.exec('ALTER TABLE rdp_tracking_requests ADD COLUMN target_owner_type TEXT DEFAULT \'installer_owner\'');
                console.info('✅ Migration completed: target_owner_type column added to rdp_tracking_requests');
            }
            if (!hasRejectionCount) {
                await dbAsync.exec('ALTER TABLE rdp_tracking_requests ADD COLUMN rejection_count INTEGER DEFAULT 0');
                console.info('✅ Migration completed: rejection_count column added to rdp_tracking_requests');
            }
        } catch (e) {
            // Column already exists or table doesn't exist yet, ignore
        }
        
        // Create index for faster lookups
        try {
            await dbAsync.run(`CREATE INDEX IF NOT EXISTS idx_tracking_requester ON rdp_tracking_requests(requester_id, created_at)`);
            await dbAsync.run(`CREATE INDEX IF NOT EXISTS idx_tracking_install ON rdp_tracking_requests(install_id, status)`);
            await dbAsync.run(`CREATE INDEX IF NOT EXISTS idx_tracking_expires ON rdp_tracking_requests(expires_at, status)`);
        } catch (e) {
            // Index already exists, ignore
        }
        
        // Create rdp_settings table for app settings
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS rdp_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Initialize tracking_request_approval_mode setting (default: false = installer owner)
        try {
            const existing = await dbAsync.get(`SELECT * FROM rdp_settings WHERE key = 'tracking_request_approval_mode'`);
            if (!existing) {
                await dbAsync.run(
                    `INSERT INTO rdp_settings (key, value) VALUES ('tracking_request_approval_mode', '0')`
                );
                console.info('✅ Initialized tracking_request_approval_mode setting');
            }
        } catch (e) {
            console.error('Error initializing tracking_request_approval_mode:', e);
        }

    } catch (error) {
        console.error('Migration error:', error);
        // Don't exit on migration errors, continue with app startup
    }
}

// Database maintenance functions
const maintenance = {
    // Clean up expired payments
    async cleanupExpiredPayments() {
        try {
            const result = await dbAsync.run(
                'DELETE FROM pending_payments WHERE expiry_time <= ?',
                [Date.now()]
            );
            if (result.changes > 0) {
                console.info(`🧹 Cleaned up ${result.changes} expired payments`);
            }
            return result.changes;
        } catch (error) {
            console.error('Error cleaning up expired payments:', error);
            return 0;
        }
    },

    // Clean up old transactions (older than 1 year)
    async cleanupOldTransactions() {
        try {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            
            const result = await dbAsync.run(
                'DELETE FROM transactions WHERE created_at < ?',
                [oneYearAgo.toISOString()]
            );
            if (result.changes > 0) {
                console.info(`🧹 Cleaned up ${result.changes} old transactions`);
            }
            return result.changes;
        } catch (error) {
            console.error('Error cleaning up old transactions:', error);
            return 0;
        }
    },

    // Get database statistics
    async getStats() {
        try {
            const users = await dbAsync.get('SELECT COUNT(*) as count FROM users');
            const transactions = await dbAsync.get('SELECT COUNT(*) as count FROM transactions');
            const pendingPayments = await dbAsync.get('SELECT COUNT(*) as count FROM pending_payments');
            const rdpInstallations = await dbAsync.get('SELECT COUNT(*) as count FROM rdp_installations WHERE status = "completed"');

            return {
                users: users.count,
                transactions: transactions.count,
                pendingPayments: pendingPayments.count,
                completedRDPs: rdpInstallations.count
            };
        } catch (error) {
            console.error('Error getting database stats:', error);
            return null;
        }
    }
};

// Schedule automatic maintenance
setInterval(async () => {
    await maintenance.cleanupExpiredPayments();
}, 30 * 60 * 1000); // Every 30 minutes

// Weekly cleanup of old transactions
setInterval(async () => {
    await maintenance.cleanupOldTransactions();
}, 7 * 24 * 60 * 60 * 1000); // Every 7 days

// Initialize database on startup
initDatabase();

// Close database on process termination
process.on('SIGINT', () => {
    console.info('🔄 Shutting down bot gracefully...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.info('Database connection closed');
        }
        process.exit(err ? 1 : 0);
    });
});

// Export database instance and maintenance functions
module.exports = {
    ...dbAsync,
    maintenance,
    raw: db // Raw database instance for advanced operations
};
