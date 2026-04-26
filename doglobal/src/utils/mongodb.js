const mongoose = require('mongoose');

// MongoDB connection
let isConnected = false;

async function connectMongoDB() {
  if (isConnected) {
    return mongoose.connection;
  }

  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/digitalocean-bot';

  try {
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    isConnected = true;
    console.info('[MongoDB] ✅ Connected to MongoDB');
    return mongoose.connection;
  } catch (error) {
    console.error('[MongoDB] ❌ Connection error:', error);
    throw error;
  }
}

async function disconnectMongoDB() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    console.info('[MongoDB] Disconnected from MongoDB');
  }
}

module.exports = { connectMongoDB, disconnectMongoDB };

