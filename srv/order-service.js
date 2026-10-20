const cds = require('@sap/cds');
const {SELECT,UPDATE} = cds.ql;

module.exports = cds.service.impl(function(){

    this.before(['CREATE','UPDATE'], 'OrderItems',(req)=>{
        const { quantity, discountPct } = req.data;
        if(quantity == null || req.data.quantity<1){
            req.error(400, 'Order item quantity must be at least 1.', 'quantity');
        }

        if(discountPct == null && (discountPct < 0 || discountPct > 30.00)){
            req.error(400, 'Discount percentage must be between 0.00% and 30.00%.', 'discountPct')
        }
    });
});