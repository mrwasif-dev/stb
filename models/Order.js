const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    customerName: String,
    customerNumber: { type: String, required: true },
    customerAddress: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        zipCode: String
    },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        price: Number,
        quantity: Number
    }],
    totalAmount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'card', 'bank_transfer'],
        default: 'cash'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed'],
        default: 'pending'
    },
    trackingHistory: [{
        status: String,
        date: { type: Date, default: Date.now },
        note: String
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Generate Order ID
orderSchema.pre('save', async function(next) {
    if (!this.orderId) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const count = await this.constructor.countDocuments();
        this.orderId = `ORD${year}${month}${(count + 1).toString().padStart(4, '0')}`;
    }
    next();
});

// Update tracking history
orderSchema.methods.updateStatus = function(newStatus, note = '') {
    this.status = newStatus;
    this.trackingHistory.push({ status: newStatus, note, date: new Date() });
    this.updatedAt = new Date();
    return this.save();
};

module.exports = mongoose.model('Order', orderSchema);
