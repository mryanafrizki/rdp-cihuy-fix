const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: String,
    desc: String,
    snk: String,
    price: Number,
    stok: [String],
    terjual: { type: Number, default: 0 },
    discount: Object,
	isResellerOnly: { type: Boolean, default: false } 
	
});


const productSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true, index: true }, // PENTING: Index untuk query cepat (unique sudah otomatis index)
    name: String,
    desc: String,
	category: { type: [String], default: ['Uncategorized'] }, 
    variants: { type: Map, of: variantSchema },
    terjual: { type: Number, default: 0 },
});

// COMMENTED: Index sudah ada dari unique: true dan index: true di schema, tidak perlu duplicate
// productSchema.index({ id: 1 }); // REMOVED: Duplicate index - sudah ada dari unique: true dan index: true

const Produk = mongoose.model('Produk', productSchema);

const pesananPendingSchema = new mongoose.Schema({ 
    userId: { type: String, required: true, unique: true, index: true }, // PENTING: Index untuk query cepat
    userName: { type: String },
    userUsername: { type: String, required: false }, 
    orderId: { type: String, required: true, unique: true },
    transactionId: { type: String, required: true, index: true }, // PENTING: Index untuk query cepat
    productId: { type: String, required: true, index: true }, // PENTING: Index untuk query cepat
    variantId: { type: String, required: true },
    quantity: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    qrMessageId: { type: Number },
    expireAt: { type: Date, required: true, index: true }, // PENTING: Index untuk query expireAt > now
    reservedStock: [String],
    paymentGatewayId: { type: String, index: true }, // PENTING: Index untuk payment status check
    createdAt: { type: Date, default: Date.now }
});

const blockedUserSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    username: { 
        type: String 
    },
    blockedAt: { 
        type: Date, 
        default: Date.now 
    },
    reason: {
        type: String,
        default: 'Diblokir oleh Owner'
    }
});

const BlockedUser = mongoose.model('BlockedUser', blockedUserSchema);


const PesananPending = mongoose.model('PesananPending', pesananPendingSchema); 

const warrantyReminderSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true }, 
    accountData: { type: String, required: true }, 
    expiresAt: { type: Date, required: true }, 
    notified: { type: Boolean, default: false }, 
    createdAt: { type: Date, default: Date.now }
});

const WarrantyReminder = mongoose.model('WarrantyReminder', warrantyReminderSchema);


const penggunaTeleSchema = new mongoose.Schema({ 
    userId: { type: String, required: true, unique: true, index: true }, // PENTING: Index untuk query cepat
    firstName: { type: String },
    userUsername: { type: String, required: false, index: true }, // PENTING: Index untuk query by username
    balance: { type: Number, default: 0 },
    registeredAt: { type: Date, default: Date.now }
});

const PenggunaTele = mongoose.model('PenggunaTele', penggunaTeleSchema); 


const profitTeleSchema = new mongoose.Schema({
    userId: String,
    userName: String,
    userUsername: { type: String, required: false }, 
    productName: String,
    variantName: String,
    quantity: Number,
    price: Number,
    discountPrice: Number, 
    fee: Number,
    totalAmountPaid: Number,
    timestamp: { type: Date, default: Date.now }
});

const ProfitTele = mongoose.model('ProfitTele', profitTeleSchema);

const restockNotificationSchema = new mongoose.Schema({
    variantId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    userName: { type: String },
    createdAt: { type: Date, default: Date.now }
});


restockNotificationSchema.index({ variantId: 1, userId: 1 }, { unique: true });

const RestockNotification = mongoose.model('RestockNotification', restockNotificationSchema);


const pendingDepositSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true }, 
    userName: { type: String, required: false },
    userUsername: { type: String, required: false },
    depositId: { type: String, required: true, unique: true }, 
    amount: { type: Number, required: true }, // Base deposit amount (IDR)
    uniqueCode: { type: Number, default: 0 }, // Unique code for payment
    finalAmountToPay: { type: Number, required: true }, // Total to pay (amount + uniqueCode)
    totalAmount: { type: Number, required: true }, // Same as finalAmountToPay
    paymentMethod: { type: String, enum: ['qris', 'binance'], default: 'qris' },
    
    // QRIS specific fields
    qrString: { type: String },
    qrMessageId: { type: Number },
    paymentGatewayId: { type: String }, 
    
    // Binance specific fields
    usdtAmount: { type: Number }, // Total USDT amount for Binance
    payerName: { type: String }, // Optional payer name for Binance
    messageId: { type: Number }, // Instruction message ID for Binance
    
    status: { type: String, enum: ['pending', 'completed', 'expired'], default: 'pending' },
    expirationTime: { type: Date }, // Expiration timestamp
    expireAt: { type: Date, required: true, index: { expires: '10m' } }, 
    createdAt: { type: Date, default: Date.now }
});

