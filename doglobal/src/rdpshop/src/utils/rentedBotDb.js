const sqlite3 = require('sqlite3').verbose();

async function initializeRentedBotDatabase(dbPath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error(`Error creating rented bot database at ${dbPath}:`, err);
                return reject(err);
            }
            console.log(`Successfully connected to new database: ${dbPath}`);
        });

        const dbAsync = {
            exec(sql) {
                return new Promise((resolve, reject) => {
                    db.exec(sql, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
        };

        db.serialize(async () => {
            try {
                console.log(`Initializing tables for database: ${dbPath}`);
                await dbAsync.exec(`
                    CREATE TABLE IF NOT EXISTS users (
                        telegram_id INTEGER PRIMARY KEY,
                        balance REAL DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await dbAsync.exec(`
                    CREATE TABLE IF NOT EXISTS transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        amount REAL NOT NULL,
                        type TEXT NOT NULL, -- e.g., 'deposit', 'purchase'
                        description TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
                    )
                `);
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
                console.log(`Tables initialized successfully for ${dbPath}`);
                db.close((err) => {
                    if (err) {
                        console.error(`Error closing database ${dbPath}:`, err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                console.error(`Error initializing tables for ${dbPath}:`, error);
                db.close();
                reject(error);
            }
        });
    });
}

module.exports = { initializeRentedBotDatabase };