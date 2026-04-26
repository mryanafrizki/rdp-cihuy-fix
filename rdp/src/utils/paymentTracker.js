const db = require('../config/database');
const { getUser } = require('./userManager');

class PaymentTracker {
  static async initTable() {
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS pending_payments (
          unique_code TEXT PRIMARY KEY,
          transaction_id TEXT,
          user_id INTEGER,
          amount INTEGER,
          expiry_time INTEGER,
          qr_message_id INTEGER,
          reminder_message_id INTEGER,
          deposit_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(telegram_id)
        )
      `);
      
      // Add new columns if they don't exist (migration)
      try {
        await db.exec(`ALTER TABLE pending_payments ADD COLUMN qr_message_id INTEGER`);
      } catch {}
      try {
        await db.exec(`ALTER TABLE pending_payments ADD COLUMN reminder_message_id INTEGER`);
      } catch {}
      try {
        await db.exec(`ALTER TABLE pending_payments ADD COLUMN deposit_id TEXT`);
      } catch {}
    } catch (error) {
      console.error('Error initializing pending_payments table:', error);
      throw error;
    }
  }

  static async addPendingPayment(userId, transactionId, uniqueCode, amount, expiryTime, qrMessageId = null, depositId = null) {
    try {
      await this.initTable();
      await getUser(userId);
      await db.run('DELETE FROM pending_payments WHERE user_id = ?', [userId]);
      await db.run(
        'INSERT INTO pending_payments (unique_code, transaction_id, user_id, amount, expiry_time, qr_message_id, reminder_message_id, deposit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uniqueCode, transactionId, userId, amount, expiryTime, qrMessageId, null, depositId]
      );
    } catch (error) {
      console.error('Error adding pending payment:', error);
      throw error;
    }
  }
  
  static async updateReminderMessageId(transactionId, reminderMessageId) {
    try {
      await db.run('UPDATE pending_payments SET reminder_message_id = ? WHERE transaction_id = ?', [reminderMessageId, transactionId]);
    } catch (error) {
      console.error('Error updating reminder message ID:', error);
    }
  }
  
  static async updateQrMessageId(transactionId, qrMessageId) {
    try {
      await db.run('UPDATE pending_payments SET qr_message_id = ? WHERE transaction_id = ?', [qrMessageId, transactionId]);
    } catch (error) {
      console.error('Error updating QR message ID:', error);
    }
  }
  
  static async getAllPendingPayments() {
    try {
      await this.initTable();
      const payments = await db.all('SELECT * FROM pending_payments WHERE expiry_time > ?', [Date.now()]);
      return payments;
    } catch (error) {
      console.error('Error getting all pending payments:', error);
      return [];
    }
  }

  static async getActivePaymentsCount() {
    try {
      await this.initTable();
      const result = await db.get('SELECT COUNT(*) as count FROM pending_payments WHERE expiry_time > ?', [Date.now()]);
      return result?.count || 0;
    } catch (error) {
      console.error('Error getting active payments count:', error);
      return 0;
    }
  }

  static async getPendingPayment(userId) {
    try {
      await this.initTable();
      const payment = await db.get(
        'SELECT * FROM pending_payments WHERE user_id = ? AND expiry_time > ? ORDER BY created_at DESC LIMIT 1',
        [userId, Date.now()]
      );
      return payment;
    } catch (error) {
      console.error('Error getting pending payment:', error);
      throw error;
    }
  }

  static async removePendingPayment(transactionId) {
    try {
      await db.run('DELETE FROM pending_payments WHERE transaction_id = ?', [transactionId]);
    } catch (error) {
      console.error('Error removing pending payment:', error);
      throw error;
    }
  }

  static async removePendingPaymentByUserId(userId) {
    try {
      await db.run('DELETE FROM pending_payments WHERE user_id = ?', [userId]);
    } catch (error) {
      console.error('Error removing pending payment by user ID:', error);
      throw error;
    }
  }

  static async cleanupExpiredPayments() {
    try {
      await this.initTable();
      const result = await db.run('DELETE FROM pending_payments WHERE expiry_time <= ?', [Date.now()]);
      if (result.changes > 0) {
        console.info(`Cleaned up ${result.changes} expired payments`);
      }
    } catch (error) {
      console.error('Error cleaning up expired payments:', error);
    }
  }
}

module.exports = PaymentTracker;