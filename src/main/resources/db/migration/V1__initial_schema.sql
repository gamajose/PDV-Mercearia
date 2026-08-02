CREATE TABLE company (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legal_name TEXT NOT NULL,
    trade_name TEXT,
    document TEXT,
    segment TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE branch (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, code),
    FOREIGN KEY (company_id) REFERENCES company(id)
);

CREATE TABLE app_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    login TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'OPERATOR',
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, login),
    FOREIGN KEY (company_id) REFERENCES company(id)
);

CREATE TABLE category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    UNIQUE(company_id, name),
    FOREIGN KEY (company_id) REFERENCES company(id)
);

CREATE TABLE product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    category_id INTEGER,
    sku TEXT,
    barcode TEXT,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL DEFAULT 'UN',
    sold_by_weight INTEGER NOT NULL DEFAULT 0 CHECK (sold_by_weight IN (0, 1)),
    cost_price NUMERIC NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
    sale_price NUMERIC NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
    minimum_stock NUMERIC NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, sku),
    UNIQUE(company_id, barcode),
    FOREIGN KEY (company_id) REFERENCES company(id),
    FOREIGN KEY (category_id) REFERENCES category(id)
);

CREATE TABLE inventory_balance (
    branch_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (branch_id, product_id),
    FOREIGN KEY (branch_id) REFERENCES branch(id),
    FOREIGN KEY (product_id) REFERENCES product(id)
);

CREATE TABLE supplier (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    document TEXT,
    phone TEXT,
    email TEXT,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES company(id)
);

CREATE TABLE customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    document TEXT,
    phone TEXT,
    email TEXT,
    credit_limit NUMERIC NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES company(id)
);

CREATE TABLE cash_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    opened_by INTEGER NOT NULL,
    closed_by INTEGER,
    opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT,
    opening_amount NUMERIC NOT NULL DEFAULT 0,
    closing_amount NUMERIC,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    notes TEXT,
    FOREIGN KEY (branch_id) REFERENCES branch(id),
    FOREIGN KEY (opened_by) REFERENCES app_user(id),
    FOREIGN KEY (closed_by) REFERENCES app_user(id)
);

CREATE TABLE purchase (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    supplier_id INTEGER,
    created_by INTEGER NOT NULL,
    document_number TEXT,
    purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('DRAFT', 'COMPLETED', 'CANCELED')),
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (branch_id) REFERENCES branch(id),
    FOREIGN KEY (supplier_id) REFERENCES supplier(id),
    FOREIGN KEY (created_by) REFERENCES app_user(id)
);

CREATE TABLE purchase_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    total NUMERIC NOT NULL CHECK (total >= 0),
    FOREIGN KEY (purchase_id) REFERENCES purchase(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES product(id)
);

CREATE TABLE sale (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    cash_session_id INTEGER,
    customer_id INTEGER,
    created_by INTEGER NOT NULL,
    receipt_number TEXT NOT NULL,
    sold_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('DRAFT', 'COMPLETED', 'CANCELED')),
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    UNIQUE(branch_id, receipt_number),
    FOREIGN KEY (branch_id) REFERENCES branch(id),
    FOREIGN KEY (cash_session_id) REFERENCES cash_session(id),
    FOREIGN KEY (customer_id) REFERENCES customer(id),
    FOREIGN KEY (created_by) REFERENCES app_user(id)
);

CREATE TABLE sale_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total NUMERIC NOT NULL CHECK (total >= 0),
    FOREIGN KEY (sale_id) REFERENCES sale(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES product(id)
);

CREATE TABLE payment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'CREDIT_ACCOUNT', 'OTHER')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    installments INTEGER NOT NULL DEFAULT 1 CHECK (installments > 0),
    reference TEXT,
    FOREIGN KEY (sale_id) REFERENCES sale(id) ON DELETE CASCADE
);

CREATE TABLE stock_movement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('PURCHASE', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN_IN', 'RETURN_OUT')),
    quantity NUMERIC NOT NULL,
    source_type TEXT,
    source_id INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branch(id),
    FOREIGN KEY (product_id) REFERENCES product(id),
    FOREIGN KEY (user_id) REFERENCES app_user(id)
);

CREATE TABLE non_fiscal_document (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('SALE_RECEIPT', 'PURCHASE_RECEIPT')),
    document_number TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    total NUMERIC NOT NULL DEFAULT 0,
    content TEXT,
    issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, document_type, document_number),
    FOREIGN KEY (branch_id) REFERENCES branch(id)
);

CREATE INDEX idx_product_name ON product(company_id, name);
CREATE INDEX idx_product_barcode ON product(company_id, barcode);
CREATE INDEX idx_customer_name ON customer(company_id, name);
CREATE INDEX idx_supplier_name ON supplier(company_id, name);
CREATE INDEX idx_sale_date ON sale(branch_id, sold_at);
CREATE INDEX idx_purchase_date ON purchase(branch_id, purchased_at);
CREATE INDEX idx_stock_movement_product ON stock_movement(branch_id, product_id, created_at);
