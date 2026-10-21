const cds = require('@sap/cds');
const { SELECT, UPDATE } = cds.ql;

module.exports = cds.service.impl(function () {

    this.before(['CREATE', 'UPDATE'], 'OrderItems', async (req) => {
        const { quantity, discountPct } = req.data;
        const product_ID = req.data.product_ID || req.data.product?.ID || req.data.product;
        if (quantity == null || quantity < 1) {
            req.error(400, 'Order item quantity must be at least 1.', 'quantity');
        }

        if (discountPct != null && (discountPct < 0 || discountPct > 30.00)) {
            req.error(400, 'Discount percentage must be between 0.00% and 30.00%.', 'discountPct')
        }

        if (product_ID && quantity != null) {
            const product = await cds.tx(req).run(
                SELECT.one.from('sales.Products')
                    .columns('ID', 'name', 'availableStock')
                    .where({ ID: product_ID })
            )
            if (!product) {
                return req.error(400, 'Product Not Found.', 'product_ID');
            }

            if (Number(quantity) > Number(product.availableStock)) {
                return req.error(
                    400,
                    `Insufficient stock for ${product.name}. ` +
                    `Available: ${product.availableStock}, requested: ${quantity}.`,
                    'quantity'
                );
            }
        }
    });

    this.before(['CREATE', 'UPDATE'], 'SalesOrders', async (req) => {
        console.log('Sales order data:', JSON.stringify(req.data, null, 2));
        const CustomerID = req.data.customer_ID || req.data.customer?.ID || req.data.customer;

        if (req.event === 'CREATE' && !CustomerID) {
            return req.error(400, 'A Customer is required for the Sales Orders');
        }

        // If CustomerID is present (CREATE or customer update), validate it
        let Customer;
        if (CustomerID) {
            Customer = await cds.tx(req).run(
                SELECT.one.from('sales.Customers').where({
                    ID: CustomerID
                })
            );
            if (!Customer) {
                return req.error(400, 'Customer Not Found');
            }
            if (Customer.active === false) {
                return req.error(400, 'Cannot create an Order from an inactive Customer');
            }
        }

        if (req.event === 'CREATE') {
            const creditLimit = Number(Customer.creditLimit) || 0;

            let newOrderTotal = 0;
            if (Array.isArray(req.data.Items) && req.data.Items.length > 0) {
                for (const item of req.data.Items) {
                    const qty = Number(item.quantity) || 1;
                    const price = Number(item.unitPrice) || 0;
                    const discount = Number(item.discountPct) || 0;
                    newOrderTotal += qty * price * (1 - discount / 100);

                    const product_ID = item.product_ID || item.product?.ID || item.product;
                    if (product_ID) {
                        const product = await cds.tx(req).run(
                            SELECT.one.from('sales.Products')
                                .columns('ID', 'name', 'availableStock')
                                .where({ ID: product_ID })
                        );
                        if (!product) {
                            return req.error(400, 'Product Not Found.', 'product_ID');
                        }
                        if (qty > Number(product.availableStock)) {
                            return req.error(
                                400,
                                `Insufficient stock for ${product.name}. Available: ${product.availableStock}, requested: ${qty}.`,
                                'quantity'
                            );
                        }
                    }
                }
            }

            const openOrders = await cds.tx(req).run(
                SELECT.from('sales.SalesOrders')
                    .columns('ID')
                    .where({
                        customer_ID: CustomerID, status: { '!=': 'CANCELLED' }
                    })
            );

            let existingOpenTotal = 0;
            if (openOrders.length > 0) {
                const orderIDs = openOrders.map(o => o.ID);
                const openItems = await cds.tx(req).run(
                    SELECT.from('sales.OrderItems')
                        .columns('quantity', 'unitPrice', 'discountPct')
                        .where({
                            order_ID: orderIDs
                        })
                );

                for (const item of openItems) {
                    const qty = Number(item.quantity) || 0;
                    const price = Number(item.unitPrice) || 0;
                    const discount = Number(item.discountPct) || 0;
                    existingOpenTotal += qty * price * (1 - discount / 100);
                }
            }

            const totalCommitted = existingOpenTotal + newOrderTotal;
            if (totalCommitted > creditLimit) {
                req.error(
                    400,
                    `Customer credit limit exceeded. Total open exposure (${totalCommitted.toFixed(2)}) exceeds credit limit
  (${creditLimit.toFixed(2)}).`
                );
            }
        }
    })

    this.after('READ', 'SalesOrders', async (orders, req) => {
        if (!orders) return;

        // CAP READ can return one order or an array of orders
        const orderList = Array.isArray(orders) ? orders : [orders];

        if (orderList.length === 0) return;

        const orderIDs = orderList.map(order => order?.ID).filter(Boolean);
        if (orderIDs.length === 0) return;

        // Fetch items for all returned orders
        const items = await cds.tx(req).run(
            SELECT.from('sales.OrderItems')
                .columns('ID', 'order_ID', 'quantity', 'unitPrice', 'discountPct')
                .where({ order_ID: { in: orderIDs } })
        );

        // Group items by their order ID
        const itemsByOrder = new Map();

        for (const item of items) {
            const orderID = item.order_ID;

            if (!itemsByOrder.has(orderID)) {
                itemsByOrder.set(orderID, []);
            }

            itemsByOrder.get(orderID).push(item);
        }

        // Calculate line totals and order amounts
        for (const order of orderList) {
            const orderItems = itemsByOrder.get(order.ID) || [];
            let netAmount = 0;

            for (const item of orderItems) {
                const quantity = Number(item.quantity ?? 0);
                const unitPrice = Number(item.unitPrice ?? 0);
                const discountPct = Number(item.discountPct ?? 0);

                const itemTotal =
                    quantity * unitPrice * (1 - discountPct / 100);

                netAmount += itemTotal;

                // Add itemTotal to the expanded Items response, if present
                if (Array.isArray(order.Items)) {
                    const expandedItem = order.Items.find(
                        expanded => expanded.ID === item.ID
                    );

                    if (expandedItem) {
                        expandedItem.itemTotal = Number(itemTotal.toFixed(2));
                    }
                }
            }

            netAmount = Number(netAmount.toFixed(2));

            const taxAmount = Number((netAmount * 0.10).toFixed(2));
            const totalAmount = Number((netAmount + taxAmount).toFixed(2));

            order.netAmount = netAmount;
            order.taxAmount = taxAmount;
            order.totalAmount = totalAmount;
        }
    });
    this.after('READ', 'OrderItems', (items) => {
        const itemList = Array.isArray(items) ? items : [items];
        for (const item of itemList) {
            if (!item) continue;
            const qty = Number(item.quantity ?? 0);
            const price = Number(item.unitPrice ?? 0);
            const disc = Number(item.discountPct ?? 0);
            item.itemTotal = Number((qty * price * (1 - disc / 100)).toFixed(2));
        }
    });

    // -------------------------------------------------------------
    // ON Handlers: Custom Operations (Action & Function)
    // -------------------------------------------------------------

    // 1. Action: confirmSalesOrder
    this.on('confirmSalesOrder', async (req) => {

        if (!req.user.is('SalesManager')) {
            return req.reject(403, 'Forbidden: Only authorized SalesManager users can confirm orders.')
        }
        const { orderID } = req.data;
        if (!orderID) return req.error(400, 'Order ID is required.');

        const order = await cds.tx(req).run(
            SELECT.one.from('sales.SalesOrders').where({ ID: orderID })
        );

        if (!order) return req.error(404, 'Order not found.');

        if (order.status !== 'DRAFT') {
            return req.error(400, `Cannot confirm order in status '${order.status}'. Only DRAFT orders can be confirmed.`);
        }

        const items = await cds.tx(req).run(
            SELECT.from('sales.OrderItems').where({ order_ID: orderID })
        );

        if (!items || items.length === 0) {
            return req.error(400, 'Cannot confirm an order containing zero line items.');
        }

        // Verify and deduct stock atomically
        for (const item of items) {
            const product = await cds.tx(req).run(
                SELECT.one.from('sales.Products').where({ ID: item.product_ID })
            );

            if (!product) {
                return req.error(400, `Product not found for order item.`);
            }

            if (Number(product.availableStock) < Number(item.quantity)) {
                return req.error(
                    400,
                    `Insufficient stock for product '${product.name}'. Available: ${product.availableStock}, requested: ${item.quantity}.`
                );
            }

            await cds.tx(req).run(
                UPDATE('sales.Products')
                    .set({ availableStock: { '-=': item.quantity } })
                    .where({ ID: item.product_ID })
            );
        }

        await cds.tx(req).run(
            UPDATE('sales.SalesOrders')
                .set({ status: 'CONFIRMED' })
                .where({ ID: orderID })
        );

        return {
            success: true,
            orderNumber: order.orderNumber,
            status: 'CONFIRMED',
            message: `Order ${order.orderNumber} confirmed successfully.`
        };
    });

    // 2. Function: calculateCustomerDiscount
    this.on('calculateCustomerDiscount', async (req) => {
        const { customerID, orderAmount } = req.data;

        if (!customerID) {
            return req.error(400, 'Customer ID is required.');
        }

        const amount = Number(orderAmount);
        if (orderAmount == null || isNaN(amount) || amount < 0) {
            return req.error(400, 'A valid non-negative orderAmount is required.');
        }

        const customer = await cds.tx(req).run(
            SELECT.one.from('sales.Customers').where({ ID: customerID })
        );

        if (!customer) {
            return req.error(404, 'Customer not found.');
        }

        let discountRate;
        const tier = (customer.loyaltyTier || 'SILVER').toUpperCase();
        if (tier === 'PLATINUM') {
            discountRate = 15.00;
        } else if (tier === 'GOLD') {
            discountRate = 10.00;
        } else {
            discountRate = 5.00;
        }

        const discountSavings = Number((amount * (discountRate / 100)).toFixed(2));
        const finalAmount = Number((amount - discountSavings).toFixed(2));

        return {
            loyaltyTier: tier,
            discountRate,
            discountSavings,
            finalAmount
        };
    });
});