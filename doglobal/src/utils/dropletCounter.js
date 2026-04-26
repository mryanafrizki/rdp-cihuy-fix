const DropletCounter = require('../models/DropletCounter');
const { connectMongoDB } = require('./mongodb');

/**
 * Get global droplet counter
 * @returns {Promise<number>} Total count of droplets created
 */
async function getGlobalCount() {
  await connectMongoDB();
  const counter = await DropletCounter.findOne({ key: 'global' });
  return counter ? counter.count : 0;
}

/**
 * Increment global droplet counter
 * @returns {Promise<number>} New count after increment
 */
async function incrementGlobalCount() {
  await connectMongoDB();
  const counter = await DropletCounter.findOneAndUpdate(
    { key: 'global' },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );
  return counter.count;
}

module.exports = {
  getGlobalCount,
  incrementGlobalCount
};

