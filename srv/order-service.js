const cds = require('@sap/cds');
const {SELECT,UPDATE} = cds.ql;

module.exports = cds.service.impl(function(){

    this.before(['CREATE','UPDATE'], 'OrderItems',(req)=>{
        const { quantity, discountPct } = req.data;
        if(quantity != null || req.data.quantity<1){
            req.error(400, 'Order item quantity must be at least 1.', 'quantity');
        }

        if(discountPct != null && (discountPct < 0 || discountPct > 30.00)){
            req.error(400, 'Discount percentage must be between 0.00% and 30.00%.', 'discountPct')
        }
    });

    this.before(['CREATE','UPDATE'], 'SalesOrders',async(req)=>{
        console.log('Sales order data:', JSON.stringify(req.data, null, 2));
        const CustomerID = req.data.customer_ID || req.data.customer?.ID || req.data.customer;

        if(!CustomerID){
            req.error(400,'A Customer is required for the Sales Orders');
            return
        }
        const Customer = await cds.tx(req).run(SELECT.one.from('sales.Customers').where({ ID:CustomerID })
    );
        if(!Customer){
            req.error(400,'Customer Not Found');
            return
        }
        if(Customer.active === false ){
            req.error(400, 'Cannot create an Order from an inactive Customer');
            return
        }

        if(req.event === 'CREATE'){
            const creditLimit = Number(Customer.creditLimit) || 0;

            let newOrderTotal = 0;
            if(Array.isArray(req.data.Items) && req.data.Items.length > 0){
                for (const item of req.data.Items) {
                    const qty = Number(item.quantity) || 1;
                    const price = Number(item.unitPrice) || 0;
                    const discount = Number(item.discountPct) || 0;
                    newOrderTotal += qty * price * (1 - discount / 100);
                }
            }

            const openOrders = await cds.tx(req).run(
                SELECT.from('sales.SalesOrders')
                .columns('ID')
                .where({
                    customer_ID: CustomerID, status: { '!=': 'CANCELLED'}
                })
            );

            let existingOpenTotal = 0;
            if( openOrders.length > 0) {
                const orderIDs = openOrders.map(o => o.ID);
                const openItems = await cds .tx(req).run(
                    SELECT.from('sales.OrderItems')
                    .columns('quantity', 'unitPrice', 'discountPct')
                    .where({
                        order_ID: orderIDs
                    })
                );

                for( const item of openItems) {
                    const qty = Number(item.quantity) || 0;
                    const price = Number(item.unitPrice) || 0;
                    const discount = Number(item.discountPct) || 0;
                    existingOpenTotal += qty * price *(1-discount/100);
                }
            }

            const totalCommitted = existingOpenTotal+newOrderTotal;
            if(totalCommitted>creditLimit){
                req.error(
                    400,
                    `Customer credit limit exceeded. Total open exposure (${totalCommitted.toFixed(2)}) exceeds credit limit
  (${creditLimit.toFixed(2)}).`
                );
            }
        }
    })
});