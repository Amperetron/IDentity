/**
 * store.js - API-based Shared Persistence & Offline-First Sync
 * Agent B - Shared Contract: window.Store
 *
 * Capabilities:
 * - Room-based multi-tenant isolation via URL parameter (?room=...) or CONFIG.ROOM
 * - pull(): Calls GET /api/blocks?room=..., returning array of blocks
 * - push(block): Calls POST /api/blocks, with conflict detection on HTTP 409
 * - subscribe(cb): Lightweight multi-tab sync over /api/blocks
 * - isOnline(): Connection status indicator
 * - Offline fallback: If /api is unreachable, gracefully operates from localStorage
 * - Integrated Room Banner, "Share Room" button, and Online/Offline badge
 */

(function () {
  "use strict";

  let isOnlineState = false;
  const realtimeListeners = [];
  let pollingTimer = null;
  let lastKnownChainLength = 0;

  /**
   * Determine active room from URL param ?room=, CONFIG.ROOM, or default
   */
  function getRoom() {
    if (typeof window !== "undefined" && window.location && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const r = params.get("room");
        if (r && r.trim().length > 0) {
          return r.trim();
        }
      } catch (e) {}
    }
    if (typeof window !== "undefined" && window.CONFIG && window.CONFIG.ROOM) {
      return String(window.CONFIG.ROOM).trim();
    }
    return "public-demo";
  }

  let currentRoom = getRoom();

  /**
   * Initialize Store module
   */
  function init() {
    currentRoom = getRoom();
    setupWindowEvents();
    renderRoomUI();
    return Store;
  }

  /**
   * Pull all blocks for the current room via GET /api/blocks?room=...
   * If /api is unreachable, falls back to localStorage (returns null, never throws).
   * @returns {Promise<Array<object>|null>}
   */
  async function pull() {
    if (typeof fetch !== "function") {
      isOnlineState = false;
      updateUI();
      return null;
    }

    try {
      const endpoint = "/api/blocks?room=" + encodeURIComponent(currentRoom);
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });

      if (!res.ok) {
        // Non-200 response (404, 500, etc.) -> fall back to localStorage
        isOnlineState = false;
        updateUI();
        return null;
      }

      const json = await res.json();
      let blocks = [];
      if (Array.isArray(json)) {
        blocks = json.map(r => (r && r.block) ? r.block : r);
      } else if (json && Array.isArray(json.blocks)) {
        blocks = json.blocks.map(r => (r && r.block) ? r.block : r);
      } else {
        isOnlineState = false;
        updateUI();
        return null;
      }

      isOnlineState = true;
      lastKnownChainLength = blocks.length;
      updateUI();
      return blocks;
    } catch (e) {
      // Network failure, file:// protocol, or unreachable /api
      isOnlineState = false;
      updateUI();
      return null;
    }
  }

  /**
   * Push a block (or array of blocks) via POST /api/blocks
   * Handles unique conflict (HTTP 409) by throwing conflict error for ledger retry.
   * If /api is unreachable, falls back to localStorage without throwing unhandled error.
   * @param {object|Array<object>} blockOrBlocks
   * @returns {Promise<object>}
   */
  async function push(blockOrBlocks) {
    if (!blockOrBlocks) {
      throw new Error("Store.push: Missing block argument");
    }

    const isArray = Array.isArray(blockOrBlocks);
    const blocks = isArray ? blockOrBlocks : [blockOrBlocks];

    if (typeof fetch !== "function") {
      isOnlineState = false;
      updateUI();
      return { success: false, offline: true };
    }

    try {
      let lastRes = null;
      for (const b of blocks) {
        const payload = {
          room: currentRoom,
          idx: b.index,
          block: b
        };

        const res = await fetch("/api/blocks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        // 1. Conflict detection on HTTP 409
        if (res.status === 409) {
          const errJson = await res.json().catch(() => ({}));
          const conflictErr = new Error(errJson.error || errJson.message || "Conflict on (room, idx)");
          conflictErr.code = "23505";
          conflictErr.conflict = true;
          conflictErr.status = 409;
          throw conflictErr;
        }

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          if (errJson.code === "23505" || errJson.conflict || (errJson.error && errJson.error.includes("conflict"))) {
            const conflictErr = new Error(errJson.error || "Conflict on (room, idx)");
            conflictErr.code = "23505";
            conflictErr.conflict = true;
            conflictErr.status = 409;
            throw conflictErr;
          }
          isOnlineState = false;
          updateUI();
          return { success: false, offline: true, status: res.status, error: errJson };
        }

        lastRes = await res.json().catch(() => null);
      }

      isOnlineState = true;
      updateUI();
      return { success: true, data: lastRes };
    } catch (err) {
      // Re-throw conflict errors for Ledger conflict resolution & retry
      if (err.conflict || err.code === "23505" || err.status === 409) {
        throw err;
      }
      // If /api is unreachable, fall back gracefully to localStorage
      isOnlineState = false;
      updateUI();
      return { success: false, offline: true, error: err };
    }
  }

  /**
   * Subscribe to block updates for the current room
   * @param {Function} cb - Callback invoked with (block)
   */
  function subscribe(cb) {
    if (typeof cb !== "function") return;
    realtimeListeners.push(cb);
    startPollingSync();
  }

  /**
   * Periodic polling sync over /api/blocks for multi-tab synchronization
   */
  function startPollingSync() {
    if (pollingTimer || typeof window === "undefined") return;

    async function checkUpdates() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const blocks = await pull();
        if (blocks && Array.isArray(blocks)) {
          if (lastKnownChainLength > 0 && blocks.length > lastKnownChainLength) {
            const newBlocks = blocks.slice(lastKnownChainLength);
            lastKnownChainLength = blocks.length;
            newBlocks.forEach(b => {
              realtimeListeners.forEach(fn => {
                try { fn(b); } catch (e) {}
              });
            });
          } else {
            lastKnownChainLength = blocks.length;
          }
        }
      } catch (e) {}
    }

    if (typeof setInterval === "function") {
      pollingTimer = setInterval(checkUpdates, 5000);
    }
    if (typeof window.addEventListener === "function") {
      window.addEventListener("focus", checkUpdates);
    }
  }

  /**
   * Returns current online status
   */
  function isOnline() {
    return Boolean(isOnlineState);
  }

  /**
   * Returns full URL for sharing this room
   */
  function getShareUrl() {
    if (typeof window === "undefined" || !window.location) return "";
    const origin = window.location.origin || "";
    const pathname = window.location.pathname || "";
    return origin + pathname + "?room=" + encodeURIComponent(currentRoom);
  }

  /**
   * Updates Online/Offline UI elements in document
   */
  function updateUI() {
    if (typeof document === "undefined") return;

    // 1. Header Badge pill
    let syncBadge = document.getElementById("store-sync-status-badge");
    if (!syncBadge) {
      const headerBadges = document.querySelector(".header-badges");
      if (headerBadges) {
        syncBadge = document.createElement("div");
        syncBadge.id = "store-sync-status-badge";
        syncBadge.className = "badge-pill";
        headerBadges.appendChild(syncBadge);
      }
    }

    if (syncBadge) {
      if (isOnlineState) {
        syncBadge.innerHTML = '<span class="badge-dot dot-green"></span><span class="badge-label">Cloud: Online</span>';
        syncBadge.title = "Connected to /api shared persistence (Room: " + currentRoom + ")";
      } else {
        syncBadge.innerHTML = '<span class="badge-dot dot-amber"></span><span class="badge-label">Offline (local only)</span>';
        syncBadge.title = "Offline mode active: ledger changes will stay in local storage.";
      }
    }

    // 2. Room Banner connection indicator
    const connPill = document.getElementById("store-connection-pill");
    if (connPill) {
      if (isOnlineState) {
        connPill.style.background = "#DCFCE7";
        connPill.style.color = "#166534";
        connPill.innerHTML = '<span style="width: 6px; height: 6px; border-radius: 50%; background: #16A34A; display: inline-block;"></span> Online';
      } else {
        connPill.style.background = "#FEF3C7";
        connPill.style.color = "#92400E";
        connPill.innerHTML = '<span style="width: 6px; height: 6px; border-radius: 50%; background: #D97706; display: inline-block;"></span> Offline (local only)';
      }
    }
  }

  /**
   * Renders the Room Banner & Share Room controls
   */
  function renderRoomUI() {
    if (typeof document === "undefined") return;

    if (document.getElementById("store-room-bar")) {
      updateUI();
      return;
    }

    const header = document.querySelector("header.gov-header");
    if (!header) return;

    const banner = document.createElement("div");
    banner.id = "store-room-bar";
    banner.style.cssText = "background: #F8FAFC; border-bottom: 1px solid #E2E8F0; padding: 6px 0; font-size: 0.8rem;";
    banner.innerHTML = '<div class="gov-container" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">' +
      '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
        '<span style="font-weight: 700; color: #0B3C5D; display: inline-flex; align-items: center; gap: 4px;">' +
          '<svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>' +
          'Shared Persistence Room:' +
        '</span>' +
        '<span id="store-current-room-name" style="font-family: var(--font-mono, monospace); font-weight: 700; color: #0F172A; background: #FFFFFF; border: 1px solid #CBD5E1; padding: 2px 8px; border-radius: 4px;">' +
          escapeHtml(currentRoom) +
        '</span>' +
        '<span id="store-connection-pill" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; padding: 2px 8px; border-radius: 9999px; background: #DCFCE7; color: #166534; font-weight: 600;">' +
          '<span style="width: 6px; height: 6px; border-radius: 50%; background: #16A34A; display: inline-block;"></span> Online' +
        '</span>' +
      '</div>' +
      '<div style="display: flex; align-items: center; gap: 8px;">' +
        '<button id="btn-share-room" class="btn btn-outline btn-sm" style="padding: 3px 10px; font-size: 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #CBD5E1; background: #FFFFFF; border-radius: 4px; font-weight: 600; color: #0B3C5D;">🔗 Share Room</button>' +
        '<button id="btn-switch-room" class="btn btn-outline btn-sm" style="padding: 3px 10px; font-size: 0.75rem; cursor: pointer; border: 1px solid #CBD5E1; background: #FFFFFF; border-radius: 4px; font-weight: 500; color: #475569;">Switch Room</button>' +
      '</div>' +
    '</div>';

    header.parentNode.insertBefore(banner, header.nextSibling);

    const btnShare = document.getElementById("btn-share-room");
    if (btnShare) {
      btnShare.addEventListener("click", () => {
        const shareUrl = getShareUrl();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).then(() => {
            flashButtonText(btnShare, "✓ Copied Link!");
          }).catch(() => {
            promptCopy(shareUrl);
          });
        } else {
          promptCopy(shareUrl);
        }
      });
    }

    const btnSwitch = document.getElementById("btn-switch-room");
    if (btnSwitch) {
      btnSwitch.addEventListener("click", () => {
        const next = prompt("Enter room name to switch to:", currentRoom);
        if (next && next.trim().length > 0 && next.trim() !== currentRoom) {
          const url = new URL(window.location.href);
          url.searchParams.set("room", next.trim());
          window.location.href = url.toString();
        }
      });
    }

    updateUI();
  }

  function flashButtonText(btn, text) {
    const original = btn.innerHTML;
    btn.innerHTML = text;
    btn.style.color = "#166534";
    setTimeout(() => {
      btn.innerHTML = original;
      btn.style.color = "#0B3C5D";
    }, 2500);
  }

  function promptCopy(text) {
    window.prompt("Copy room link to share with other browsers or tabs:", text);
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function(m) {
      switch (m) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#039;";
        default: return m;
      }
    });
  }

  function setupWindowEvents() {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    window.addEventListener("online", () => {
      isOnlineState = true;
      updateUI();
    });
    window.addEventListener("offline", () => {
      isOnlineState = false;
      updateUI();
    });
  }

  // Public Store API
  const Store = {
    init: init,
    pull: pull,
    push: push,
    subscribe: subscribe,
    isOnline: isOnline,
    getRoom: () => currentRoom,
    getShareUrl: getShareUrl,
    renderUI: renderRoomUI
  };

  window.Store = Store;

  // Initialize
  init();
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        init();
        renderRoomUI();
      });
    } else {
      renderRoomUI();
    }
  }
})();
