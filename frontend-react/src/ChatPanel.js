import React, { useEffect, useMemo, useRef, useState } from "react";

function ChatPanel({ messages, isLoading, error, suggestions, onSendQuery }) {
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isLoading]);

  const canSend = useMemo(() => {
    return Boolean(String(draft || "").trim()) && !isLoading;
  }, [draft, isLoading]);

  const handleSend = () => {
    const q = String(draft || "").trim();
    if (!q || isLoading) return;
    setDraft("");
    onSendQuery?.(q);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chatPanel">
      <div className="chatHeader">
        <div className="chatHeaderTop">
          <div className="chatHeaderTitle">Dodge AI - Graph Agent</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(15, 23, 42, 0.55)" }}>
            {isLoading ? "Analyzing..." : "Ready"}
          </div>
        </div>
        <div className="chatHeaderSub">
          Ask dataset questions. The graph and chat response update together.
        </div>

        {error ? <div className="errorBanner">{error}</div> : null}
      </div>

      <div className="chatMessages">
        {messages.map((m) => {
          const roleClass = m.role === "user" ? "right" : "left";
          const bubbleClass = m.role === "user" ? "messageUser" : "messageAssistant";
          const isAssistantEvidence = m.role === "assistant" && m.cypher;

          return (
            <div key={m.id} className={`messageRow ${roleClass}`}>
              <div className={`messageBubble ${bubbleClass}`}>
                <div>{m.text}</div>

                {isAssistantEvidence ? (
                  <details className="assistantDetails">
                    <summary>View query & result</summary>
                    <div className="assistantDetailsContent">
                      <div className="assistantSectionTitle">Cypher</div>
                      <pre className="assistantPre">{m.cypher}</pre>

                      <div className="assistantSectionTitle">
                        Result ({typeof m.rows === "number" ? m.rows : (Array.isArray(m.result) ? m.result.length : 0)} rows)
                      </div>
                      <pre className="assistantPre">{JSON.stringify(m.result || [], null, 2)}</pre>
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          );
        })}

        {isLoading ? (
          <div className="messageRow left">
            <div className="messageBubble messageAssistant">
              <div className="messageLoading">
                <div className="inlineSpinner" />
                <div>Querying graph & generating response...</div>
              </div>
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      <div className="chatComposer">
        <div className="suggestionsRow">
          {(suggestions || []).map((s) => (
            <button
              key={s.query}
              type="button"
              className="chipButton"
              disabled={isLoading}
              onClick={() => onSendQuery?.(s.query)}
              title="Quick action"
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="composerRow">
          <input
            className="composerInput"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Ask: "Show all customers"...'
            aria-label="Chat input"
            disabled={isLoading}
          />
          <button className="sendButton" type="button" onClick={handleSend} disabled={!canSend}>
            Send
          </button>
        </div>

        <div className="composerHint">Tip: press `Enter` to send</div>
      </div>
    </div>
  );
}

export default ChatPanel;

