const { Client, LocalAuth, Buttons, List } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { Product, Order, Customer } = require('../database');
const { handleMessage } = require('./handlers');
const fs = require('fs');
const path = require('path');

class WhatsAppBot {
    constructor(options = {}) {
        this.client = null;
        this.sessions = new Map();
        this.qrCode = null;
        this.options = options;
    }

    async initialize() {
        try {
            console.log('🤖 Initializing WhatsApp Bot...');
            
            const clientOptions = {
                authStrategy: new LocalAuth({
                    dataPath: this.options.sessionDir || path.join(process.cwd(), '.wwebjs_auth')
                }),
                puppeteer: {
                    headless: true,
                    args: this.options.args || [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--disable-gpu',
                        '--window-size=1920x1080'
                    ],
                    executablePath: process.env.CHROME_PATH || null
                },
                qrMaxRetries: 5,
                restartOnAuthFail: true
            };

            this.client = new Client(clientOptions);

            // QR Code Handler
            this.client.on('qr', (qr) => {
                console.log('📱 New QR Code Generated');
                this.qrCode = qr;
                
                // Generate QR as data URL for web display
                qrcode.toDataURL(qr, (err, url) => {
                    if (!err) {
                        this.qrDataURL = url;
                    }
                });
            });

            // Ready Handler
            this.client.on('ready', () => {
                console.log('✅ WhatsApp Bot is Ready!');
                console.log(`📱 Connected as: ${this.client.info.wid.user}`);
                this.qrCode = null;
                this.setupPresence();
            });

            // Authentication Failure
            this.client.on('auth_failure', (msg) => {
                console.error('❌ Authentication failed:', msg);
            });

            // Disconnected
            this.client.on('disconnected', (reason) => {
                console.log('❌ Bot disconnected:', reason);
                // Try to reconnect after 10 seconds
                setTimeout(() => {
                    console.log('🔄 Attempting to reconnect...');
                    this.initialize();
                }, 10000);
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
            
        } catch (error) {
            console.error('❌ Bot initialization error:', error);
            throw error;
        }
    }

    async processMessage(message) {
        const from = message.from;
        const body = message.body.trim();
        
        // Ignore status messages and groups
        if (from.includes('@g.us') || message.isStatus) return;
        
        // Get or create user session
        if (!this.sessions.has(from)) {
            this.sessions.set(from, { 
                state: 'MENU',
                cart: [],
                tempData: {}
            });
            
            // Register customer
            await this.registerCustomer(from, message.author || message._data?.notifyName || 'Customer');
        }

        const session = this.sessions.get(from);
        
        // Handle message based on session state
        const response = await handleMessage(body, session, from);
        
        if (response.type === 'text') {
            await message.reply(response.content);
        } else if (response.type === 'buttons' && response.buttons) {
            try {
                const buttons = new Buttons(
                    response.content,
                    response.buttons,
                    'Store Bot',
                    'Choose an option'
                );
                await message.reply(buttons);
            } catch (e) {
                await message.reply(response.content);
            }
        } else {
            await message.reply(response.content);
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
            } else {
                // Update last active
                customer.lastActive = new Date();
                await customer.save();
            }
            return customer;
        } catch (error) {
            console.error('Customer Registration Error:', error);
            return null;
        }
    }

    setupPresence() {
        try {
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
        } catch (error) {
            console.error('Presence setup error:', error);
        }
    }

    getQR() {
        return this.qrDataURL || this.qrCode;
    }

    isConnected() {
        return this.client && this.client.info ? true : false;
    }

    getPhoneNumber() {
        return this.client && this.client.info ? this.client.info.wid.user : null;
    }
}

module.exports = WhatsAppBot;
