# SAP CAP Backend Developer — Unofficial Practical Mock Exam 02
## Practical Mock Exam 02 — CAP Sales & Customer Order Fulfillment

> **Exam Focus**: SAP Certified Associate — Backend Developer — SAP Cloud Application Programming Model (`C_CPE_2409` / `C_CPE_14`)  
> **Notice**: Unofficial practice scenario • Not an actual or leaked SAP exam task  
> **Suggested Practice Time**: 180 minutes (3 hours)  
> **Total Points**: 100 points  
> **Passing Score (Benchmark)**: 70% (70 points)

---

## 📋 Your Assignment

A global enterprise requires an end-to-end CAP backend application to manage customer accounts, product catalog, sales order intake, pricing and discount rules, inventory stock allocation, and order fulfillment. 

You have been assigned an existing or newly initialized CAP Node.js project. Implement the required domain data models, service projections, lifecycle event handlers, custom operations (both Actions and Functions), declarative security roles, database persistence, and Multi-Target Application (MTA) packaging descriptors. Finally, verify the complete operational readiness and transactional integrity of the application.

> [!IMPORTANT]
> **Objective**: Deliver a working, production-grade application that fulfills every requirement below. Writing code without verifying its runtime behavior, error handling, and transactional integrity is insufficient.

---

## 🛠️ Tasks & Technical Requirements

### Task 1 — Data Modeling (15 points)

Create the CDS data model in `db/schema.cds` under namespace `sales` for the following entities:

| Entity | Required Fields | Key Constraints & Descriptions |
| :--- | :--- | :--- |
| **`Customers`** | `ID`, `customerNumber`, `name`, `email`, `creditLimit`, `loyaltyTier`, `active` | Customer master with unique business number, credit limit, and loyalty status. |
| **`Products`** | `ID`, `productCode`, `name`, `description`, `category`, `unitPrice`, `availableStock` | Product catalog with unit pricing and inventory stock level. |
| **`SalesOrders`** | `ID`, `orderNumber`, `orderDate`, `deliveryDate`, `status`, `priority`, `customer`, `shippingAddress` | Sales order header with order lifecycle status, priority, and customer relation. |
| **`OrderItems`** | `ID`, `itemNumber`, `quantity`, `unitPrice`, `discountPct`, `product`, `sales order` | Order line items with quantity, line pricing, and discount percentage. |

#### Detailed Task 1 Requirements:
- **Aspects & Keys**: Use standard CDS aspects (`cuid`, `managed`) from `@sap/cds/common` for entity UUIDs and audit timestamps.
- **Custom Types & Enums**:
  - Define `OrderStatus` enum: `DRAFT`, `CONFIRMED`, `IN_DELIVERY`, `DELIVERED`, `CANCELLED` (Default: `DRAFT`).
  - Define `Priority` enum: `LOW`, `MEDIUM`, `HIGH`, `URGENT` (Default: `MEDIUM`).
  - Define `LoyaltyTier` enum: `SILVER`, `GOLD`, `PLATINUM` (Default: `SILVER`).
- **Entity Relationships**:
  - Model relationship between `SalesOrders` and `Customers` via `Association to Customers`.
  - Model relationship between `OrderItems` and `Products` via `Association to Products`.
  - Model the relationship between `SalesOrders` and `OrderItems` as a **Composition of many** (`Composition of many OrderItems on Items.order = $self`) to guarantee parent-child containment and automatic cascade deletion.
- **Virtual (Computed) Fields**:
  - On `OrderItems`: add non-persisted `virtual itemTotal : Decimal(12,2)`.
  - On `SalesOrders`: add non-persisted `virtual netAmount : Decimal(12,2)`, `virtual taxAmount : Decimal(12,2)`, and `virtual totalAmount : Decimal(12,2)`.
- **Validation Constraints**: Apply appropriate CDS constraints: `not null` / `@mandatory`, `@assert.range`, and format checks.

---

### Task 2 — Expose the Service (10 points)

Create a service definition file `srv/sales-service.cds` exposing the domain entities:

- **Service Definition**: Define `service SalesService` mounted at route `@(path: '/odata/v4/sales')`.
- **Master Data Protection**: Expose `Customers` as `@readonly entity Customers as projection on db.Customers;` to ensure customer master data is protected against accidental modifications through the transactional sales service.
- **Entity Projections**: Expose `Products`, `SalesOrders`, and `OrderItems` with full transactional capabilities.
- **Deep Navigations**: Ensure consumers can navigate from `SalesOrders` to `Items` and from `Items` to the associated `product`.
- **Draft Enablement**: Support transactional child editing (or configure draft handling via `@odata.draft.enabled` where applicable).
- **Metadata Verification**: Verify that the service document and EDMX metadata (`$metadata`) compile cleanly with zero errors or schema warnings.

---

### Task 3 — Implement Business Logic (20 points)

Implement enterprise business rules and lifecycle event handlers in `srv/sales-service.js`:

