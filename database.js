const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
};

// Product Schema
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, required: true, enum: ['clothing', 'footwear', 'accessories', 'electronics', 'other'] },
    description: String,
    stock: { type: Number, default: 0, min: 0 },
    image: String,
    available: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// Order Schema
const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    customerName: String,
    customerNumber: { type: String, required: true, index: true },
    customerAddress: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        zipCode: String,
        phone: String
    },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        price: Number,
        quantity: { type: Number, min: 1 }
    }],
    totalAmount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending',
        index: true
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
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now }
});

// Customer Schema
const customerSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true, index: true },
    name: String,
    addresses: [{
        type: { type: String, enum: ['home', 'office', 'other'], default: 'home' },
        street: String,
        city: String,
        zipCode: String,
        isDefault: { type: Boolean, default: false }
    }],
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
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

// Indexes for better performance
productSchema.index({ category: 1, available: 1 });
orderSchema.index({ customerNumber: 1, createdAt: -1 });
customerSchema.index({ phoneNumber: 1 });

const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Customer = mongoose.model('Customer', customerSchema);

module.exports = { connectDB, Product, Order, Customer };
