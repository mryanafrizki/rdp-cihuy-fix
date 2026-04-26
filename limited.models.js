// limited.models.js
const mongoose = require('mongoose');

const limitedOfferSchema = new mongoose.Schema({
  // ===== PRODUK & VARIANT LIMITED (TERPISAH DARI PRODUK BIASA) =====
  productId: { type: String, required: true, index: true },       // ID unik produk limited
  productName: { type: String, required: false, default: '' },    // ✅ NOT required (untuk backward compatibility)
  variantId: { type: String, required: true, index: true },       // ID unik variant limited
  variantName: { type: String, required: false, default: '' },    // ✅ NOT required (untuk backward compatibility)
  
  enabled:   { type: Boolean, default: true },
  // harga khusus limited (0 = gratis, >0 = berbayar)
  price:     { type: Number, default: 0, min: 0 },

  // stok khusus limited/free (1 kode = 1 unit)
  stock:     { type: [String], default: [] },

  // 1 user 1x klaim (default 1)
  perUserLimit: { type: Number, default: 1 },
  
  // Metadata tambahan (opsional)
  description: { type: String, default: '' },
}, { timestamps: true });

limitedOfferSchema.index({ productId: 1, variantId: 1 }, { unique: true });

const LimitedOffer = mongoose.model('LimitedOffer', limitedOfferSchema);

const limitedClaimSchema = new mongoose.Schema({
  userId:    { type: String, required: true, index: true }, // Telegram user id
  productId: { type: String, required: true },
  variantId: { type: String, required: true },
  code:      { type: String, required: true },
  paid:      { type: Boolean, default: false },
  claimedAt: { type: Date, default: Date.now }
});
limitedClaimSchema.index({ userId: 1, variantId: 1 }, { unique: true });
const LimitedClaim = mongoose.model('LimitedClaim', limitedClaimSchema);

const pendingLimitedPaymentSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // seperti pending lain: 1 user 1 pending
  productId: { type: String, required: true },
  productName: { type: String, required: true },           // Nama produk limited
  variantId: { type: String, required: true },
  variantName: { type: String, required: true },           // Nama variant limited
  price: { type: Number, required: true },                 // harga limited yg harus dibayar
  reservedCode: { type: String, required: true },          // 🆕 RESERVED STOCK (1 code)
  qrString: { type: String, required: true },
  qrMessageId: { type: Number },
  paymentGatewayId: { type: String, required: true },      // Atlantic deposit ID
  transactionId: { type: String, required: true },         // ID transaksi unik
  expireAt: { type: Date, required: true, index: { expires: '10m' } }, // auto-expire 5 menit
  createdAt: { type: Date, default: Date.now }
});
const PendingLimitedPayment = mongoose.model('PendingLimitedPayment', pendingLimitedPaymentSchema);

module.exports = { LimitedOffer, LimitedClaim, PendingLimitedPayment };