1. **Item Quantity Validation**: Reject line item creation or updates if `quantity` is null, zero, or negative (`quantity < 1`) with HTTP 400.
2. **Line Discount Validation**: Reject line items if `discountPct` is negative or exceeds `30.00%` (the maximum allowed sales line discount) with HTTP 400.
3. **Customer Active Verification**: On order creation, reject the transaction if the specified `customer` does not exist or has `active = false` with HTTP 400.
4. **Credit Limit Check**: On sales order creation, verify that the customer's credit limit is not breached. Sum up all existing non-cancelled orders for that customer plus the current order; if the total exceeds `customer.creditLimit`, reject with HTTP 400 (`Customer credit limit exceeded`).
5. **Inventory Availability Check**: When adding or updating order items, verify that the requested `quantity` does not exceed the current `availableStock` of the selected product. If stock is insufficient, reject with HTTP 400 (`Insufficient stock for product`).
6. **Dynamic Virtual Calculation**: In the `after('READ', 'SalesOrders')` lifecycle handler:
   - For every line item, calculate `itemTotal = quantity * unitPrice * (1 - discountPct / 100)`.
   - Calculate order `netAmount` as the sum of all item `itemTotal` values.
   - Calculate `taxAmount` at a standard 10% rate (`netAmount * 0.10`).
   - Calculate `totalAmount = netAmount + taxAmount`.
   - Ensure calculations handle single record reads as well as array queries, formatting amounts to 2 decimal places.

---

### Task 4 — Add Custom Operations (Action & Function) (10 points)

Implement two custom operations in `srv/sales-service.cds` and `srv/sales-service.js` to test command (Action) and query (Function) semantics:

#### 1. Custom Action: `confirmSalesOrder`
- **Signature**:
  ```cds
  action confirmSalesOrder(orderID : UUID) returns {
    success     : Boolean;
    orderNumber : String;
    status      : String;
    message     : String;
  };
  ```
- **Business Behavior**:
  - Retrieve the target order. If not found, return HTTP 404 (`Order not found`).
  - Verify that the order contains at least one line item; reject empty orders with HTTP 400.
  - State Machine Check: Verify that the order status is `DRAFT`. If the order is already `CONFIRMED`, `DELIVERED`, or `CANCELLED`, reject with HTTP 400 (`Cannot confirm order in status ...`).
  - Stock Allocation: For each item in the order, atomically deduct the ordered `quantity` from `Products.availableStock` within the transaction.
  - Update the order `status` to `CONFIRMED`.
  - Return a structured response confirming order submission.

#### 2. Custom Function: `calculateCustomerDiscount`
- **Signature**:
  ```cds
  function calculateCustomerDiscount(customerID : UUID, orderAmount : Decimal(10,2)) returns {
    loyaltyTier     : String;
    discountRate    : Decimal(5,2);
    discountSavings : Decimal(10,2);
    finalAmount     : Decimal(10,2);
  };
  ```
- **Business Behavior**:
  - Accept customer ID and order amount via HTTP GET.
  - Lookup the customer loyalty tier:
    - `SILVER` -> 5% discount rate
    - `GOLD` -> 10% discount rate
    - `PLATINUM` -> 15% discount rate
  - Return the calculated tier, discount percentage, total savings, and final payable amount.

---

### Task 5 — Authorization & Access Control (10 points)

Implement multi-tier enterprise role-based security:

1. **Role Definitions**:
   - `SalesRepresentative`: Sales frontline staff permitted to view catalog, view customers, and create/update draft sales orders.
   - `SalesManager`: Department management permitted full CRUD authority, order confirmation, and overriding business actions.
2. **Declarative Annotations**:
   - Restrict execution of the `confirmSalesOrder` action strictly to `@requires: 'SalesManager'`.
   - Apply `@restrict` on `SalesOrders`:
     - `SalesRepresentative`: Granted `['READ', 'CREATE']`.
     - `SalesManager`: Granted full access `['*']`.
3. **Local Development Configuration**:
   - Configure mock users in `package.json` under `cds.requires.auth`:
     - User `rep` (password: `rep123`, roles: `['SalesRepresentative']`).
     - User `manager` (password: `mgr123`, roles: `['SalesManager']`).
     - User `unauthorized` (password: `guest123`, roles: `[]`).
4. **Production Security Descriptor**:
   - Generate and configure `xs-security.json` with scopes (`$XSAPPNAME.SalesRepresentative`, `$XSAPPNAME.SalesManager`), role templates, and role collections for SAP BTP XSUAA.

---

### Task 6 — Persistence, CQL Queries & Deep Operations (10 points)

1. **Database Deployment**:
   - Deploy schema locally to SQLite (`db.sqlite`) using `cds deploy --to sqlite:db.sqlite`.
2. **Deep Insert Verification**:
   - Verify that deep insert creation of a `SalesOrder` with multiple nested `OrderItems` succeeds in a single atomic OData POST request.
3. **OData Query Operations**:
   - Query orders filtered by status (`$filter=status eq 'CONFIRMED'`).
   - Query products sorted by `unitPrice desc`.
   - Perform deep nested expansions: Order -> Items -> Product (`$expand=Items($expand=product)`).
