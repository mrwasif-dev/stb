require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB, Product, Order, Customer } = require('./database');
const WhatsAppBot = require('./bot/client');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize Bot
const bot = new WhatsAppBot();
bot.initialize();

// Connect to MongoDB
connectDB();

// API Routes

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add product
app.post('/api/products', async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all orders
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }).limit(50);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update order status
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        await order.updateStatus(req.body.status, req.body.note);
        
        // Notify customer via WhatsApp
        const customer = await Customer.findOne({ phoneNumber: order.customerNumber });
        if (customer && bot.client) {
            const statusMsg = `📦 Your order #${order.orderId} is now ${req.body.status}`;
            if (req.body.note) {
                statusMsg += `\nNote: ${req.body.note}`;
            }
            bot.client.sendMessage(customer.phoneNumber, statusMsg).catch(console.error);
        }
        
        res.json(order);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get stats
app.get('/api/stats', async (req, res) => {
    try {
        const customers = await Customer.countDocuments();
        res.json({ customers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get QR code
app.get('/api/qr', (req, res) => {
    // This would need to be implemented with proper QR storage
    res.json({ qr: 'QR_CODE_DATA' });
});

// Bot status
app.get('/api/bot-status', (req, res) => {
    res.json({ 
        connected: bot.client && bot.client.info ? true : false 
    });
});

// Refresh QR
app.post('/api/refresh-qr', (req, res) => {
    // Reinitialize bot
    bot.initialize();
    res.json({ message: 'QR refreshed' });
});

// Broadcast message
app.post('/api/broadcast', async (req, res) => {
    try {
        const { message, target } = req.body;
        
        let query = {};
        if (target === 'active') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            query.lastActive = { $gte: weekAgo };
        } else if (target === 'new') {
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            query.createdAt = { $gte: monthAgo };
        }
        
        const customers = await Customer.find(query);
        
        // Send messages (limit to 50 per minute to avoid spam)
        let sent = 0;
        for (const customer of customers) {
            if (bot.client) {
                await bot.client.sendMessage(customer.phoneNumber, message);
                sent++;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        res.json({ message: `Broadcast sent to ${sent} customers` });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Serve admin panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    🚀 Server is running on http://localhost:${PORT}
    
    📱 WhatsApp Bot Features:
    ✅ Product Catalog
    ✅ Shopping Cart
    ✅ Order Management
    ✅ Address Management
    ✅ Order Tracking
    ✅ Customer Profiles
    ✅ Admin Panel
    
    🔗 Access Admin Panel: http://localhost:${PORT}
    `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    if (bot.client) {
        await bot.client.destroy();
    }
    await mongoose.connection.close();
    process.exit();
});
