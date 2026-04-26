const mongoose = require('mongoose');

const dropletSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  dropletId: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  accountId: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Compound index for unique droplet per user
dropletSchema.index({ userId: 1, dropletId: 1, accountId: 1 }, { unique: true });

const Droplet = mongoose.model('Droplet', dropletSchema);

module.exports = Droplet;

