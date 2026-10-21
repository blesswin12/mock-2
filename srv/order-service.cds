using sales as db from '../db/schema';

@path: '/odata/v4/sales'
@requires: 'authenticated-user'
service OrderService {
    @readonly
    entity Customers as projection on db.Customers;
    entity Products as projection on db.Products;

    @restrict: [
        { grant: ['READ','CREATE'], to: 'SalesRepresentative' },
        { grant: '*', to: 'SalesManager'}
    ]
    entity SalesOrders as projection on db.SalesOrders;

    @restrict: [
        { grant: ['READ','CREATE'], to: 'SalesRepresentative' },
        { grant: '*', to: 'SalesManager'}
    ]
    entity OrderItems as projection on db.OrderItems;

    @requires: 'SalesManager'
    action confirmSalesOrder(orderID : UUID) returns {
        success     : Boolean;
        orderNumber : String;
        status      : String;
        message     : String;
    };

    function calculateCustomerDiscount(customerID : UUID, orderAmount : Decimal(10,2)) returns {
        loyaltyTier     : String;
        discountRate    : Decimal(5,2);
        discountSavings : Decimal(10,2);
        finalAmount     : Decimal(10,2);
    };
}
