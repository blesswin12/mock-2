namespace sales;

using { cuid, managed } from '@sap/cds/common';

// -------------------------------------------------------------------
// Custom Enum Types
// -------------------------------------------------------------------

type OrderStatus : String enum {
    DRAFT;
    CONFIRMED;
    IN_DELIVERY;
    DELIVERED;
    CANCELLED;
}

type Priority : String enum {
    LOW;
    MEDIUM;
    HIGH;
    URGENT;
}

type LoyaltyTier : String enum {
    SILVER;
    GOLD;
    PLATINUM;
}

// -------------------------------------------------------------------
// Entities
// -------------------------------------------------------------------

entity Customers : cuid, managed {
    @mandatory
    customerNumber   : String(20) not null;

    @mandatory
    name             : String(100) not null;

    @mandatory
    @assert.format: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    email            : String(150);

    @assert.range: [0, 999999999999.99]
    creditLimit      : Decimal(12,2) default 0;

    loyaltyTier      : LoyaltyTier default #SILVER;

    active           : Boolean default true;

    orders           : Association to many SalesOrders on orders.customer = $self;
}

entity Products : cuid, managed {
    @mandatory
    productCode      : String(30) not null;

    @mandatory
    name             : String(100) not null;

    description      : String(500);

    @mandatory
    category         : String(50) not null;

    @mandatory
    @assert.range: [0, 999999999999.99]
    unitPrice        : Decimal(10,2) not null;

    @assert.range: [0, 2147483647]
    availableStock   : Integer default 0;
}

entity SalesOrders : cuid, managed {
    @mandatory
    orderNumber      : String(30) not null;

    orderDate        : Date default $now;

    deliveryDate     : Date;

    status           : OrderStatus default #DRAFT;

    priority         : Priority default #MEDIUM;

    @mandatory
    customer         : Association to Customers not null;

    @mandatory
    shippingAddress  : String(500) not null;

    Items            : Composition of many OrderItems on Items.order = $self;

    // Virtual non-persisted fields computed dynamically in after-read handlers
    virtual netAmount   : Decimal(12,2);
    virtual taxAmount   : Decimal(12,2);
    virtual totalAmount : Decimal(12,2);
}

entity OrderItems : cuid, managed {
    order            : Association to SalesOrders not null;

    @mandatory
    product          : Association to Products not null;

    itemNumber       : Integer default 10;

    @mandatory
    @assert.range: [1, 2147483647]
    quantity         : Integer default 1 not null;

    @mandatory
    @assert.range: [0, 999999999999.99]
    unitPrice        : Decimal(10,2) not null;

    @assert.range: [0, 30.00]
    discountPct      : Decimal(5,2) default 0;

    // Virtual non-persisted field computed dynamically in after-read handlers
    virtual itemTotal : Decimal(12,2);
}