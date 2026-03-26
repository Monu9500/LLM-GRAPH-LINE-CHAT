import React, { useMemo, useState } from "react";
import GraphView from "./GraphView";
import ChatPanel from "./ChatPanel";
import NodeDetailsModal from "./NodeDetailsModal";
import "./App.css";

// const API_URL = "http://127.0.0.1:8000";
const API_URL = "http://localhost:8000";

function inferNodeType(key, nodeValue) {
  const k = String(key || "").toLowerCase();

  // Strong hints from the cypher variable name.
  if (k.includes("customer")) return "Customer";
  if (k.includes("order") || k.includes("salesorder") || k === "o") return "Order";
  if (k.includes("invoice") || k === "i") return "Invoice";
  if (k.includes("journal") || k.includes("entry")) return "JournalEntry";
  if (k.includes("address")) return "Address";
  if (k.includes("product") || k.includes("material")) return "Product";
  if (k.includes("plant")) return "Plant";
  if (k.includes("payment")) return "Payment";

  // Heuristic fallback using node properties (avoids key collisions like `p` being Product vs Payment).
  if (nodeValue && typeof nodeValue === "object") {
    if (nodeValue.productType != null || nodeValue.productGroup != null) return "Product";
    if (nodeValue.streetName != null || nodeValue.cityName != null || nodeValue.postalCode != null) return "Address";
    if (nodeValue.accountingDocumentType != null || nodeValue.referenceDocument != null) return "JournalEntry";
    if (nodeValue.financialAccountType != null) return "Payment";
  }

  // Legacy defaults from the original implementation.
  if (k === "d" || k.includes("delivery")) return "Order";
  if (k === "p") return "Payment";
  if (k === "c") return "Customer";

  return "Unknown";
}

function buildGraphDataFromBackendResult(result) {
  const nodesById = new Map();
  const links = [];
  const linkKeySet = new Set();

  const safeRows = Array.isArray(result) ? result : [];
  safeRows.forEach((row) => {
    if (!row || typeof row !== "object") return;

    Object.entries(row).forEach(([key, value]) => {
      // NODE: backend usually returns node objects with an `id` property.
      if (value && typeof value === "object" && value.id != null) {
        const id = String(value.id);
        const type = inferNodeType(key, value);
        const label =
          value.name ||
          value.label ||
          value.title ||
          value.customerName ||
          value.orderNumber ||
          value.invoiceNumber ||
          value.reference ||
          id;

        const nextNode = { ...value, id, type, label };

        if (!nodesById.has(id)) {
          nodesById.set(id, nextNode);
        } else {
          const existing = nodesById.get(id);
          nodesById.set(id, {
            ...existing,
            ...nextNode,
            // If we previously couldn't infer a type, upgrade it.
            type:
              existing.type === "Unknown" && nextNode.type !== "Unknown" ? nextNode.type : existing.type
          });
        }
      }

      // RELATIONSHIP: backend frontend previously expected { start, end, type }.
      if (value && typeof value === "object" && value.start != null && value.end != null) {
        const source = String(value.start);
        const target = String(value.end);
        const relType = value.type ?? value.label ?? "RELATED_TO";
        const label = String(relType);

        // Dedupe identical relationships.
        const lk = `${source}__${target}__${label}`;
        if (linkKeySet.has(lk)) return;
        linkKeySet.add(lk);

        links.push({
          source,
          target,
          type: label,
          label
        });
      }
    });
  });

  return { nodes: Array.from(nodesById.values()), links };
}

function App() {

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [messages, setMessages] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightNodeIds, setHighlightNodeIds] = useState(null);

  // -------------------------------
  // HANDLE QUERY
  // -------------------------------
  const connectedRelationshipsCount = useMemo(() => {
    if (!selectedNode) return 0;
    const id = String(selectedNode.id ?? selectedNode.label);
    return (graphData.links || []).reduce((acc, l) => {
      const s = String(l.source);
      const t = String(l.target);
      return acc + (s === id || t === id ? 1 : 0);
    }, 0);
  }, [selectedNode, graphData.links]);

  const suggestions = [
    { label: "Show all customers", query: "Show all customers" },
    { label: "Show orders for customer 320000083", query: "Show orders for customer 320000083" }
  ];

  const extractIdsFromResult = (payload) => {
    const ids = new Set();

    const addMaybeId = (v) => {
      if (v == null) return;
      ids.add(String(v));
    };

    const walk = (x) => {
      if (x == null) return;
      if (Array.isArray(x)) {
        x.forEach(walk);
        return;
      }
      if (typeof x !== "object") {
        if (typeof x === "string" && /^\d{5,}$/.test(x)) addMaybeId(x);
        return;
      }

      if (x.id != null) addMaybeId(x.id);
      if (x.start != null) addMaybeId(x.start);
      if (x.end != null) addMaybeId(x.end);

      Object.values(x).forEach(walk);
    };

    walk(payload);
    return ids;
  };

  const sendQuery = async (query) => {
    const trimmed = String(query || "").trim();
    if (!trimmed || isLoading) return;

    setError("");
    setIsLoading(true);
    setHighlightNodeIds(null);

    const userMessage = {
      id: `u_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      role: "user",
      text: trimmed
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed })
      });

      if (!res.ok) {
        throw new Error(`API error (${res.status})`);
      }

      const data = await res.json();

      if (data?.error) {
        setError(String(data.error || "Request failed"));
        return;
      }

      // Guardrail-style responses may return only { message }.
      if (data?.message && !data?.cypher && !data?.result) {
        const assistantMessage = {
          id: `a_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          role: "assistant",
          text: String(data.message)
        };
        setError(String(data.message));
        setMessages((prev) => [...prev, assistantMessage]);
        return;
      }

      // Update graph
      const nextGraph = buildGraphDataFromBackendResult(data?.result);
      setGraphData(nextGraph);

      // Highlight ids referenced in the result (graph view focus without requiring a click).
      const referencedIds = extractIdsFromResult(data?.result);
      const graphNodeIds = new Set((nextGraph.nodes || []).map((n) => String(n.id ?? n.label)));
      const referencedList = Array.from(referencedIds).filter((id) => graphNodeIds.has(String(id)));
      setHighlightNodeIds(referencedList.length ? referencedList : null);

      // Update chat (show a compact summary + expandable evidence).
      const assistantMessage = {
        id: `a_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        role: "assistant",
        text: "Graph updated. Review the query & result for evidence.",
        cypher: data?.cypher ? String(data.cypher) : null,
        result: data?.result ? data.result : [],
        rows: Array.isArray(data?.result) ? data.result.length : 0
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError("Backend not reachable. Please ensure FastAPI is running on port 8000.");
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------
  // UI
  // -------------------------------
  return (
    <div className="appRoot">
      <div className="mainLayout">
        <div className="graphPane">
          <GraphView
            graphData={graphData}
            selectedNode={selectedNode}
            highlightNodeIds={highlightNodeIds}
            onNodeClick={(node) => {
              setSelectedNode(node);
              setHighlightNodeIds(null);
            }}
          />
        </div>

        <div className="chatPane">
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            error={error}
            suggestions={suggestions}
            onSendQuery={sendQuery}
          />
        </div>
      </div>

      <NodeDetailsModal
        open={Boolean(selectedNode)}
        node={selectedNode}
        relationshipCount={connectedRelationshipsCount}
        graphData={graphData}
        onClose={() => {
          setSelectedNode(null);
          setHighlightNodeIds(null);
        }}
      />
    </div>
  );
}

export default App;