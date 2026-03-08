const { Product, Order, Customer } = require('../database');

// Main Menu
const mainMenu = {
    type: 'buttons',
    content: '🏪 *Welcome to Our Store!*\n\nPlease select an option:',
    buttons: [
        { body: '🛍️ Products' },
        { body: '🛒 My Cart' },
        { body: '📦 My Orders' },
        { body: '👤 Profile' },
        { body: '📍 Address' },
        { body: 'ℹ️ Help' }
    ]
};

// Handle all messages
async function handleMessage(body, session, from) {
    // Check for button responses
    if (body === '🛍️ Products') return await showProducts(session);
    if (body === '🛒 My Cart') return showCart(session);
    if (body === '📦 My Orders') return await showOrders(from);
    if (body === '👤 Profile') return await showProfile(from);
    if (body === '📍 Address') return await manageAddress(from, session);
    if (body === 'ℹ️ Help') return showHelp();
    
    // Handle specific flows
    switch(session.state) {
        case 'VIEWING_PRODUCTS':
            return await handleProductSelection(body, session);
        case 'ADDING_TO_CART':
            return await handleAddToCart(body, session);
        case 'CHECKOUT':
            return await handleCheckout(body, session, from);
        case 'ADDRESS':
            return await handleAddressInput(body, session, from);
        case 'TRACK_ORDER':
            return await handleTrackOrder(body, from);
        default:
            return mainMenu;
    }
}

// Show Products
async function showProducts(session) {
    try {
        const products = await Product.find({ available: true }).limit(10);
        
        if (products.length === 0) {
            return {
                type: 'text',
                content: '😔 No products available at the moment.'
            };
        }

        let message = '🛍️ *Our Products:*\n\n';
        
        products.forEach((p, index) => {
            message += `${index + 1}. *${p.name}*\n`;
            message += `   💰 Rs. ${p.price}\n`;
            message += `   📦 Stock: ${p.stock}\n\n`;
        });
        
        message += 'Reply with product number to view details\nOr type "back" for main menu';
        
        session.state = 'VIEWING_PRODUCTS';
        session.tempData.products = products;
        
        return { type: 'text', content: message };
    } catch (error) {
        console.error('Show products error:', error);
        return { type: 'text', content: '❌ Error loading products. Please try again.' };
    }
}

// Show Cart
function showCart(session) {
    if (!session.cart || session.cart.length === 0) {
        return {
            type: 'buttons',
            content: '🛒 Your cart is empty!',
            buttons: [
                { body: '🛍️ Continue Shopping' },
                { body: '🏠 Main Menu' }
            ]
        };
    }

    let total = 0;
    let message = '🛒 *Your Cart:*\n\n';
    
    session.cart.forEach((item, index) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        message += `${index + 1}. ${item.name}\n`;
        message += `   Quantity: ${item.quantity} x Rs. ${item.price}\n`;
        message += `   Subtotal: Rs. ${subtotal}\n\n`;
    });
    
    message += `💰 *Total: Rs. ${total}*\n\n`;
    message += 'Options:\n';
    message += '1️⃣ Checkout\n';
    message += '2️⃣ Clear Cart\n';
    message += '3️⃣ Continue Shopping';
    
    session.state = 'CHECKOUT';
    
    return { type: 'text', content: message };
}

// Show Orders
async function showOrders(from) {
    try {
        const customer = await Customer.findOne({ phoneNumber: from }).populate('orders');
        
        if (!customer || !customer.orders || customer.orders.length === 0) {
            return {
                type: 'buttons',
                content: '📦 You have no orders yet!',
                buttons: [
                    { body: '🛍️ Start Shopping' },
                    { body: '🏠 Main Menu' }
                ]
            };
        }

        let message = '📦 *Your Orders:*\n\n';
        
        customer.orders.slice(0, 5).forEach((order, index) => {
            const emoji = getStatusEmoji(order.status);
            message += `${index + 1}. *Order #${order.orderId}*\n`;
            message += `   ${emoji} Status: ${order.status}\n`;
            message += `   💰 Total: Rs. ${order.totalAmount}\n`;
            message += `   📅 Date: ${new Date(order.createdAt).toLocaleDateString()}\n\n`;
        });
        
        message += 'Reply with order ID to track (e.g., ORD23120001)\n';
        message += 'Or type "back" for main menu';
        
        return { type: 'text', content: message };
    } catch (error) {
        console.error('Show orders error:', error);
        return { type: 'text', content: '❌ Error loading orders.' };
    }
}

// Show Profile
async function showProfile(from) {
    try {
        const customer = await Customer.findOne({ phoneNumber: from });
        
        if (!customer) {
            return mainMenu;
        }

        const ordersCount = customer.orders ? customer.orders.length : 0;
        const addressesCount = customer.addresses ? customer.addresses.length : 0;
        
        let message = '👤 *Your Profile*\n\n';
        message += `📱 Phone: ${customer.phoneNumber}\n`;
        message += `📦 Total Orders: ${ordersCount}\n`;
        message += `📍 Addresses: ${addressesCount}\n`;
        message += `🕐 Last Active: ${new Date(customer.lastActive).toLocaleDateString()}\n\n`;
        
        message += 'Options:\n';
        message += '1️⃣ Manage Addresses\n';
        message += '2️⃣ My Orders\n';
        message += '3️⃣ Back to Menu';
        
        return { type: 'text', content: message };
    } catch (error) {
        console.error('Show profile error:', error);
        return mainMenu;
    }
}

