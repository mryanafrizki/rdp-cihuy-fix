const db = require('./database');

class VPSProductManager {
    static async initTable() {
        try {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS vps_products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id INTEGER NOT NULL,
                    do_size_slug TEXT NOT NULL,
                    name TEXT NOT NULL,
                    price INTEGER NOT NULL,
                    cpu INTEGER NOT NULL,
                    memory INTEGER NOT NULL,
                    disk INTEGER NOT NULL,
                    transfer REAL NOT NULL,
                    price_hourly REAL NOT NULL,
                    price_monthly REAL NOT NULL,
                    regions TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await db.exec(`
                CREATE TABLE IF NOT EXISTS do_tokens (
                    admin_id INTEGER PRIMARY KEY,
                    token TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await db.exec(`
                CREATE TABLE IF NOT EXISTS vps_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    droplet_id INTEGER,
                    region TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    ip_address TEXT,
                    root_password TEXT,
                    rdp_password TEXT,
                    windows_version TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP NULL,
                    expires_at TIMESTAMP NULL,
                    FOREIGN KEY (user_id) REFERENCES users(telegram_id),
                    FOREIGN KEY (product_id) REFERENCES vps_products(id)
                )
            `);

            // Add expires_at column to vps_orders if it doesn't exist
            const vpsOrdersColumns = await db.all("PRAGMA table_info(vps_orders)");
            if (!vpsOrdersColumns.some(col => col.name === 'expires_at')) {
                await db.exec('ALTER TABLE vps_orders ADD COLUMN expires_at TIMESTAMP NULL');
                console.log('Added expires_at column to vps_orders table');
            }

            console.log('VPS Products tables initialized successfully');
        } catch (error) {
            console.error('Error initializing VPS products tables:', error);
            throw error;
        }
    }

    static async addDOToken(adminId, token) {
        await this.initTable();
        await db.run(
            'INSERT OR REPLACE INTO do_tokens (admin_id, token, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [adminId, token]
        );
    }

    static async getDOToken(adminId) {
        await this.initTable();
        const result = await db.get('SELECT token FROM do_tokens WHERE admin_id = ?', [adminId]);
        return result?.token;
    }

    static async addProduct(adminId, productData) {
        await this.initTable();
        const result = await db.run(
            `INSERT INTO vps_products 
             (admin_id, do_size_slug, name, price, cpu, memory, disk, transfer, price_hourly, price_monthly, regions) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                adminId,
                productData.slug,
                productData.name,
                productData.price,
                productData.vcpus,
                productData.memory,
                productData.disk,
                productData.transfer,
                productData.price_hourly,
                productData.price_monthly,
                JSON.stringify(productData.regions)
            ]
        );
        return result.id;
    }

    static async getProducts(adminId = null) {
        await this.initTable();
        const query = adminId 
            ? 'SELECT * FROM vps_products WHERE admin_id = ? AND is_active = 1 ORDER BY price ASC'
            : 'SELECT * FROM vps_products WHERE is_active = 1 ORDER BY price ASC';
        const params = adminId ? [adminId] : [];
        
        const products = await db.all(query, params);
        return products.map(product => ({
            ...product,
            regions: JSON.parse(product.regions)
        }));
    }

    static async getProductById(productId) {
        await this.initTable();
        const product = await db.get('SELECT * FROM vps_products WHERE id = ?', [productId]);
        if (product) {
            product.regions = JSON.parse(product.regions);
        }
        return product;
    }

    static async deleteProduct(productId) {
        await this.initTable();
        await db.run('UPDATE vps_products SET is_active = 0 WHERE id = ?', [productId]);
    }

    static async createOrder(userId, productId, region, windowsVersion = null, rdpPassword = null) {
        await this.initTable();
        const result = await db.run(
            `INSERT INTO vps_orders (user_id, product_id, region, windows_version, rdp_password) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, productId, region, windowsVersion, rdpPassword]
        );
        return result.id;
    }

    static async updateOrder(orderId, updates) {
        await this.initTable();
        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);
        values.push(orderId);
        
        await db.run(`UPDATE vps_orders SET ${fields} WHERE id = ?`, values);
    }

    static async getOrder(orderId) {
        await this.initTable();
        return await db.get('SELECT * FROM vps_orders WHERE id = ?', [orderId]);
    }

    static async getUserOrders(userId) {
        await this.initTable();
        return await db.all(
            `SELECT vo.*, vp.name as product_name, vp.cpu, vp.memory, vp.disk 
             FROM vps_orders vo 
             JOIN vps_products vp ON vo.product_id = vp.id 
             WHERE vo.user_id = ? 
             ORDER BY vo.created_at DESC`,
            [userId]
        );
    }

    static async getTotalVPSOrders() {
        await this.initTable();
        const result = await db.get("SELECT COUNT(*) as count FROM vps_orders WHERE windows_version IS NULL");
        return result.count;
    }

    static async getTotalVPSRDPOrders() {
        await this.initTable();
        const result = await db.get("SELECT COUNT(*) as count FROM vps_orders WHERE windows_version IS NOT NULL");
        return result.count;
    }

    static async getAllActiveOrders() {
        await this.initTable();
        return await db.all("SELECT * FROM vps_orders WHERE status = 'completed'");
    }
}

// Initialize tables on startup
VPSProductManager.initTable();

module.exports = VPSProductManager;