4. **Transactional Rollback Verification**:
   - Verify that if any item in a deep insert fails validation (e.g. negative quantity or stock limit), the entire transaction rolls back cleanly, leaving no orphaned sales order header.

---

### Task 7 — Build & Deployment (15 points)

1. **MTA Descriptor (`mta.yaml`)**:
   - Configure `mta.yaml` for SAP BTP Cloud Foundry deployment:
     - `sales-mgmt-db-deployer`: HDI deployer module (`hdb` buildpack) targeting `gen/db`.
     - `sales-mgmt-srv`: Node.js CAP backend module (`nodejs_buildpack`) targeting `gen/srv`.
     - `sales-mgmt-auth`: Managed XSUAA service resource (`org.cloudfoundry.managed-service`, plan `application`).
     - `sales-mgmt-db`: SAP HANA Cloud HDI container resource (`com.sap.xs.hdi-container`, plan `hdi-shared`).
2. **Dual Environment Profiles in `package.json`**:
   - `[development]`: SQLite persistent database with mocked auth.
   - `[production]`: SAP HANA Cloud database driver with XSUAA authentication.
3. **Build Pipeline**:
   - Execute production build: `npx cds build --production` to compile CSN and generate `gen/srv` and `gen/db`.
   - Assemble MTAR package using Cloud MTA Build Tool: `mbt build`.
4. **Cloud Foundry Operations**:
   - Document deployment command (`cf deploy mta_archives/sales-mgmt_1.0.0.mtar`).
   - Document log diagnostics command (`cf logs <app-name> --recent`).

---

### Task 8 — Final Verification & Test Suite (10 points)

Ensure the solution is thoroughly tested and documented:

- [ ] CAP dev server starts cleanly (`cds watch`) with no unhandled rejections or syntax errors.
- [ ] OData `$metadata` endpoint responds with valid EDMX schema.
- [ ] Positive path: Successfully create a customer, product, and sales order with nested items.
- [ ] Positive path: Verify virtual fields (`netAmount`, `taxAmount`, `totalAmount`) calculate accurately.
- [ ] Positive path: Execute `confirmSalesOrder` with manager credentials; verify status changes to `CONFIRMED` and product stock is decremented.
- [ ] Positive path: Execute `calculateCustomerDiscount` function and verify mathematical accuracy.
- [ ] Negative path: Verify negative quantity or discount > 30% is rejected with HTTP 400.
- [ ] Negative path: Verify exceeding credit limit or available stock is rejected with HTTP 400.
- [ ] Negative path: Verify confirming an empty order or already confirmed order is rejected with HTTP 400.
- [ ] Security path: Verify representative or unauthenticated user attempting to confirm an order receives HTTP 403 Forbidden.
- [ ] Production MTAR archive builds successfully without build warnings.

---

## 📊 Scoring Rubric

| Area | Maximum Points | Criteria for Full Score |
| :--- | :---: | :--- |
| **CDS Data Modeling** | 15 | Accurate entities, keys, aspects, enums, composition with cascade delete, virtual fields, constraints. |
| **Service Exposure** | 10 | Clean service definition, `@readonly` on master data, deep navigation, valid EDMX. |
| **Business Logic** | 20 | Robust before/after handlers: quantity, discount, customer active, credit limit, stock check, virtual totals. |
| **Custom Operations** | 10 | Action `confirmSalesOrder` with state machine and stock decrement; Function `calculateCustomerDiscount`. |
| **Authorization & Security** | 10 | `@requires` and `@restrict` declarative roles, mock users config, `xs-security.json` descriptors. |
| **Persistence & Queries** | 10 | SQLite persistence, deep insert, nested `$expand`, filtering/sorting, atomicity on rollback. |
| **Build & Deployment** | 15 | Production `mta.yaml`, dual profiles in `package.json`, `cds build --production`, `mbt build` MTAR archive. |
| **Verification & Testing** | 10 | Zero runtime errors, comprehensive positive and negative test cases documented and verified. |
| **TOTAL** | **100** | **Passing Benchmark: 70 Points** |

---

## 💡 How to Use This Mock Exam

1. **Workspace Setup**: Work in VS Code or SAP Business Application Studio inside `/home/user/C_CPE/Mock-2`.
2. **Step-by-Step Execution**: Implement Task 1 first, run `cds compile db/schema.cds --to sql` to verify CDS syntax, then proceed task by task.
3. **Rigorous Verification**: Do not consider a task complete until you have executed both positive tests and negative edge case tests using `curl` or the REST Client.
4. **Official Certification Reference**: For official preparation guidelines and scope, refer to:
   - [SAP Certified Associate — Backend Developer — SAP Cloud Application Programming Model](https://learning.sap.com/certifications/sap-certified-associate-backend-developer-sap-cloud-programming-model)
   - [SAP System-Based Assessments FAQ](https://learning.sap.com/helpcenter/certification-support/system-based-assessments-faq)
