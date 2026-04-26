const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const proxySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  proxyId: {
    type: String,
    required: true,
    default: () => uuidv4()
  },
  protocol: {
    type: String,
    required: true,
    enum: ['http', 'https', 'socks4', 'socks5']
  },
  host: {
    type: String,
    required: true
  },
  port: {
    type: Number,
    required: true
  },
  auth: {
    username: {
      type: String,
      default: ''
    },
    password: {
      type: String,
      default: ''
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Limit validation
proxySchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('Proxy').countDocuments({ userId: this.userId });
    if (count >= 30) {
      return next(new Error('Maksimal 30 proxy per user'));
    }
  }
  next();
});

const Proxy = mongoose.model('Proxy', proxySchema);

module.exports = Proxy;

