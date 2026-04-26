const mongoose = require('mongoose');

const dropletCounterSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global'
  },
  count: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const DropletCounter = mongoose.model('DropletCounter', dropletCounterSchema);

module.exports = DropletCounter;

