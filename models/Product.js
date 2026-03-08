const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: { 
        type: String, 
        required: true,
        enum: ['clothing', 'footwear', 'accessories', 'electronics', 'other']
    },
    description: String,
    stock: { type: Number, default: 0, min: 0 },
    image: String,
    available: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
