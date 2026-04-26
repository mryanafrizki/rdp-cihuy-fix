const Account = require('../models/Account');
const { connectMongoDB } = require('./mongodb');

class AccountsDB {
  constructor(userId) {
    this.userId = userId.toString();
  }

  async load() {
    await connectMongoDB();
    const accounts = await Account.find({ userId: this.userId });
    return accounts.map(acc => ({
      id: acc.accountId,
      email: acc.email,
      token: acc.token,
      remarks: acc.remarks,
      date: acc.date
    }));
  }

  async all() {
    return await this.load();
  }

  async add(email, token, remarks = '') {
    await connectMongoDB();
    
    email = email.trim();
    token = token.trim();
    
    // Check if token already exists
    const existing = await Account.findOne({ userId: this.userId, token });
    if (existing) {
      throw new Error('Token already exists');
    }

    const account = new Account({
      userId: this.userId,
      email,
      token,
      remarks,
      date: new Date().toISOString().split('T')[0]
    });

    await account.save();
    return {
      id: account.accountId,
      email: account.email,
      token: account.token,
      remarks: account.remarks,
      date: account.date
    };
  }

  async get(id) {
    await connectMongoDB();
    const account = await Account.findOne({ userId: this.userId, accountId: id });
    if (!account) return null;
    return {
      id: account.accountId,
      email: account.email,
      token: account.token,
      remarks: account.remarks,
      date: account.date
    };
  }

  async remove(id) {
    await connectMongoDB();
    const result = await Account.deleteOne({ userId: this.userId, accountId: id });
    return result.deletedCount > 0;
  }

  async update(id, updates) {
    await connectMongoDB();
    const account = await Account.findOne({ userId: this.userId, accountId: id });
    if (!account) {
      throw new Error('Account not found');
    }
    Object.assign(account, updates);
    await account.save();
    return {
      id: account.accountId,
      email: account.email,
      token: account.token,
      remarks: account.remarks,
      date: account.date
    };
  }
}

module.exports = AccountsDB;
