const { Client, LocalAuth, Buttons, List } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { Product, Order, Customer } = require('../database');
const { handleMessage } = require('./handlers');

class WhatsAppBot {
    constructor() {
        this.client = null;
        this.sessions = new Map(); // Store user sessions
    }

    async initialize() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        // QR Code Generation
        this.client.on('qr', (qr) => {
            console.log('📱 Scan this QR Code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        });

        // Bot Ready
        this.client.on('ready', () => {
            console.log('✅ WhatsApp Bot is Ready!');
            this.setupPresence();
        });

        // Message Handler
        this.client.on('message', async (message) => {
            try {
                await this.processMessage(message);
            } catch (error) {
                console.error('Message Processing Error:', error);
                message.reply('❌ Sorry, an error occurred. Please try again.');
            }
        });

        await this.client.initialize();
    }

    async processMessage(message) {
        const from = message.from;
        const body = message.body.trim();
        
        // Get or create user session
        if (!this.sessions.has(from)) {
            this.sessions.set(from, { 
                state: 'MENU',
                cart: [],
                tempData: {}
            });
            
            // Register/Customer
            await this.registerCustomer(from, message.author || 'Unknown');
        }

        const session = this.sessions.get(from);
        
        // Handle message based on session state
        const response = await handleMessage(body, session, from);
        
        if (response.type === 'text') {
            await message.reply(response.content);
        } else if (response.type === 'buttons') {
            const buttons = new Buttons(
                response.content,
                response.buttons,
                'Store Bot',
                'Choose an option'
            );
            await message.reply(buttons);
        } else if (response.type === 'list') {
            const list = new List(
                response.content,
                'View Options',
                response.sections,
                'Store Menu',
                'footer text'
            );
            await message.reply(list);
        }
    }

    async registerCustomer(phoneNumber, name) {
        try {
            let customer = await Customer.findOne({ phoneNumber });
            if (!customer) {
                customer = new Customer({
                    phoneNumber,
                    name: name,
                    addresses: []
                });
                await customer.save();
                console.log(`📝 New Customer Registered: ${phoneNumber}`);
            }
            return customer;
        } catch (error) {
            console.error('Customer Registration Error:', error);
            return null;
        }
    }

    setupPresence() {
        // Set online presence
        this.client.sendPresenceAvailable();
        
        // Update status every hour
        setInterval(() => {
            const hours = new Date().getHours();
            let status;
            
            if (hours >= 9 && hours <= 22) {
                status = '🟢 Online - Ready to help!';
            } else {
                status = '🌙 Offline - Orders will be processed tomorrow';
            }
            
            this.client.setStatus(status).catch(console.error);
        }, 3600000);
    }

    async broadcastMessage(message, filter = 'all') {
        // Send promotional messages to customers
        const customers = await Customer.find({});
        
        for (const customer of customers) {
            try {
                await this.client.sendMessage(customer.phoneNumber, message);
                // Wait 2 seconds between messages to avoid spam
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error(`Failed to send to ${customer.phoneNumber}:`, error);
            }
        }
    }
}

module.exports = WhatsAppBot;