const PendingDepositTele = mongoose.model('PendingDepositTele', pendingDepositSchema);

const testimonyCounterSchema = new mongoose.Schema({
    _id: { type: String, required: true, default: 'testimonyId' },
    seq: { type: Number, default: 0 }
});

const TestimonyCounter = mongoose.model('TestimonyCounter', testimonyCounterSchema);

// Schema untuk Global Transaction Counter
const transactionCounterSchema = new mongoose.Schema({
    _id: { type: String, required: true, default: 'globalTransactionId' },
    seq: { type: Number, default: 0 }
});

const TransactionCounter = mongoose.model('TransactionCounter', transactionCounterSchema);

const resellerSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true }, // ID Telegram Reseller
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Reseller = mongoose.model('Reseller', resellerSchema);

// Schema untuk Binance Payment (untuk order payment, bukan deposit balance)
const pendingBinancePaymentSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    userName: { type: String },
    userUsername: { type: String },
    paymentId: { type: String, required: true, unique: true }, // unique payment ID
    orderId: { type: String, required: true }, // link ke order
    orderType: { type: String, required: true }, // 'limited' atau 'regular'
    productId: { type: String, required: true },
    variantId: { type: String, required: true },
    quantity: { type: Number, default: 1 }, // untuk regular order
    baseAmount: { type: Number, required: true }, // harga asli dalam USDT
    uniqueAmount: { type: Number, required: true }, // harga + unique code
    uniqueCode: { type: String, required: true }, // kode unik random
    payerName: { type: String }, // optional payer name from user input
    status: { type: String, default: 'pending' }, // pending, completed, expired, cancelled
    reservedStock: [String], // stock yang direserve
    qrMessageId: { type: Number }, // message ID untuk payment instruction
    expireAt: { type: Date, required: true },
    completedAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

const PendingBinancePayment = mongoose.model('PendingBinancePayment', pendingBinancePaymentSchema);

// Processed Email Tracking (untuk prevent duplicate processing)
const processedEmailSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true, index: true },
    uid: { type: Number, required: true },
    from: { type: String },
    subject: { type: String },
    amount: { type: Number },
    processedAt: { type: Date, default: Date.now },
    matched: { type: Boolean, default: false },
    paymentId: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Auto-delete after 7 days
processedEmailSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const ProcessedEmail = mongoose.model('ProcessedEmail', processedEmailSchema);

// User Statistics Schema (untuk tracking statistik user)
const userStatisticsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String },
    userUsername: { type: String },
    
    // Terdaftar
    registeredAt: { type: Date, default: Date.now },
    
    // Aktif terakhir (umum dan rdp)
    lastActiveUmum: { type: Date }, // Terakhir menggunakan bot umum
    lastActiveRdp: { type: Date }, // Terakhir menggunakan bot rdp
    
    // Total transaksi sukses (umum dan rdp)
    totalTransactionsUmum: { type: Number, default: 0 }, // Transaksi umum (reguler + limited)
    totalTransactionsRdp: { type: Number, default: 0 }, // Transaksi rdp (installations)
    
    // Total pendapatan dari user (umum dan rdp)
    totalRevenueUmum: { type: Number, default: 0 }, // Pendapatan dari transaksi umum
    totalRevenueRdp: { type: Number, default: 0 }, // Pendapatan dari transaksi rdp
    
    // Updated at
    updatedAt: { type: Date, default: Date.now }
});

// Index untuk query
userStatisticsSchema.index({ registeredAt: 1 });
userStatisticsSchema.index({ lastActiveUmum: 1 });
userStatisticsSchema.index({ lastActiveRdp: 1 });

const UserStatistics = mongoose.model('UserStatistics', userStatisticsSchema);

module.exports = { Produk, PesananPending, PenggunaTele, ProfitTele, RestockNotification, PendingDepositTele, TestimonyCounter, TransactionCounter, Reseller, WarrantyReminder, BlockedUser, PendingBinancePayment, ProcessedEmail, UserStatistics };