// Manage Address
async function manageAddress(from, session) {
    try {
        const customer = await Customer.findOne({ phoneNumber: from });
        
        if (!customer || !customer.addresses || customer.addresses.length === 0) {
            session.state = 'ADDRESS';
            session.tempData.addressStep = 'new';
            
            return {
                type: 'text',
                content: '📍 *Add New Address*\n\nPlease send your address in this format:\n\n`Street, City, ZIP Code`\n\nExample: Main Street, Karachi, 75500'
            };
        }

        let message = '📍 *Your Addresses:*\n\n';
        
        customer.addresses.forEach((addr, index) => {
            message += `${index + 1}. ${addr.type.toUpperCase()}\n`;
            message += `   ${addr.street}\n`;
            message += `   ${addr.city} - ${addr.zipCode || 'N/A'}\n`;
            if (addr.isDefault) message += '   ✅ Default\n';
            message += '\n';
        });
        
        message += 'Options:\n';
        message += '1️⃣ Add New Address\n';
        message += '2️⃣ Set Default Address\n';
        message += '3️⃣ Back to Menu';
        
        session.state = 'ADDRESS';
        session.tempData.addressStep = 'menu';
        
        return { type: 'text', content: message };
    } catch (error) {
        console.error('Manage address error:', error);
        return mainMenu;
    }
}

// Handle Product Selection
async function handleProductSelection(body, session) {
    if (body.toLowerCase() === 'back') {
        session.state = 'MENU';
        return mainMenu;
    }
    
    const index = parseInt(body) - 1;
    const products = session.tempData.products;
    
    if (index >= 0 && index < products.length) {
        const product = products[index];
        session.tempData.selectedProduct = product;
        session.state = 'ADDING_TO_CART';
        
        let message = `📦 *${product.name}*\n\n`;
        message += `💰 Price: Rs. ${product.price}\n`;
        message += `📦 Stock: ${product.stock}\n`;
        message += `📝 Description: ${product.description || 'No description'}\n\n`;
        message += 'How many would you like to buy?\n';
        message += '(Reply with number or "back" to products)';
        
        return { type: 'text', content: message };
    }
    
    return {
        type: 'text',
        content: '❌ Invalid option. Please try again.'
    };
}

// Handle Add to Cart
async function handleAddToCart(body, session) {
    if (body.toLowerCase() === 'back') {
        session.state = 'VIEWING_PRODUCTS';
        return await showProducts(session);
    }
    
    const quantity = parseInt(body);
    const product = session.tempData.selectedProduct;
    
    if (!isNaN(quantity) && quantity > 0 && quantity <= product.stock) {
        // Add to cart
        session.cart.push({
            productId: product._id,
            name: product.name,
            price: product.price,
            quantity: quantity
        });
        
        session.state = 'VIEWING_PRODUCTS';
        
        return {
            type: 'buttons',
            content: `✅ Added ${quantity} x ${product.name} to cart!`,
            buttons: [
                { body: '🛍️ More Products' },
                { body: '🛒 View Cart' },
                { body: '🏠 Main Menu' }
            ]
        };
    }
    
    return {
        type: 'text',
        content: '❌ Invalid quantity. Please enter a valid number.'
    };
}

// Handle Checkout
async function handleCheckout(body, session, from) {
    if (body === '1' || body.toLowerCase() === 'checkout') {
        // Check if customer has address
        const customer = await Customer.findOne({ phoneNumber: from });
        
        if (!customer || !customer.addresses || customer.addresses.length === 0) {
            session.state = 'ADDRESS';
            session.tempData.checkoutMode = true;
            
            return {
                type: 'text',
                content: '📍 Please add your delivery address first.\n\nSend address in format:\n`Street, City, ZIP Code`'
            };
        }
        
        // Find default address or use first
        const defaultAddress = customer.addresses.find(a => a.isDefault) || customer.addresses[0];
        
        // Proceed to order
        return await processOrder(session, from, defaultAddress);
    }
    
    if (body === '2') {
        session.cart = [];
        session.state = 'MENU';
        return {
            type: 'text',
            content: '🛒 Cart cleared!'
        };
    }
    
    if (body === '3') {
        session.state = 'VIEWING_PRODUCTS';
        return await showProducts(session);
    }
    
    return {
        type: 'text',
        content: '❌ Invalid option. Please choose 1, 2, or 3.'
    };
}

