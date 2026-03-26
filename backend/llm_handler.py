import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GROQ_API_KEY")


def generate_cypher_query(user_query):

    # ---------------- SAFETY CHECK ----------------
    if not API_KEY:
        raise Exception("GROQ_API_KEY not found in .env file")

    # ---------------- PROMPT ----------------
    prompt = f"""
    You are a Neo4j expert.

    Convert natural language into Cypher query.

    Graph schema:
    Customer-[:PLACED]->SalesOrder
    SalesOrder-[:DELIVERED_AS]->Delivery
    Delivery-[:BILLED_AS]->Invoice
    SalesOrder-[:BILLED_AS]->Invoice
    Invoice-[:PAID_BY]->Payment
    Invoice-[:HAS_JOURNAL]->JournalEntry
    Customer-[:HAS_ADDRESS]->Address
    SalesOrder-[:INCLUDES_PRODUCT]->Product
    Invoice-[:INCLUDES_PRODUCT]->Product
    Delivery-[:DELIVERY_AT]->Plant

    STRICT RULES:
    - ALWAYS assign relationship to a variable (example: [r:PLACED])
    - NEVER return :RELATIONSHIP directly
    - NEVER write RETURN c, so, :PLACED ❌
    - ALWAYS write RETURN c, r, so ✅
    - NEVER use [r*] or variable length paths
    - ALWAYS return nodes AND relationships

    Examples:

    Q: Show orders for customer 320000083
    A:
    MATCH (c:Customer {{id:"320000083"}})-[r:PLACED]->(o:SalesOrder)
    RETURN c, r, o

    Q: Show deliveries for order 740556
    A:
    MATCH (o:SalesOrder {{id:"740556"}})-[r:DELIVERED_AS]->(d:Delivery)
    RETURN o, r, d

    Q: Which products are associated with the highest number of billing documents?
    A:
    MATCH (i:Invoice)-[r:INCLUDES_PRODUCT]->(p:Product)
    WITH p, count(DISTINCT i) AS billingDocumentCount
    MATCH (i2:Invoice)-[r2:INCLUDES_PRODUCT]->(p)
    RETURN p, r2, i2, billingDocumentCount

    Q: Trace the full flow of a given billing document (Sales Order → Delivery → Billing → Journal Entry)
    A:
    MATCH (so:SalesOrder)-[r1:DELIVERED_AS]->(d:Delivery)-[r2:BILLED_AS]->(i:Invoice)
    MATCH (i)-[r3:HAS_JOURNAL]->(je:JournalEntry)
    WHERE i.id = "<billingDocumentId>"
    RETURN so, r1, d, r2, i, r3, je

    User question:
    {user_query}

    Return ONLY Cypher query.
    """

    url = "https://api.groq.com/openai/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    data = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0
    }

    try:
        response = requests.post(url, headers=headers, json=data)

        # ---------------- API ERROR CHECK ----------------
        if response.status_code != 200:
            raise Exception(f"Groq API Error: {response.text}")

        result = response.json()

        # ---------------- SAFE EXTRACTION ----------------
        query = result.get("choices", [{}])[0].get("message", {}).get("content", "")

        if not query:
            raise Exception("Empty response from LLM")

        # ---------------- CLEAN RESPONSE ----------------
        query = query.replace("```cypher", "").replace("```", "").strip()

        print("\n🧠 RAW LLM OUTPUT:", query)

        return query

    except Exception as e:
        print("\n❌ LLM ERROR:", str(e))
        raise Exception(f"LLM failed: {str(e)}")