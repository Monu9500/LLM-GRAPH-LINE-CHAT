import React, { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

const TYPE_COLORS = {
  Customer: "#3b82f6", // blue
  Order: "#22c55e", // green
  Invoice: "#f59e0b", // orange
  Payment: "#8b5cf6", // purple
  Product: "#ef4444", // red
  Address: "#14b8a6", // teal
  JournalEntry: "#ec4899", // pink
  Plant: "#64748b", // slate
  Unknown: "#94a3b8"
};

function safeText(value) {
  if (value == null) return "";
  return String(value);
}

function GraphView({ graphData, selectedNode, highlightNodeIds, onNodeClick }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ width: cr.width, height: cr.height });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const legend = useMemo(() => {
    const items = [
      { type: "Customer", color: TYPE_COLORS.Customer },
      { type: "Order", color: TYPE_COLORS.Order },
      { type: "Invoice", color: TYPE_COLORS.Invoice },
      { type: "Payment", color: TYPE_COLORS.Payment },
      { type: "Product", color: TYPE_COLORS.Product },
      { type: "JournalEntry", color: TYPE_COLORS.JournalEntry },
      { type: "Address", color: TYPE_COLORS.Address },
      { type: "Plant", color: TYPE_COLORS.Plant }
    ];
    return items;
  }, []);

  const focusId = selectedNode ? String(selectedNode.id ?? selectedNode.label) : null;

  const emphasisSet = useMemo(() => {
    const links = graphData?.links || [];
    const hasSelected = Boolean(focusId);

    if (hasSelected) {
      const sId = String(focusId);
      const set = new Set([sId]);
      links.forEach((l) => {
        const s = String(l.source);
        const t = String(l.target);
        if (s === sId) set.add(t);
        if (t === sId) set.add(s);
      });
      return set;
    }

    const hl = Array.isArray(highlightNodeIds) ? highlightNodeIds : [];
    if (hl.length > 0) {
      const set = new Set(hl.map((x) => String(x)));
      return set;
    }

    // No emphasis.
    return new Set();
  }, [graphData, focusId, highlightNodeIds]);

  const emphasisActive = emphasisSet.size > 0 && (focusId || (highlightNodeIds && highlightNodeIds.length > 0));

  // Smoothly move the camera to the selected node (or keep current view if nothing selected).
  useEffect(() => {
    if (!graphRef.current) return;
    if (!focusId) return;

    const id = String(focusId);
    // zoomToFit animates and does not require node coordinates already to be stable.
    try {
      graphRef.current.zoomToFit(650, 90, (n) => String(n.id) === id);
    } catch {
      // no-op
    }
  }, [focusId]);

  const nodeCanvasObject = useMemo(() => {
    // Note: this runs very frequently; keep it lean.
    return (node, ctx, globalScale) => {
      const type = node.type || "Unknown";
      const baseColor = TYPE_COLORS[type] || TYPE_COLORS.Unknown;

      const id = safeText(node.id);
      const label = safeText(node.label || id);
      const displayLabel = label.length > 18 ? `${label.slice(0, 18)}...` : label;

      const isEmphasized = !emphasisActive || emphasisSet.has(id);
      ctx.save();
      if (!isEmphasized) {
        // Dim non-relevant parts, but keep labels visible.
        ctx.globalAlpha = 0.18;
      }

      const r = 7 / globalScale;
      const lineWidth = 1.5 / globalScale;

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke();

      // Selected-node ring.
      if (focusId && isEmphasized && id === String(focusId)) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, (r + 4 / globalScale) * 1.0, 0, 2 * Math.PI, false);
        ctx.closePath();
        ctx.strokeStyle = "rgba(15, 23, 42, 0.92)";
        ctx.lineWidth = 2.2 / globalScale;
        ctx.stroke();
      }

      // Label pill (always visible per requirement)
      ctx.font = `${12 / globalScale}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.textBaseline = "middle";

      const paddingX = 8 / globalScale;
      const paddingY = 5 / globalScale;
      const textWidth = ctx.measureText(displayLabel).width;
      const pillWidth = textWidth + paddingX * 2;
      const pillHeight = 18 / globalScale + paddingY;

      const pillX = node.x - pillWidth / 2;
      const pillY = node.y - r - pillHeight - 6 / globalScale;

      // Rounded rect helper
      const radius = 10 / globalScale;
      ctx.beginPath();
      ctx.moveTo(pillX + radius, pillY);
      ctx.arcTo(pillX + pillWidth, pillY, pillX + pillWidth, pillY + pillHeight, radius);
      ctx.arcTo(pillX + pillWidth, pillY + pillHeight, pillX, pillY + pillHeight, radius);
      ctx.arcTo(pillX, pillY + pillHeight, pillX, pillY, radius);
      ctx.arcTo(pillX, pillY, pillX + pillWidth, pillY, radius);
      ctx.closePath();

      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.fillText(displayLabel, node.x, pillY + pillHeight / 2);

      ctx.restore();
    };
  }, [emphasisActive, emphasisSet, focusId]);

  const nodePointerAreaPaint = useMemo(() => {
    return (node, paintColor, ctx, globalScale) => {
      // Make the clickable/hoverable area larger than the visible node.
      const r = 16 / globalScale;
      const type = node.type || "Unknown";
      const baseColor = TYPE_COLORS[type] || TYPE_COLORS.Unknown;

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.globalAlpha = 1;
    };
  }, []);

  const handleNodeHover = (node) => {
    if (!node || !graphRef.current) {
      setTooltip(null);
      return;
    }

    try {
      if (typeof node.x !== "number" || typeof node.y !== "number") return;
      const { x, y } = graphRef.current.graph2ScreenCoords(node.x, node.y);
      setTooltip({ node, x, y });
    } catch {
      // If transforms aren't available yet, avoid crashing UI.
      setTooltip(null);
    }
  };

  const handleNodeClick = (node) => {
    if (!node) return;
    onNodeClick?.(node);
  };

  const showEmpty = !graphData?.nodes || graphData.nodes.length === 0;

  return (
    <div className="graphWrap" ref={containerRef}>
      <div className="graphToolbar">
          <div>
            <div className="graphTitle">Graph Intelligence</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(15, 23, 42, 0.6)" }}>
              Customer -&gt; Order -&gt; Invoice -&gt; Payment
            </div>
          </div>
        <div className="graphLegend">
          {legend.map((it) => (
            <div className="legendItem" key={it.type}>
              <span className="legendDot" style={{ background: it.color }} />
              {it.type}
            </div>
          ))}
        </div>
      </div>

      {showEmpty ? (
        <div className="graphEmptyState">
          <div className="graphEmptyCard">
            <div className="graphEmptyTitle">Ask a question to generate a graph</div>
            <div className="graphEmptyBody">
              Use the chat panel to explore your dataset. Click any node to open a full details card with properties and relationship counts.
            </div>
          </div>
        </div>
      ) : null}

      {tooltip ? (
        <div className="graphTooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div className="graphTooltipTitle">{tooltip.node.type || "Entity"}</div>
          <div className="graphTooltipRow">
            <div className="graphTooltipKey">ID</div>
            <div>{safeText(tooltip.node.id)}</div>
          </div>
          <div className="graphTooltipRow">
            <div className="graphTooltipKey">Label</div>
            <div>{safeText(tooltip.node.label || tooltip.node.id)}</div>
          </div>
        </div>
      ) : null}

      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={Math.max(0, size.width)}
        height={Math.max(0, size.height)}
        backgroundColor="#ffffff"
        minZoom={0.15}
        maxZoom={4}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        enablePointerInteraction={true}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => "replace"}
        nodePointerAreaPaint={nodePointerAreaPaint}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        linkWidth={1}
        linkColor={() => "rgba(15, 23, 42, 0.18)"}
        linkDirectionalArrowLength={0}
        cooldownTicks={100}
      />
    </div>
  );
}

export default GraphView;

