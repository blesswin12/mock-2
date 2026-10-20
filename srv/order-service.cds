using sales as db from '../db/schema';

@path: '/odata/v4/sales'
service OrderService {
    
    // @readonly
    entity Customers as projection on db.Customers;
    entity Products as projection on db.Products;
    entity SalesOrders as projection on db.SalesOrders;
    entity OrderItems as projection on db.OrderItems;
}