// Handle Address Input
async function handleAddressInput(body, session, from) {
    if (body.toLowerCase() === 'back') {
        session.state = 'MENU';
        return mainMenu;
    }
    
    // Parse address
    const parts = body.split(',').map(p => p.trim());
    
    if (parts.length >= 2) {
        const address = {
            type: 'home',
            street: parts[0],
            city: parts[1],
            zipCode: parts[2] || '',
            isDefault: true
        };
        
        // Save to database
        await Customer.findOneAndUpdate(
            { phoneNumber: from },
            { 
                $push: { addresses: address },
                $set: { lastActive: new Date() }
            },
            { upsert: true }
        );
        
        if (session.tempData.checkoutMode) {
            // Continue with checkout
            delete session.tempData.checkoutMode;
            return await processOrder(session, from, address);
        }
        
        session.state = 'MENU';
        return {
            type: 'buttons',
            content: '✅ Address saved successfully!',
            buttons: [
                { body: '🛍️ Shop Now' },
                { body: '🏠 Main Menu' }
            ]
        };
    }
    
    return {
        type: 'text',
        content: '❌ Invalid format. Please use:\n`Street, City, ZIP Code`\n\nExample: Main Street, Karachi, 75500'
    };
}

// Handle Track Order
async function handleTrackOrder(body, from) {
    try {
        const order = await Order.findOne({ orderId: body.toUpperCase() });
        
        if (!order || order.customerNumber !== from) {
            return {
                type: 'text',
                content: '❌ Order not found. Please check your order ID.'
            };
        }

        let message = `📦 *Order #${order.orderId}*\n\n`;
        message += `📊 Status: ${getStatusEmoji(order.status)} ${order.status}\n`;
        message += `💰 Total: Rs. ${order.totalAmount}\n`;
        message += `💳 Payment: ${order.paymentStatus}\n\n`;
        
        message += '*📋 Tracking History:*\n';
        if (order.trackingHistory && order.trackingHistory.length > 0) {
            order.trackingHistory.forEach(entry => {
                message += `${getStatusEmoji(entry.status)} ${entry.status} - ${new Date(entry.date).toLocaleString()}\n`;
                if (entry.note) message += `   Note: ${entry.note}\n`;
            });
        } else {
            message += 'No tracking history yet.\n';
        }
        
        message += '\nReply "back" for main menu';
        
        session.state = 'MENU';
        return { type: 'text', content: message };
    } catch (error) {
        console.error('Track order error:', error);
        return { type: 'text', content: '❌ Error tracking order.' };
    }
}

// Process Order
async function processOrder(session, from, address) {
    try {
        // Calculate total
        let total = 0;
        session.cart.forEach(item => {
            total += item.price * item.quantity;
        });

        // Create order
        const order = new Order({
            customerNumber: from,
            customerAddress: {
                street: address.street,
                city: address.city,
                zipCode: address.zipCode || ''
            },
            items: session.cart,
            totalAmount: total,
            paymentMethod: 'cash',
            trackingHistory: [{
                status: 'pending',
                note: 'Order received'
            }]
        });

        await order.save();

        // Update customer's orders
        await Customer.findOneAndUpdate(
            { phoneNumber: from },
            { 
                $push: { orders: order._id },
                $set: { lastActive: new Date() }
            },
            { upsert: true }
        );

        // Clear cart
        session.cart = [];
        session.state = 'MENU';

        let message = '✅ *Order Placed Successfully!*\n\n';
        message += `📦 Order ID: *${order.orderId}*\n`;
        message += `💰 Total: Rs. ${total}\n`;
        message += `📍 Delivery Address:\n`;
        message += `${address.street}\n`;
        message += `${address.city}${address.zipCode ? ' - ' + address.zipCode : ''}\n\n`;
        message += 'You can track your order using the Order ID.\n';
        message += 'We will notify you when order is confirmed.';

        return {
            type: 'buttons',
            content: message,
            buttons: [
                { body: '📦 Track Order' },
                { body: '🛍️ Shop More' },
                { body: '🏠 Main Menu' }
            ]
        };
    } catch (error) {
        console.error('Process order error:', error);
        return { type: 'text', content: '❌ Error processing order. Please try again.' };
    }
}

// Show Help
function showHelp() {
    let message = 'ℹ️ *Help Center*\n\n';
    message += '*Available Commands:*\n';
    message += '🛍️ Products - Browse our products\n';
    message += '🛒 My Cart - View your cart\n';
    message += '📦 My Orders - Check order status\n';
    message += '👤 Profile - View your profile\n';
    message += '📍 Address - Manage addresses\n\n';
    
    message += '*How to Order:*\n';
    message += '1. Browse products\n';
    message += '2. Add items to cart\n';
    message += '3. Checkout with address\n';
    message += '4. Track order with ID\n\n';
    
    message += '*Support:*\n';
    message += '⏰ Hours: 9 AM - 10 PM\n';
    message += 'Reply "back" to return to main menu';
    
    return { type: 'text', content: message };
}

// Helper function for status emojis
function getStatusEmoji(status) {
    const emojis = {
        'pending': '⏳',
        'confirmed': '✅',
        'processing': '🔄',
        'shipped': '🚚',
        'delivered': '📦',
        'cancelled': '❌'
    };
    return emojis[status] || '📋';
}

module.exports = { handleMessage, mainMenu };
