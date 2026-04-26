const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const accountSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  accountId: {
    type: String,
    required: true,
    default: () => uuidv4()
  },
  email: {
    type: String,
    required: true
  },
  token: {
    type: String,
    required: true
  },
  remarks: {
    type: String,
    default: ''
  },
  date: {
    type: String,
    default: () => new Date().toISOString().split('T')[0]
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate tokens per user
accountSchema.index({ userId: 1, token: 1 }, { unique: true });

// Limit validation
accountSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('Account').countDocuments({ userId: this.userId });
    if (count >= 30) {
      return next(new Error('Maksimal 30 akun per user'));
    }
  }
  next();
});

const Account = mongoose.model('Account', accountSchema);

module.exports = Account;

