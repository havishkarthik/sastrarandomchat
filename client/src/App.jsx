import React, { useState, useEffect, useCallback, useRef } from "react";
import socket from "./services/socket";
import { getCurrentLocation, watchLocation, clearLocationWatch } from "./services/location";
import StartScreen from "./components/StartScreen";
import ChatBox from "./components/ChatBox";
import MessageInput from "./components/MessageInput";

// Possible app states
const STATE = {
  IDLE: "idle",
  CONNECTING: "connecting",
  WAITING: "waiting",
  CHATTING: "chatting",
  STOPPED: "stopped",
};

let msgIdCounter = 0;
function makeMsg(text, from) {
  return {
    id: ++msgIdCounter,
    text,
    from, // "me" | "stranger" | "system"
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function App() {
  const [appState, setAppState] = useState(STATE.IDLE);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [waitingPosition, setWaitingPosition] = useState(null);
  const [zone, setZone] = useState(null);
  const [partnerZone, setPartnerZone] = useState(null);
  const [locationStatus, setLocationStatus] = useState("unknown"); // "ok" | "denied" | "unknown"
  const [showReport, setShowReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const locationWatchId = useRef(null);

  // ── Socket event listeners ────────────────────────────────────────────────
  useEffect(() => {
    function onConnect() {
      setConnectionError(null);
    }

    function onConnectError(err) {
      setConnectionError("Unable to connect to server. Please try again.");
      setAppState(STATE.IDLE);
      console.error("Connection error:", err);
    }

    function onSessionCreated() {
      // Request location and send to server
      getCurrentLocation()
        .then((coords) => {
          socket.emit("location_update", coords);
          setLocationStatus("ok");
          // Start find_match after location is sent
          socket.emit("find_match");
        })
        .catch(() => {
          setLocationStatus("denied");
          // Still proceed without location
          socket.emit("find_match");
        });
    }

    function onWaiting({ position }) {
      setAppState(STATE.WAITING);
      setWaitingPosition(position);
    }

    function onMatched({ zone: z, partnerZone: pz }) {
      setAppState(STATE.CHATTING);
      setZone(z);
      setPartnerZone(pz);
      setMessages([]);
      setIsTyping(false);
    }

    function onMessage({ text, from }) {
      setMessages((prev) => [...prev, makeMsg(text, from)]);
    }

    function onTyping({ isTyping: t }) {
      setIsTyping(t);
    }

    function onPartnerDisconnected({ reason }) {
      setAppState(STATE.STOPPED);
      setMessages((prev) => [...prev, makeMsg(reason, "system")]);
      setIsTyping(false);
    }

    function onChatStopped() {
      setAppState(STATE.STOPPED);
    }

    function onAutoDisconnect({ reason }) {
      setAppState(STATE.IDLE);
      setMessages([]);
      alert(reason);
    }

    function onReportReceived() {
      setReportSent(true);
      setTimeout(() => setReportSent(false), 3000);
    }

    function onRateLimitExceeded() {
      setRateLimitWarning(true);
      setTimeout(() => setRateLimitWarning(false), 3000);
    }

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("session_created", onSessionCreated);
    socket.on("waiting", onWaiting);
    socket.on("matched", onMatched);
    socket.on("message", onMessage);
    socket.on("typing", onTyping);
    socket.on("partner_disconnected", onPartnerDisconnected);
    socket.on("chat_stopped", onChatStopped);
    socket.on("auto_disconnect", onAutoDisconnect);
    socket.on("report_received", onReportReceived);
    socket.on("rate_limit_exceeded", onRateLimitExceeded);

    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("session_created", onSessionCreated);
      socket.off("waiting", onWaiting);
      socket.off("matched", onMatched);
      socket.off("message", onMessage);
      socket.off("typing", onTyping);
      socket.off("partner_disconnected", onPartnerDisconnected);
      socket.off("chat_stopped", onChatStopped);
      socket.off("auto_disconnect", onAutoDisconnect);
      socket.off("report_received", onReportReceived);
      socket.off("rate_limit_exceeded", onRateLimitExceeded);
    };
  }, []);

  // ── Location watch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (appState === STATE.CHATTING || appState === STATE.WAITING) {
      locationWatchId.current = watchLocation((coords) => {
        socket.emit("location_update", coords);
      });
    } else {
      clearLocationWatch(locationWatchId.current);
      locationWatchId.current = null;
    }
    return () => {
      clearLocationWatch(locationWatchId.current);
    };
  }, [appState]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    setAppState(STATE.CONNECTING);
    setMessages([]);
    setConnectionError(null);
    if (!socket.connected) {
      socket.connect();
    } else {
      // Already connected — go straight to finding a match
      getCurrentLocation()
        .then((coords) => {
          socket.emit("location_update", coords);
          setLocationStatus("ok");
          socket.emit("find_match");
        })
        .catch(() => {
          setLocationStatus("denied");
          socket.emit("find_match");
        });
    }
  }, []);

  const handleNext = useCallback(() => {
    setMessages([]);
    setIsTyping(false);
    setShowReport(false);
    socket.emit("next");
    setAppState(STATE.WAITING);
  }, []);

  const handleStop = useCallback(() => {
    socket.emit("stop");
    setAppState(STATE.STOPPED);
    setIsTyping(false);
    setShowReport(false);
  }, []);

  const handleSend = useCallback((text) => {
    socket.emit("message", { text });
    setMessages((prev) => [...prev, makeMsg(text, "me")]);
  }, []);

  const handleTyping = useCallback((typing) => {
    socket.emit("typing", { isTyping: typing });
  }, []);

  const handleReport = useCallback((reason) => {
    socket.emit("report", { reason });
    setShowReport(false);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="header-title">💬 SastraChat</h1>
        {locationStatus === "ok" && (
          <span className="location-badge">📍 Location on</span>
        )}
      </header>

      {connectionError && (
        <div className="error-banner">{connectionError}</div>
      )}

      {appState === STATE.IDLE && (
        <StartScreen onStart={handleStart} isConnecting={false} />
      )}

      {appState === STATE.CONNECTING && (
        <div className="status-screen">
          <div className="spinner-large" />
          <p>Connecting…</p>
        </div>
      )}

      {appState === STATE.WAITING && (
        <div className="status-screen">
          <div className="spinner-large" />
          <p>Finding you a chat partner…</p>
          {waitingPosition && (
            <p className="queue-position">#{waitingPosition} in queue</p>
          )}
          <button className="btn btn-secondary" onClick={handleStop}>
            Cancel
          </button>
        </div>
      )}

      {(appState === STATE.CHATTING || appState === STATE.STOPPED) && (
        <div className="chat-layout">
          <ChatBox
            messages={messages}
            isTyping={isTyping}
            partnerZone={partnerZone}
            zone={zone}
          />

          {appState === STATE.CHATTING && (
            <MessageInput
              onSend={handleSend}
              onTyping={handleTyping}
              disabled={false}
            />
          )}

          {appState === STATE.STOPPED && (
            <div className="stopped-banner">
              Chat ended.{" "}
              <button className="btn btn-primary" onClick={handleNext}>
                Find new partner
              </button>
            </div>
          )}

          <div className="chat-actions">
            {appState === STATE.CHATTING && (
              <>
                <button className="btn btn-next" onClick={handleNext}>
                  Next ⏭
                </button>
                <button className="btn btn-stop" onClick={handleStop}>
                  Stop ⛔
                </button>
                <button
                  className="btn btn-report"
                  onClick={() => setShowReport((v) => !v)}
                >
                  Report 🚩
                </button>
              </>
            )}
            <button className="btn btn-secondary" onClick={handleStart}>
              New Chat
            </button>
          </div>

          {showReport && (
            <ReportModal onSubmit={handleReport} onClose={() => setShowReport(false)} />
          )}

          {reportSent && (
            <div className="toast">Report sent. Thank you!</div>
          )}

          {rateLimitWarning && (
            <div className="toast toast--warning">Slow down! You are sending too quickly.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportModal({ onSubmit, onClose }) {
  const [reason, setReason] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(reason.trim() || "No reason provided");
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>Report Stranger</h2>
        <p>Let us know why you&apos;re reporting this user.</p>
        <form onSubmit={handleSubmit}>
          <select
            className="report-select"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Select a reason…</option>
            <option value="Harassment">Harassment</option>
            <option value="Hate speech">Hate speech</option>
            <option value="Spam">Spam</option>
            <option value="Inappropriate content">Inappropriate content</option>
            <option value="Other">Other</option>
          </select>
          <div className="modal-actions">
            <button type="submit" className="btn btn-stop" disabled={!reason}>
              Submit Report
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
