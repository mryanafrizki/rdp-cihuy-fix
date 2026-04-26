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
    await Droplet.findOneAndUpdate(
      { userId: this.userId, dropletId, accountId },
      { userId: this.userId, dropletId, password, accountId },
      { upsert: true, new: true }
    );
  }

  async getPassword(dropletId, accountId) {
    await connectMongoDB();
    const droplet = await Droplet.findOne({ userId: this.userId, dropletId, accountId });
    return droplet ? droplet.password : null;
  }

  async remove(dropletId) {
    await connectMongoDB();
    const result = await Droplet.deleteOne({ userId: this.userId, dropletId });
    return result.deletedCount > 0;
  }
}

module.exports = DropletsDB;
