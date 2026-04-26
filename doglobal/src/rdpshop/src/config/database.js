const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const dbPath = process.env.DB_PATH || path.join(__dirname, '../rdp.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
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
                commission_balance REAL DEFAULT 0,
                bank_details TEXT,
                referral_code TEXT UNIQUE,
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
                user_id INTEGER NOT NULL,
                ip_address TEXT NOT NULL,
                hostname TEXT,
                os_type TEXT NOT NULL,
                type TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(telegram_id)
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

        // Create referrals table
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS referrals (
                referrer_id INTEGER NOT NULL,
                referee_id INTEGER NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referrer_id) REFERENCES users(telegram_id),
                FOREIGN KEY (referee_id) REFERENCES users(telegram_id)
            )
        `);

        // Create withdrawals table
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                details TEXT NOT NULL,
                status TEXT DEFAULT 'pending', -- pending, approved, rejected
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(telegram_id)
            )
        `);

        // Create commissions table
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS commissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER NOT NULL,
                referee_id INTEGER NOT NULL,
                purchase_amount REAL NOT NULL,
                commission_amount REAL NOT NULL,
                product_type TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referrer_id) REFERENCES users(telegram_id)
            )
        `);

        // Create rented_bots table
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS rented_bots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                bot_token TEXT NOT NULL,
                admin_telegram_id INTEGER NOT NULL,
                payment_api_key TEXT,
                rental_duration_months INTEGER NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                process_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(telegram_id)
            )
        `);

        // Create promotions table
        await dbAsync.exec(`
            CREATE TABLE IF NOT EXISTS promotions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_type TEXT NOT NULL,
                discount_percentage REAL NOT NULL,
                start_date TIMESTAMP NOT NULL,
                end_date TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Add transaction_id column if it doesn't exist
        await migrateDatabase();

        console.log('Database tables initialized successfully');
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
            console.log('Running migration: Adding transaction_id column to pending_payments...');
            await dbAsync.exec('ALTER TABLE pending_payments ADD COLUMN transaction_id TEXT');
            console.log('✅ Migration completed: transaction_id column added');
        }

        // Check if hostname column exists in rdp_installations
        const rdpTableInfo = await dbAsync.all("PRAGMA table_info(rdp_installations)");
        const hasHostname = rdpTableInfo.some(column => column.name === 'hostname');
        
        if (!hasHostname && rdpTableInfo.length > 0) {
            console.log('Running migration: Adding hostname column to rdp_installations...');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN hostname TEXT');
            console.log('✅ Migration completed: hostname column added');
        }

        // Check if type column exists in rdp_installations
        const hasType = rdpTableInfo.some(column => column.name === 'type');
        if (!hasType && rdpTableInfo.length > 0) {
            console.log('Running migration: Adding type column to rdp_installations...');
            await dbAsync.exec('ALTER TABLE rdp_installations ADD COLUMN type TEXT');
            console.log('✅ Migration completed: type column added');
        }

        // Check if referral_code column exists in users
        const usersTableInfo = await dbAsync.all("PRAGMA table_info(users)");
        const hasReferralCode = usersTableInfo.some(column => column.name === 'referral_code');
        if (!hasReferralCode) {
            console.log('Running migration: Adding referral_code column to users...');
            await dbAsync.exec('ALTER TABLE users ADD COLUMN referral_code TEXT');
            await dbAsync.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code)');
            console.log('✅ Migration completed: referral_code column added and index created');
        }

        const hasBankDetails = usersTableInfo.some(column => column.name === 'bank_details');
        if (!hasBankDetails) {
            console.log('Running migration: Adding bank_details column to users...');
            await dbAsync.exec('ALTER TABLE users ADD COLUMN bank_details TEXT');
            console.log('✅ Migration completed: bank_details column added');
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
                console.log(`🧹 Cleaned up ${result.changes} expired payments`);
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
                console.log(`🧹 Cleaned up ${result.changes} old transactions`);
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
            const totalDeposits = await dbAsync.get('SELECT SUM(amount) as total FROM transactions WHERE type = "deposit"');
            const totalDockerRDPs = await dbAsync.get('SELECT COUNT(*) as count FROM rdp_installations WHERE type = "docker"');
            const totalDedicatedRDPs = await dbAsync.get('SELECT COUNT(*) as count FROM rdp_installations WHERE type = "dedicated"');

            return {
                users: users.count,
                transactions: transactions.count,
                pendingPayments: pendingPayments.count,
                completedRDPs: rdpInstallations.count,
                totalDeposits: totalDeposits.total || 0,
                totalDockerRDPs: totalDockerRDPs.count,
                totalDedicatedRDPs: totalDedicatedRDPs.count
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
    console.log('🔄 Shutting down bot gracefully...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
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