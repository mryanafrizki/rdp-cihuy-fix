const Droplet = require('../models/Droplet');
const { connectMongoDB } = require('./mongodb');

class DropletsDB {
  constructor(userId) {
    this.userId = userId.toString();
  }

  async load() {
    await connectMongoDB();
    const droplets = await Droplet.find({ userId: this.userId });
    return droplets.map(d => ({
      dropletId: d.dropletId,
      password: d.password,
      accountId: d.accountId
    }));
  }

  async setPassword(dropletId, password, accountId) {
    await connectMongoDB();
    // Ensure all values are strings for consistency
    const dropletIdStr = dropletId ? dropletId.toString() : dropletId;
    const accountIdStr = accountId ? accountId.toString() : accountId;
    
    const result = await Droplet.findOneAndUpdate(
      { userId: this.userId, dropletId: dropletIdStr, accountId: accountIdStr },
      { userId: this.userId, dropletId: dropletIdStr, password, accountId: accountIdStr },
      { upsert: true, new: true }
    );
    return result;
  }

  async getPassword(dropletId, accountId) {
    await connectMongoDB();
    // Ensure all values are strings for consistency
    const dropletIdStr = dropletId ? dropletId.toString() : dropletId;
    const accountIdStr = accountId ? accountId.toString() : accountId;
    
    const droplet = await Droplet.findOne({ userId: this.userId, dropletId: dropletIdStr, accountId: accountIdStr });
    
    return droplet ? droplet.password : null;
  }

  async remove(dropletId) {
    await connectMongoDB();
    const result = await Droplet.deleteOne({ userId: this.userId, dropletId });
    return result.deletedCount > 0;
  }
}

module.exports = DropletsDB;
