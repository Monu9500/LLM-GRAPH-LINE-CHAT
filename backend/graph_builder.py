import pandas as pd
import os
from database import run_query

DATA_PATH = "../data/sap-o2c-data"


# -------------------------------
# LOAD DATA
# -------------------------------
def load_data():
    data = {}

    print("📂 Loading JSONL dataset...")

    for folder in os.listdir(DATA_PATH):
        folder_path = os.path.join(DATA_PATH, folder)

        if os.path.isdir(folder_path):
            all_dfs = []

            for file in os.listdir(folder_path):
                if file.endswith(".jsonl"):
                    file_path = os.path.join(folder_path, file)

                    try:
                        df = pd.read_json(file_path, lines=True)
                        all_dfs.append(df)
                    except Exception as e:
                        print(f"❌ Error in {file}: {e}")

            if all_dfs:
                data[folder] = pd.concat(all_dfs, ignore_index=True)
                print(f"✅ Loaded {folder} ({len(data[folder])} rows)")

    return data


# -------------------------------
# NODE CREATION
# -------------------------------
def create_customer(cid):
    run_query("MERGE (c:Customer {id:$id})", {"id": str(cid)})


def create_order(oid):
    run_query("MERGE (o:SalesOrder {id:$id})", {"id": str(oid)})


def create_delivery(did):
    run_query("MERGE (d:Delivery {id:$id})", {"id": str(did)})


def create_invoice(iid):
    run_query("MERGE (i:Invoice {id:$id})", {"id": str(iid)})


def create_payment(pid):
    run_query("MERGE (p:Payment {id:$id})", {"id": str(pid)})


# -------------------------------
# NEW ENTITY NODES
# -------------------------------
def create_plant(plant_id):
    run_query("MERGE (pl:Plant {id:$id})", {"id": str(plant_id)})


def create_product(pid):
    run_query("MERGE (p:Product {id:$id})", {"id": str(pid)})


def create_address(address_id):
    run_query("MERGE (a:Address {id:$id})", {"id": str(address_id)})


def create_journal_entry(journal_id):
    run_query("MERGE (je:JournalEntry {id:$id})", {"id": str(journal_id)})

# -------------------------------
# RELATIONSHIPS
# -------------------------------
def link_customer_order(c, o):
    run_query("""
        MATCH (c:Customer {id:$c}), (o:SalesOrder {id:$o})
        MERGE (c)-[:PLACED]->(o)
    """, {"c": str(c), "o": str(o)})


def link_order_delivery(o, d):
    run_query("""
        MATCH (o:SalesOrder {id:$o}), (d:Delivery {id:$d})
        MERGE (o)-[:DELIVERED_AS]->(d)
    """, {"o": str(o), "d": str(d)})


def link_invoice_payment(i, p):
    run_query("""
        MATCH (i:Invoice {id:$i}), (p:Payment {id:$p})
        MERGE (i)-[:PAID_BY]->(p)
    """, {"i": str(i), "p": str(p)})

# -------------------------------
# NEW RELATIONSHIPS
# -------------------------------
def link_customer_address(c, a):
    run_query("""
        MATCH (c:Customer {id:$c}), (a:Address {id:$a})
        MERGE (c)-[:HAS_ADDRESS]->(a)
    """, {"c": str(c), "a": str(a)})


def link_salesorder_invoice(o, i):
    run_query("""
        MATCH (o:SalesOrder {id:$o}), (i:Invoice {id:$i})
        MERGE (o)-[:BILLED_AS]->(i)
    """, {"o": str(o), "i": str(i)})


def link_delivery_invoice(d, i):
    run_query("""
        MATCH (d:Delivery {id:$d}), (i:Invoice {id:$i})
        MERGE (d)-[:BILLED_AS]->(i)
    """, {"d": str(d), "i": str(i)})


def link_invoice_journal_entry(i, je):
    run_query("""
        MATCH (i:Invoice {id:$i}), (je:JournalEntry {id:$je})
        MERGE (i)-[:HAS_JOURNAL]->(je)
    """, {"i": str(i), "je": str(je)})


def link_salesorder_product(o, p):
    run_query("""
        MATCH (o:SalesOrder {id:$o}), (p:Product {id:$p})
        MERGE (o)-[:INCLUDES_PRODUCT]->(p)
    """, {"o": str(o), "p": str(p)})


def link_invoice_product(i, p):
    run_query("""
        MATCH (i:Invoice {id:$i}), (p:Product {id:$p})
        MERGE (i)-[:INCLUDES_PRODUCT]->(p)
    """, {"i": str(i), "p": str(p)})


def link_delivery_plant(d, plant):
    run_query("""
        MATCH (d:Delivery {id:$d}), (pl:Plant {id:$plant})
        MERGE (d)-[:DELIVERY_AT]->(pl)
    """, {"d": str(d), "plant": str(plant)})

