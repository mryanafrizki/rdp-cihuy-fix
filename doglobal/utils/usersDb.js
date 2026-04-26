const User = require('../models/User');
const { connectMongoDB } = require('./mongodb');

class UsersDB {
  constructor() {
    // No userId needed for global operations
  }

  async registerUser(userId, username = '', firstName = '', lastName = '') {
    await connectMongoDB();
    const userIdStr = userId.toString();
    
    let user = await User.findOne({ userId: userIdStr });
    
    if (user) {
      // Update existing user info
      user.username = username || user.username;
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.lastActive = new Date();
      await user.save();
      return user;
    } else {
      // Register new user
      user = new User({
        userId: userIdStr,
        username: username || '',
        firstName: firstName || '',
        lastName: lastName || '',
        registeredAt: new Date(),
        lastActive: new Date()
      });
      await user.save();
      return user;
    }
  }

  async getUser(userId) {
    await connectMongoDB();
    const userIdStr = userId.toString();
    return await User.findOne({ userId: userIdStr });
  }

  async getAllUsers() {
    await connectMongoDB();
    return await User.find({}).sort({ registeredAt: 1 });
  }

  async getUserCount() {
    await connectMongoDB();
    return await User.countDocuments();
  }

  async getAllUserIds() {
    await connectMongoDB();
    const users = await User.find({}, 'userId');
    return users.map(u => u.userId);
  }

  async updateLastActive(userId) {
    await connectMongoDB();
    const userIdStr = userId.toString();
    await User.findOneAndUpdate(
      { userId: userIdStr },
      { lastActive: new Date() },
      { upsert: true }
    );
  }
}

module.exports = UsersDB;
