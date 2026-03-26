import React, { useEffect, useMemo } from "react";

function isIgnoredProp(key) {
  return ["x", "y", "vx", "vy", "fx", "fy", "__proto__"].includes(key);
}

function NodeDetailsModal({ open, node, relationshipCount, graphData, onClose }) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const type = node?.type || "Entity";

  const properties = useMemo(() => {
    if (!node) return [];
    const entries = Object.entries(node)
      .filter(([k, v]) => !isIgnoredProp(k))
      .filter(([k, v]) => v != null && typeof v !== "function");

    // Ensure id/label/type appear first if present.
    const priorityKeys = ["type", "id", "label", "name"];
    const priority = [];
    const rest = [];
    entries.forEach((e) => {
      if (priorityKeys.includes(e[0])) priority.push(e);
      else rest.push(e);
    });

    // De-dupe in case something overlaps.
    const seen = new Set();
    const ordered = [...priority, ...rest].filter(([k]) => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return ordered;
  }, [node]);

  const nodesById = useMemo(() => {
    const map = new Map();
    if (!graphData) return map;
    (graphData.nodes || []).forEach((n) => {
      const id = String(n.id ?? n.label);
      map.set(id, n);
    });
    return map;
  }, [graphData]);

  const connectedRelationships = useMemo(() => {
    if (!node || !graphData) return [];
    const nodeId = String(node.id ?? node.label);
    const links = Array.isArray(graphData.links) ? graphData.links : [];

    const groupsByType = new Map();

    links.forEach((l) => {
      const s = String(l.source);
      const t = String(l.target);
      const matches = s === nodeId || t === nodeId;
      if (!matches) return;

      const otherId = s === nodeId ? t : s;
      const relType = l.type ?? l.label ?? "RELATED_TO";
      const key = String(relType);

      if (!groupsByType.has(key)) {
        groupsByType.set(key, { type: key, count: 0, otherIds: new Set() });
      }
      const g = groupsByType.get(key);
      g.count += 1;
      g.otherIds.add(otherId);
    });

    const groups = Array.from(groupsByType.values());
    groups.sort((a, b) => b.count - a.count);
    return groups;
  }, [node, graphData]);

  if (!open || !node) return null;

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // Close when clicking outside the card.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="modalCard">
        <div className="modalHeader">
          <div>
            <div className="modalTitle">{type}</div>
            <div className="modalSub">Click nodes in the graph to inspect connected context.</div>
          </div>
          <button className="modalCloseButton" type="button" onClick={() => onClose?.()} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modalBody">
          <div className="modalKpis">
            <div className="kpiCard">
              <div className="kpiKey">Connected relationships</div>
              <div className="kpiValue">{relationshipCount}</div>
            </div>
            <div className="kpiCard">
              <div className="kpiKey">Entity ID</div>
              <div className="kpiValue">{String(node.id ?? node.label ?? "—")}</div>
            </div>
          </div>

          {connectedRelationships.length ? (
            <div style={{ marginTop: 10 }}>
              <div className="assistantSectionTitle" style={{ marginTop: 0 }}>
                Connected relationships
              </div>
              <table className="propsTable">
                <tbody>
                  {connectedRelationships.map((g) => {
                    const otherNodes = Array.from(g.otherIds).map((id) => {
                      const n = nodesById.get(id);
                      return n?.label || id;
                    });
                    const preview = otherNodes.slice(0, 6).join(", ");
                    const rest = otherNodes.length > 6 ? ` +${otherNodes.length - 6} more` : "";

                    return (
                      <tr key={g.type} className="propsRow">
                        <td className="propsKeyCell">{g.type}</td>
                        <td className="propsValCell">
                          <div style={{ fontWeight: 950, marginBottom: 4 }}>{g.count} links</div>
                          <div style={{ color: "rgba(15, 23, 42, 0.85)" }}>
                            {preview}
                            {rest}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <table className="propsTable">
            <tbody>
              {properties.map(([k, v]) => (
                <tr key={k} className="propsRow">
                  <td className="propsKeyCell">{k}</td>
                  <td className="propsValCell">
                    {typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}
                  </td>
                </tr>
              ))}
              {properties.length === 0 ? (
                <tr className="propsRow">
                  <td className="propsKeyCell">info</td>
                  <td className="propsValCell">No properties returned for this node.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default NodeDetailsModal;

