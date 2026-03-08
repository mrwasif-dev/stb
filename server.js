require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB, Product, Order, Customer } = require('./database');
const WhatsAppBot = require('./bot/client');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Security headers for Heroku
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Create session directory if not exists
const sessionDir = path.join(__dirname, '.wwebjs_auth');
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Initialize Bot with Heroku settings
const bot = new WhatsAppBot({
    sessionDir: sessionDir,
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
    ]
});

// Connect to MongoDB Atlas
connectDB().then(() => {
    console.log('✅ MongoDB Atlas Connected');
    
    // Initialize bot after DB connection
    bot.initialize().catch(err => {
        console.error('Bot initialization error:', err);
    });
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// API Routes
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find({ available: true }).sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

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

app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }).limit(50);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        await order.updateStatus(req.body.status, req.body.note);
        
        // Notify customer if bot is connected
        if (bot && bot.client && bot.client.info) {
            const customer = await Customer.findOne({ phoneNumber: order.customerNumber });
            if (customer) {
                const statusMsg = `📦 Your order #${order.orderId} is now ${req.body.status}`;
                if (req.body.note) statusMsg += `\nNote: ${req.body.note}`;
                bot.client.sendMessage(customer.phoneNumber, statusMsg).catch(console.error);
            }
        }
        
        res.json(order);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const customers = await Customer.countDocuments();
        const products = await Product.countDocuments();
        const orders = await Order.countDocuments();
        const pendingOrders = await Order.countDocuments({ status: 'pending' });
        
        res.json({ customers, products, orders, pendingOrders });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/bot-status', (req, res) => {
    res.json({ 
        connected: bot && bot.client && bot.client.info ? true : false,
        phone: bot.client && bot.client.info ? bot.client.info.wid.user : null
    });
});

app.post('/api/refresh-qr', (req, res) => {
    if (bot) {
        bot.initialize().catch(console.error);
        res.json({ message: 'QR refreshed' });
    } else {
        res.status(500).json({ error: 'Bot not initialized' });
    }
});

// Serve admin panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Health check for Heroku
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        bot: bot && bot.client && bot.client.info ? 'connected' : 'disconnected'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    🚀 WhatsApp Store Bot Deployed on Heroku!
    ==========================================
    📱 Port: ${PORT}
    🔗 URL: https://your-app-name.herokuapp.com
    📊 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}
    🤖 Bot Status: ${bot && bot.client && bot.client.info ? '✅ Running' : '⏳ Initializing'}
    
    Admin Panel: https://your-app-name.herokuapp.com
    Username: ${process.env.ADMIN_USERNAME}
    Password: ${process.env.ADMIN_PASSWORD}
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        if (bot && bot.client) {
            bot.client.destroy().then(() => {
                console.log('Bot client destroyed');
                mongoose.connection.close(false, () => {
                    console.log('MongoDB connection closed');
                    process.exit(0);
                });
            });
        } else {
            mongoose.connection.close(false, () => {
                console.log('MongoDB connection closed');
                process.exit(0);
            });
        }
    });
});
