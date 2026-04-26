const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  selectedProxyId: {
    type: String,
    default: null
  },
  useProxy: {
    type: Boolean,
    default: false // Default: tidak menggunakan proxy sama sekali
  }
}, {
  timestamps: true
});

const UserSettings = mongoose.model('UserSettings', userSettingsSchema);

module.exports = UserSettings;

