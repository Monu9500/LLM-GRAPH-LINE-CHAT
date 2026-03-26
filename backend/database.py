from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

load_dotenv()

URI = "neo4j://127.0.0.1:7687"
USERNAME = "neo4j"
PASSWORD = "w842g0vi7gKSZMIPeLIA5AzEvohmGfgNpf72frqEoY8"

driver = GraphDatabase.driver(URI, auth=(USERNAME, PASSWORD))


def run_query(query, parameters=None):
    with driver.session(database="neo4j") as session:
        result = session.run(query, parameters)
        return [record.data() for record in result]
        