# -------------------------------
# BUILD GRAPH
# -------------------------------
def build_graph(data):

    orders = data.get("sales_order_headers")
    delivery_items = data.get("outbound_delivery_items")   # ✅ correct table
    invoices = data.get("billing_document_headers")
    payments = data.get("payments_accounts_receivable")

    # Expanded graph tables (optional/bonus but needed for a fuller dataset model).
    sales_order_items = data.get("sales_order_items")
    billing_items = data.get("billing_document_items")
    products = data.get("products")
    addresses = data.get("business_partner_addresses")
    journal_entries = data.get("journal_entry_items_accounts_receivable")

    print("\n🚀 Building FULL graph...")

    # ---------------- CUSTOMER → ORDER ----------------
    for _, row in orders.iterrows():
        order_id = row.get("salesOrder")
        customer_id = row.get("soldToParty")

        if order_id:
            create_order(order_id)

        if customer_id:
            create_customer(customer_id)

        if order_id and customer_id:
            link_customer_order(customer_id, order_id)

    # ---------------- ORDER → DELIVERY ----------------
    for _, row in delivery_items.iterrows():

        delivery_id = row.get("deliveryDocument")
        order_id = row.get("referenceSdDocument")   # ✅ FINAL FIX

        if delivery_id:
            create_delivery(delivery_id)

        if order_id and delivery_id:
            link_order_delivery(order_id, delivery_id)

    # ---------------- INVOICE ----------------
    for _, row in invoices.iterrows():
        invoice_id = row.get("billingDocument")

        if invoice_id:
            create_invoice(invoice_id)

    # ---------------- PAYMENT ----------------
    for _, row in payments.iterrows():
        payment_id = row.get("accountingDocument")

        if payment_id:
            create_payment(payment_id)

    # ---------------- INVOICE → PAYMENT ----------------
    for _, row in invoices.iterrows():
        invoice_id = row.get("billingDocument")
        payment_id = row.get("accountingDocument")

        if invoice_id and payment_id:
            link_invoice_payment(invoice_id, payment_id)

    # ---------------- CUSTOMER → ADDRESS ----------------
    if addresses is not None:
        for _, row in addresses.iterrows():
            business_partner = row.get("businessPartner")
            address_id = row.get("addressId")
            if business_partner and address_id:
                create_address(address_id)
                link_customer_address(business_partner, address_id)

    # ---------------- PRODUCTS + ORDER/INVOICE → PRODUCT ----------------
    # Create product nodes from the canonical products table.
    if products is not None:
        for _, row in products.iterrows():
            pid = row.get("product")
            if pid:
                create_product(pid)

    # Sales order items reference `material` which aligns with product IDs.
    if sales_order_items is not None:
        for _, row in sales_order_items.iterrows():
            so_id = row.get("salesOrder")
            material = row.get("material")
            if so_id and material:
                create_product(material)
                link_salesorder_product(so_id, material)

    # Billing items are linked to billing documents and products.
    if billing_items is not None:
        for _, row in billing_items.iterrows():
            inv_id = row.get("billingDocument")
            material = row.get("material")
            if inv_id and material:
                create_product(material)
                create_invoice(inv_id)
                link_invoice_product(inv_id, material)

    # ---------------- DELIVERY → INVOICE + ORDER → INVOICE ----------------
    # Join key for both delivery and billing is the Sales Order: `referenceSdDocument`.
    if delivery_items is not None and billing_items is not None:
        so_to_deliveries = {}
        for _, row in delivery_items.iterrows():
            delivery_id = row.get("deliveryDocument")
            so_id = row.get("referenceSdDocument")
            if so_id and delivery_id:
                so_to_deliveries.setdefault(str(so_id), set()).add(str(delivery_id))

        so_to_invoices = {}
        for _, row in billing_items.iterrows():
            inv_id = row.get("billingDocument")
            so_id = row.get("referenceSdDocument")
            if so_id and inv_id:
                so_to_invoices.setdefault(str(so_id), set()).add(str(inv_id))

        for so_id, delivery_ids in so_to_deliveries.items():
            inv_ids = so_to_invoices.get(so_id, set())
            if not inv_ids:
                continue

            # Create SalesOrder -> Invoice and Delivery -> Invoice.
            for inv_id in inv_ids:
                create_invoice(inv_id)
                link_salesorder_invoice(so_id, inv_id)
                for delivery_id in delivery_ids:
                    create_delivery(delivery_id)
                    link_delivery_invoice(delivery_id, inv_id)

    # ---------------- INVOICE → JOURNAL_ENTRY ----------------
    if journal_entries is not None:
        for _, row in journal_entries.iterrows():
            journal_id = row.get("accountingDocument")
            invoice_id = row.get("referenceDocument")

            if journal_id:
                create_journal_entry(journal_id)
            if invoice_id and journal_id:
                create_invoice(invoice_id)
                link_invoice_journal_entry(invoice_id, journal_id)

    # ---------------- DELIVERY → PLANT ----------------
    if delivery_items is not None:
        for _, row in delivery_items.iterrows():
            delivery_id = row.get("deliveryDocument")
            plant = row.get("plant")
            if delivery_id and plant:
                create_plant(plant)
                create_delivery(delivery_id)
                link_delivery_plant(delivery_id, plant)

    print("✅ FULL GRAPH CREATED SUCCESSFULLY!")


# -------------------------------
# MAIN
# -------------------------------
if __name__ == "__main__":
    data = load_data()
    build_graph(data)