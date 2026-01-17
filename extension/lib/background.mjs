var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
const createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;
const RELAY_PORT = "19988";
const RELAY_URL = `ws://localhost:${RELAY_PORT}/extension`;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
let childSessions = /* @__PURE__ */ new Map();
let nextSessionId = 1;
let tabGroupQueue = Promise.resolve();
class ConnectionManager {
  constructor() {
    __publicField(this, "ws", null);
    __publicField(this, "connectionPromise", null);
  }
  async ensureConnection() {
    var _a;
    if (((_a = this.ws) == null ? void 0 : _a.readyState) === WebSocket.OPEN) {
      return;
    }
    if (store.getState().connectionState === "extension-replaced") {
      throw new Error("Connection replaced by another extension");
    }
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    this.connectionPromise = this.connect();
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }
  async connect() {
    logger.debug(`Waiting for server at http://localhost:${RELAY_PORT}...`);
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await fetch(`http://localhost:${RELAY_PORT}`, { method: "HEAD", signal: AbortSignal.timeout(2e3) });
        logger.debug("Server is available");
        break;
      } catch {
        if (attempt === maxAttempts - 1) {
          throw new Error("Server not available");
        }
        if (attempt % 5 === 0) {
          logger.debug(`Server not available, retrying... (attempt ${attempt + 1}/${maxAttempts})`);
        }
        await sleep(1e3);
      }
    }
    logger.debug("Creating WebSocket connection to:", RELAY_URL);
    const socket = new WebSocket(RELAY_URL);
    await new Promise((resolve, reject) => {
      let timeoutFired = false;
      const timeout = setTimeout(() => {
        timeoutFired = true;
        logger.debug("WebSocket connection TIMEOUT after 5 seconds");
        reject(new Error("Connection timeout"));
      }, 5e3);
      socket.onopen = () => {
        if (timeoutFired) {
          return;
        }
        logger.debug("WebSocket connected");
        clearTimeout(timeout);
        resolve();
      };
      socket.onerror = (error) => {
        logger.debug("WebSocket error during connection:", error);
        if (!timeoutFired) {
          clearTimeout(timeout);
          reject(new Error("WebSocket connection failed"));
        }
      };
      socket.onclose = (event) => {
        logger.debug("WebSocket closed during connection:", { code: event.code, reason: event.reason });
        if (!timeoutFired) {
          clearTimeout(timeout);
          reject(new Error(`WebSocket closed: ${event.reason || event.code}`));
        }
      };
    });
    this.ws = socket;
    this.ws.onmessage = async (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        logger.debug("Error parsing message:", error);
        sendMessage({ error: { code: -32700, message: `Error parsing message: ${error.message}` } });
        return;
      }
      if (message.method === "ping") {
        sendMessage({ method: "pong" });
        return;
      }
      if (message.method === "createInitialTab") {
        try {
          logger.debug("Creating initial tab for Playwright client");
          const tab = await chrome.tabs.create({ url: "about:blank", active: false });
          if (tab.id) {
            const { targetInfo, sessionId } = await attachTab(tab.id, { skipAttachedEvent: true });
            logger.debug("Initial tab created and connected:", tab.id, "sessionId:", sessionId);
            sendMessage({
              id: message.id,
              result: {
                success: true,
                tabId: tab.id,
                sessionId,
                targetInfo
              }
            });
          } else {
            throw new Error("Failed to create tab - no tab ID returned");
          }
        } catch (error) {
          logger.debug("Failed to create initial tab:", error);
          sendMessage({ id: message.id, error: error.message });
        }
        return;
      }
      const response = { id: message.id };
      try {
        response.result = await handleCommand(message);
      } catch (error) {
        logger.debug("Error handling command:", error);
        response.error = error.message;
      }
      logger.debug("Sending response:", response);
      sendMessage(response);
    };
    this.ws.onclose = (event) => {
      this.handleClose(event.reason, event.code);
    };
    this.ws.onerror = (event) => {
      logger.debug("WebSocket error:", event);
    };
    chrome.debugger.onEvent.addListener(onDebuggerEvent);
    chrome.debugger.onDetach.addListener(onDebuggerDetach);
    logger.debug("Connection established");
  }
  handleClose(reason, code) {
    try {
      const mem = performance.memory;
      if (mem) {
        const formatMB = (b) => (b / 1024 / 1024).toFixed(2) + "MB";
        logger.warn(`DISCONNECT MEMORY: used=${formatMB(mem.usedJSHeapSize)} total=${formatMB(mem.totalJSHeapSize)} limit=${formatMB(mem.jsHeapSizeLimit)}`);
      }
    } catch {
    }
    logger.warn(`DISCONNECT: WS closed code=${code} reason=${reason || "none"} stack=${getCallStack()}`);
    chrome.debugger.onEvent.removeListener(onDebuggerEvent);
    chrome.debugger.onDetach.removeListener(onDebuggerDetach);
    const { tabs } = store.getState();
    for (const [tabId] of tabs) {
      chrome.debugger.detach({ tabId }).catch((err) => {
        logger.debug("Error detaching from tab:", tabId, err.message);
      });
    }
    childSessions.clear();
    this.ws = null;
    if (reason === "Extension Replaced" || code === 4001) {
      logger.debug("Connection replaced by another extension instance");
      store.setState({
        tabs: /* @__PURE__ */ new Map(),
        connectionState: "extension-replaced",
        errorText: "Disconnected: Replaced by another extension"
      });
      return;
    }
    store.setState((state) => {
      const newTabs = new Map(state.tabs);
      for (const [tabId, tab] of newTabs) {
        newTabs.set(tabId, { ...tab, state: "connecting" });
      }
      return { tabs: newTabs, connectionState: "idle", errorText: void 0 };
    });
  }
  async maintainLoop() {
    var _a;
    while (true) {
      if (((_a = this.ws) == null ? void 0 : _a.readyState) === WebSocket.OPEN) {
        await sleep(1e3);
        continue;
      }
      if (store.getState().connectionState === "extension-replaced") {
        try {
          const response = await fetch(`http://localhost:${RELAY_PORT}/extension/status`, { method: "GET", signal: AbortSignal.timeout(2e3) });
          const data = await response.json();
          if (!data.connected) {
            store.setState({ connectionState: "idle", errorText: void 0 });
            logger.debug("Extension slot is free, cleared error state");
          } else {
            logger.debug("Extension slot still taken, will retry...");
          }
        } catch {
          logger.debug("Server not available, will retry...");
        }
        await sleep(3e3);
        continue;
      }
      const currentTabs = store.getState().tabs;
      const hasConnectedTabs = Array.from(currentTabs.values()).some((t) => t.state === "connected");
      if (hasConnectedTabs) {
        store.setState((state) => {
          const newTabs = new Map(state.tabs);
          for (const [tabId, tab] of newTabs) {
            if (tab.state === "connected") {
              newTabs.set(tabId, { ...tab, state: "connecting" });
            }
          }
          return { tabs: newTabs };
        });
      }
      try {
        await this.ensureConnection();
        store.setState({ connectionState: "connected" });
        const tabsToReattach = Array.from(store.getState().tabs.entries()).filter(([_, tab]) => tab.state === "connecting").map(([tabId]) => tabId);
        for (const tabId of tabsToReattach) {
          const currentTab = store.getState().tabs.get(tabId);
          if (!currentTab || currentTab.state !== "connecting") {
            logger.debug("Skipping reattach, tab state changed:", tabId, currentTab == null ? void 0 : currentTab.state);
            continue;
          }
          try {
            await chrome.tabs.get(tabId);
            await attachTab(tabId);
            logger.debug("Successfully re-attached tab:", tabId);
          } catch (error) {
            logger.debug("Failed to re-attach tab:", tabId, error.message);
            store.setState((state) => {
              const newTabs = new Map(state.tabs);
              newTabs.delete(tabId);
              return { tabs: newTabs };
            });
          }
        }
      } catch (error) {
        logger.debug("Connection attempt failed:", error.message);
        store.setState({ connectionState: "idle" });
      }
      await sleep(3e3);
    }
  }
}
const connectionManager = new ConnectionManager();
const store = createStore(() => ({
  tabs: /* @__PURE__ */ new Map(),
  connectionState: "idle",
  currentTabId: void 0,
  errorText: void 0
}));
globalThis.toggleExtensionForActiveTab = toggleExtensionForActiveTab;
globalThis.disconnectEverything = disconnectEverything;
globalThis.getExtensionState = () => store.getState();
function safeSerialize(arg) {
  if (arg === void 0) return "undefined";
  if (arg === null) return "null";
  if (typeof arg === "function") return `[Function: ${arg.name || "anonymous"}]`;
  if (typeof arg === "symbol") return String(arg);
  if (arg instanceof Error) return arg.stack || arg.message || String(arg);
  if (typeof arg === "object") {
    try {
      const seen = /* @__PURE__ */ new WeakSet();
      return JSON.stringify(arg, (key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
          if (value instanceof Map) return { dataType: "Map", value: Array.from(value.entries()) };
          if (value instanceof Set) return { dataType: "Set", value: Array.from(value.values()) };
        }
        return value;
      });
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}
function sendLog(level, args) {
  sendMessage({
    method: "log",
    params: { level, args: args.map(safeSerialize) }
  });
}
const logger = {
  log: (...args) => {
    console.log(...args);
    sendLog("log", args);
  },
  debug: (...args) => {
    console.debug(...args);
    sendLog("debug", args);
  },
  info: (...args) => {
    console.info(...args);
    sendLog("info", args);
  },
  warn: (...args) => {
    console.warn(...args);
    sendLog("warn", args);
  },
  error: (...args) => {
    console.error(...args);
    sendLog("error", args);
  }
};
function getCallStack() {
  const stack = new Error().stack || "";
  return stack.split("\n").slice(2, 6).join(" <- ").replace(/\s+/g, " ");
}
self.addEventListener("error", (event) => {
  const error = event.error;
  const stack = (error == null ? void 0 : error.stack) || `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
  logger.error("Uncaught error:", stack);
});
self.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const stack = (reason == null ? void 0 : reason.stack) || String(reason);
  logger.error("Unhandled promise rejection:", stack);
});
let messageCount = 0;
function sendMessage(message) {
  var _a;
  if (((_a = connectionManager.ws) == null ? void 0 : _a.readyState) === WebSocket.OPEN) {
    try {
      connectionManager.ws.send(JSON.stringify(message));
      if (++messageCount % 100 === 0) {
        checkMemory();
      }
    } catch (error) {
      console.debug("ERROR sending message:", error, "message type:", message.method || "response");
    }
  }
}
async function syncTabGroup() {
  var _a;
  try {
    const connectedTabIds = Array.from(store.getState().tabs.entries()).filter(([_, info]) => info.state === "connected").map(([tabId]) => tabId);
    const existingGroups = await chrome.tabGroups.query({ title: "playwriter" });
    if (connectedTabIds.length === 0) {
      for (const group of existingGroups) {
        const tabsInGroup2 = await chrome.tabs.query({ groupId: group.id });
        const tabIdsToUngroup = tabsInGroup2.map((t) => t.id).filter((id) => id !== void 0);
        if (tabIdsToUngroup.length > 0) {
          await chrome.tabs.ungroup(tabIdsToUngroup);
        }
        logger.debug("Cleared playwriter group:", group.id);
      }
      return;
    }
    let groupId = (_a = existingGroups[0]) == null ? void 0 : _a.id;
    if (existingGroups.length > 1) {
      const [keep, ...duplicates] = existingGroups;
      groupId = keep.id;
      for (const group of duplicates) {
        const tabsInDupe = await chrome.tabs.query({ groupId: group.id });
        const tabIdsToUngroup = tabsInDupe.map((t) => t.id).filter((id) => id !== void 0);
        if (tabIdsToUngroup.length > 0) {
          await chrome.tabs.ungroup(tabIdsToUngroup);
        }
        logger.debug("Removed duplicate playwriter group:", group.id);
      }
    }
    const allTabs = await chrome.tabs.query({});
    const tabsInGroup = allTabs.filter((t) => t.groupId === groupId && t.id !== void 0);
    const tabIdsInGroup = new Set(tabsInGroup.map((t) => t.id));
    const tabsToAdd = connectedTabIds.filter((id) => !tabIdsInGroup.has(id));
    const tabsToRemove = Array.from(tabIdsInGroup).filter((id) => !connectedTabIds.includes(id));
    if (tabsToRemove.length > 0) {
      try {
        await chrome.tabs.ungroup(tabsToRemove);
        logger.debug("Removed tabs from group:", tabsToRemove);
      } catch (e) {
        logger.debug("Failed to ungroup tabs:", tabsToRemove, e.message);
      }
    }
    if (tabsToAdd.length > 0) {
      if (groupId === void 0) {
        const newGroupId = await chrome.tabs.group({ tabIds: tabsToAdd });
        await chrome.tabGroups.update(newGroupId, { title: "playwriter", color: "green" });
        logger.debug("Created tab group:", newGroupId, "with tabs:", tabsToAdd);
      } else {
        await chrome.tabs.group({ tabIds: tabsToAdd, groupId });
        logger.debug("Added tabs to existing group:", tabsToAdd);
      }
    }
  } catch (error) {
    logger.debug("Failed to sync tab group:", error.message);
  }
}
function getTabBySessionId(sessionId) {
  for (const [tabId, tab] of store.getState().tabs) {
    if (tab.sessionId === sessionId) {
      return { tabId, tab };
    }
  }
  return void 0;
}
function getTabByTargetId(targetId) {
  for (const [tabId, tab] of store.getState().tabs) {
    if (tab.targetId === targetId) {
      return { tabId, tab };
    }
  }
  return void 0;
}
async function handleCommand(msg) {
  var _a, _b;
  if (msg.method !== "forwardCDPCommand") return;
  let targetTabId;
  let targetTab;
  if (msg.params.sessionId) {
    const found = getTabBySessionId(msg.params.sessionId);
    if (found) {
      targetTabId = found.tabId;
      targetTab = found.tab;
    }
  }
  if (!targetTab && msg.params.sessionId) {
    const parentTabId = childSessions.get(msg.params.sessionId);
    if (parentTabId) {
      targetTabId = parentTabId;
      targetTab = store.getState().tabs.get(parentTabId);
      logger.debug("Found parent tab for child session:", msg.params.sessionId, "tabId:", parentTabId);
    }
  }
  if (!targetTab && msg.params.params && "targetId" in msg.params.params && msg.params.params.targetId) {
    const found = getTabByTargetId(msg.params.params.targetId);
    if (found) {
      targetTabId = found.tabId;
      targetTab = found.tab;
      logger.debug("Found tab for targetId:", msg.params.params.targetId, "tabId:", targetTabId);
    }
  }
  const debuggee = targetTabId ? { tabId: targetTabId } : void 0;
  switch (msg.params.method) {
    case "Runtime.enable": {
      if (!debuggee) {
        throw new Error(`No debuggee found for Runtime.enable (sessionId: ${msg.params.sessionId})`);
      }
      try {
        await chrome.debugger.sendCommand(debuggee, "Runtime.disable");
        await sleep(50);
      } catch (e) {
        logger.debug("Error disabling Runtime (ignoring):", e);
      }
      return await chrome.debugger.sendCommand(debuggee, "Runtime.enable", msg.params.params);
    }
    case "Target.createTarget": {
      const url = ((_a = msg.params.params) == null ? void 0 : _a.url) || "about:blank";
      logger.debug("Creating new tab with URL:", url);
      const tab = await chrome.tabs.create({ url, active: false });
      if (!tab.id) throw new Error("Failed to create tab");
      logger.debug("Created tab:", tab.id, "waiting for it to load...");
      await sleep(100);
      const { targetInfo } = await attachTab(tab.id);
      return { targetId: targetInfo.targetId };
    }
    case "Target.closeTarget": {
      if (!targetTabId) {
        logger.log(`Target not found: ${(_b = msg.params.params) == null ? void 0 : _b.targetId}`);
        return { success: false };
      }
      await chrome.tabs.remove(targetTabId);
      return { success: true };
    }
  }
  if (!debuggee || !targetTab) {
    throw new Error(
      `No tab found for method ${msg.params.method} sessionId: ${msg.params.sessionId} params: ${JSON.stringify(msg.params.params || null)}`
    );
  }
  logger.debug("CDP command:", msg.params.method, "for tab:", targetTabId);
  const debuggerSession = {
    ...debuggee,
    sessionId: msg.params.sessionId !== targetTab.sessionId ? msg.params.sessionId : void 0
  };
  return await chrome.debugger.sendCommand(debuggerSession, msg.params.method, msg.params.params);
}
function onDebuggerEvent(source, method, params) {
  const tab = source.tabId ? store.getState().tabs.get(source.tabId) : void 0;
  if (!tab) return;
  logger.debug("Forwarding CDP event:", method, "from tab:", source.tabId);
  if (method === "Target.attachedToTarget" && (params == null ? void 0 : params.sessionId)) {
    logger.debug("Child target attached:", params.sessionId, "for tab:", source.tabId);
    childSessions.set(params.sessionId, source.tabId);
  }
  if (method === "Target.detachedFromTarget" && (params == null ? void 0 : params.sessionId)) {
    const mainTab = getTabBySessionId(params.sessionId);
    if (mainTab) {
      logger.debug("Main tab detached via CDP event:", mainTab.tabId, "sessionId:", params.sessionId);
      store.setState((state) => {
        const newTabs = new Map(state.tabs);
        newTabs.delete(mainTab.tabId);
        return { tabs: newTabs };
      });
    } else {
      logger.debug("Child target detached:", params.sessionId);
      childSessions.delete(params.sessionId);
    }
  }
  sendMessage({
    method: "forwardCDPEvent",
    params: {
      sessionId: source.sessionId || tab.sessionId,
      method,
      params
    }
  });
}
function onDebuggerDetach(source, reason) {
  const tabId = source.tabId;
  if (!tabId || !store.getState().tabs.has(tabId)) {
    logger.debug("Ignoring debugger detach event for untracked tab:", tabId);
    return;
  }
  logger.warn(`DISCONNECT: onDebuggerDetach tabId=${tabId} reason=${reason}`);
  const tab = store.getState().tabs.get(tabId);
  if (tab) {
    sendMessage({
      method: "forwardCDPEvent",
      params: {
        method: "Target.detachedFromTarget",
        params: { sessionId: tab.sessionId, targetId: tab.targetId }
      }
    });
  }
  for (const [childSessionId, parentTabId] of childSessions.entries()) {
    if (parentTabId === tabId) {
      logger.debug("Cleaning up child session:", childSessionId, "for tab:", tabId);
      childSessions.delete(childSessionId);
    }
  }
  store.setState((state) => {
    const newTabs = new Map(state.tabs);
    newTabs.delete(tabId);
    return { tabs: newTabs };
  });
  if (reason === chrome.debugger.DetachReason.CANCELED_BY_USER) {
    store.setState({ connectionState: "idle", errorText: void 0 });
  }
}
async function attachTab(tabId, { skipAttachedEvent = false } = {}) {
  const debuggee = { tabId };
  let debuggerAttached = false;
  try {
    logger.debug("Attaching debugger to tab:", tabId);
    await chrome.debugger.attach(debuggee, "1.3");
    debuggerAttached = true;
    logger.debug("Debugger attached successfully to tab:", tabId);
    await chrome.debugger.sendCommand(debuggee, "Page.enable");
    const contextMenuScript = `
      document.addEventListener('contextmenu', (e) => {
        window.__playwriter_lastRightClicked = e.target;
      }, true);
    `;
    await chrome.debugger.sendCommand(debuggee, "Page.addScriptToEvaluateOnNewDocument", { source: contextMenuScript });
    await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", { expression: contextMenuScript });
    const result = await chrome.debugger.sendCommand(
      debuggee,
      "Target.getTargetInfo"
    );
    const targetInfo = result.targetInfo;
    if (!targetInfo.url || targetInfo.url === "" || targetInfo.url === ":") {
      logger.error("WARNING: Target.attachedToTarget will be sent with empty URL! tabId:", tabId, "targetInfo:", JSON.stringify(targetInfo));
    }
    const attachOrder = nextSessionId;
    const sessionId = `pw-tab-${nextSessionId++}`;
    store.setState((state) => {
      const newTabs = new Map(state.tabs);
      newTabs.set(tabId, {
        sessionId,
        targetId: targetInfo.targetId,
        state: "connected",
        attachOrder
      });
      return { tabs: newTabs, connectionState: "connected", errorText: void 0 };
    });
    if (!skipAttachedEvent) {
      sendMessage({
        method: "forwardCDPEvent",
        params: {
          method: "Target.attachedToTarget",
          params: {
            sessionId,
            targetInfo: { ...targetInfo, attached: true },
            waitingForDebugger: false
          }
        }
      });
    }
    logger.debug("Tab attached successfully:", tabId, "sessionId:", sessionId, "targetId:", targetInfo.targetId, "url:", targetInfo.url, "skipAttachedEvent:", skipAttachedEvent);
    return { targetInfo, sessionId };
  } catch (error) {
    if (debuggerAttached) {
      logger.debug("Cleaning up debugger after partial attach failure:", tabId);
      chrome.debugger.detach(debuggee).catch(() => {
      });
    }
    throw error;
  }
}
function detachTab(tabId, shouldDetachDebugger) {
  const tab = store.getState().tabs.get(tabId);
  if (!tab) {
    logger.debug("detachTab: tab not found in map:", tabId);
    return;
  }
  logger.warn(`DISCONNECT: detachTab tabId=${tabId} shouldDetach=${shouldDetachDebugger} stack=${getCallStack()}`);
  if (tab.sessionId && tab.targetId) {
    sendMessage({
      method: "forwardCDPEvent",
      params: {
        method: "Target.detachedFromTarget",
        params: { sessionId: tab.sessionId, targetId: tab.targetId }
      }
    });
  }
  store.setState((state) => {
    const newTabs = new Map(state.tabs);
    newTabs.delete(tabId);
    return { tabs: newTabs };
  });
  for (const [childSessionId, parentTabId] of childSessions.entries()) {
    if (parentTabId === tabId) {
      logger.debug("Cleaning up child session:", childSessionId, "for tab:", tabId);
      childSessions.delete(childSessionId);
    }
  }
  {
    chrome.debugger.detach({ tabId }).catch((err) => {
      logger.debug("Error detaching debugger from tab:", tabId, err.message);
    });
  }
}
async function connectTab(tabId) {
  try {
    logger.debug(`Starting connection to tab ${tabId}`);
    store.setState((state) => {
      const newTabs = new Map(state.tabs);
      newTabs.set(tabId, { state: "connecting" });
      return { tabs: newTabs };
    });
    await connectionManager.ensureConnection();
    await attachTab(tabId);
    logger.debug(`Successfully connected to tab ${tabId}`);
  } catch (error) {
    logger.debug(`Failed to connect to tab ${tabId}:`, error);
    const isWsError = error.message === "Server not available" || error.message === "Connection timeout" || error.message === "Connection replaced by another extension" || error.message.startsWith("WebSocket");
    if (isWsError) {
      logger.debug(`WS connection failed, keeping tab ${tabId} in connecting state for retry`);
    } else {
      store.setState((state) => {
        const newTabs = new Map(state.tabs);
        newTabs.set(tabId, { state: "error", errorText: `Error: ${error.message}` });
        return { tabs: newTabs };
      });
    }
  }
}
async function disconnectTab(tabId) {
  logger.debug(`Disconnecting tab ${tabId}`);
  const { tabs } = store.getState();
  if (!tabs.has(tabId)) {
    logger.debug("Tab not in tabs map, ignoring disconnect");
    return;
  }
  detachTab(tabId, true);
}
async function toggleExtensionForActiveTab() {
  var _a;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!(tab == null ? void 0 : tab.id)) throw new Error("No active tab found");
  await onActionClicked(tab);
  await new Promise((resolve) => {
    const check = () => {
      const state2 = store.getState();
      const tabInfo = state2.tabs.get(tab.id);
      if ((tabInfo == null ? void 0 : tabInfo.state) === "connecting") {
        setTimeout(check, 100);
        return;
      }
      resolve();
    };
    check();
  });
  const state = store.getState();
  const isConnected = state.tabs.has(tab.id) && ((_a = state.tabs.get(tab.id)) == null ? void 0 : _a.state) === "connected";
  return { isConnected, state };
}
async function disconnectEverything() {
  tabGroupQueue = tabGroupQueue.then(async () => {
    const { tabs } = store.getState();
    for (const tabId of tabs.keys()) {
      await disconnectTab(tabId);
    }
  });
  await tabGroupQueue;
}
async function resetDebugger() {
  let targets = await chrome.debugger.getTargets();
  targets = targets.filter((x) => x.tabId && x.attached);
  logger.log(`found ${targets.length} existing debugger targets. detaching them before background script starts`);
  for (const target of targets) {
    await chrome.debugger.detach({ tabId: target.tabId });
  }
}
function isRestrictedUrl(url) {
  if (!url) return false;
  const restrictedPrefixes = ["chrome://", "chrome-extension://", "devtools://", "edge://", "https://chrome.google.com/", "https://chromewebstore.google.com/"];
  return restrictedPrefixes.some((prefix) => url.startsWith(prefix));
}
const icons = {
  connected: {
    path: {
      "16": "/icons/icon-green-16.png",
      "32": "/icons/icon-green-32.png",
      "48": "/icons/icon-green-48.png",
      "128": "/icons/icon-green-128.png"
    },
    title: "Connected - Click to disconnect",
    badgeText: "",
    badgeColor: [64, 64, 64, 255]
  },
  connecting: {
    path: {
      "16": "/icons/icon-gray-16.png",
      "32": "/icons/icon-gray-32.png",
      "48": "/icons/icon-gray-48.png",
      "128": "/icons/icon-gray-128.png"
    },
    title: "Waiting for MCP WS server...",
    badgeText: "...",
    badgeColor: [64, 64, 64, 255]
  },
  idle: {
    path: {
      "16": "/icons/icon-black-16.png",
      "32": "/icons/icon-black-32.png",
      "48": "/icons/icon-black-48.png",
      "128": "/icons/icon-black-128.png"
    },
    title: "Click to attach debugger",
    badgeText: "",
    badgeColor: [64, 64, 64, 255]
  },
  restricted: {
    path: {
      "16": "/icons/icon-gray-16.png",
      "32": "/icons/icon-gray-32.png",
      "48": "/icons/icon-gray-48.png",
      "128": "/icons/icon-gray-128.png"
    },
    title: "Cannot attach to this page",
    badgeText: "",
    badgeColor: [64, 64, 64, 255]
  },
  extensionReplaced: {
    path: {
      "16": "/icons/icon-gray-16.png",
      "32": "/icons/icon-gray-32.png",
      "48": "/icons/icon-gray-48.png",
      "128": "/icons/icon-gray-128.png"
    },
    title: "Replaced by another extension - Click to retry",
    badgeText: "!",
    badgeColor: [220, 38, 38, 255]
  },
  tabError: {
    path: {
      "16": "/icons/icon-gray-16.png",
      "32": "/icons/icon-gray-32.png",
      "48": "/icons/icon-gray-48.png",
      "128": "/icons/icon-gray-128.png"
    },
    title: "Error",
    badgeText: "!",
    badgeColor: [220, 38, 38, 255]
  }
};
async function updateIcons() {
  const state = store.getState();
  const { connectionState, tabs, errorText } = state;
  const connectedCount = Array.from(tabs.values()).filter((t) => t.state === "connected").length;
  const allTabs = await chrome.tabs.query({});
  const tabUrlMap = new Map(allTabs.map((tab) => [tab.id, tab.url]));
  const allTabIds = [void 0, ...allTabs.map((tab) => tab.id).filter((id) => id !== void 0)];
  for (const tabId of allTabIds) {
    const tabInfo = tabId !== void 0 ? tabs.get(tabId) : void 0;
    const tabUrl = tabId !== void 0 ? tabUrlMap.get(tabId) : void 0;
    const iconConfig = (() => {
      if (connectionState === "extension-replaced") return icons.extensionReplaced;
      if (tabId !== void 0 && isRestrictedUrl(tabUrl)) return icons.restricted;
      if ((tabInfo == null ? void 0 : tabInfo.state) === "error") return icons.tabError;
      if ((tabInfo == null ? void 0 : tabInfo.state) === "connecting") return icons.connecting;
      if ((tabInfo == null ? void 0 : tabInfo.state) === "connected") return icons.connected;
      return icons.idle;
    })();
    const title = (() => {
      if (connectionState === "extension-replaced" && errorText) return errorText;
      if (tabInfo == null ? void 0 : tabInfo.errorText) return tabInfo.errorText;
      return iconConfig.title;
    })();
    const badgeText = (() => {
      if (iconConfig === icons.connected || iconConfig === icons.idle || iconConfig === icons.restricted) {
        return connectedCount > 0 ? String(connectedCount) : "";
      }
      return iconConfig.badgeText;
    })();
    void chrome.action.setIcon({ tabId, path: iconConfig.path });
    void chrome.action.setTitle({ tabId, title });
    if (iconConfig.badgeColor) void chrome.action.setBadgeBackgroundColor({ tabId, color: iconConfig.badgeColor });
    void chrome.action.setBadgeText({ tabId, text: badgeText });
  }
}
async function onTabRemoved(tabId) {
  const { tabs } = store.getState();
  if (!tabs.has(tabId)) return;
  logger.debug(`Connected tab ${tabId} was closed, disconnecting`);
  await disconnectTab(tabId);
}
async function onTabActivated(activeInfo) {
  store.setState({ currentTabId: activeInfo.tabId });
}
async function onActionClicked(tab) {
  if (!tab.id) {
    logger.debug("No tab ID available");
    return;
  }
  if (isRestrictedUrl(tab.url)) {
    logger.debug("Cannot attach to restricted URL:", tab.url);
    return;
  }
  const { tabs, connectionState } = store.getState();
  const tabInfo = tabs.get(tab.id);
  if (connectionState === "extension-replaced") {
    logger.debug("Clearing extension-replaced state, connecting clicked tab");
    store.setState({ connectionState: "idle", errorText: void 0 });
    await connectTab(tab.id);
    return;
  }
  if ((tabInfo == null ? void 0 : tabInfo.state) === "error") {
    logger.debug("Tab has error - disconnecting to clear state");
    await disconnectTab(tab.id);
    return;
  }
  if ((tabInfo == null ? void 0 : tabInfo.state) === "connecting") {
    logger.debug("Tab is already connecting, ignoring click");
    return;
  }
  if ((tabInfo == null ? void 0 : tabInfo.state) === "connected") {
    await disconnectTab(tab.id);
  } else {
    await connectTab(tab.id);
  }
}
resetDebugger();
connectionManager.maintainLoop();
chrome.contextMenus.remove("playwriter-pin-element").catch(() => {
}).finally(() => {
  chrome.contextMenus.create({
    id: "playwriter-pin-element",
    title: "Copy Playwriter Element Reference",
    contexts: ["all"],
    visible: false
  });
});
function updateContextMenuVisibility() {
  var _a;
  const { currentTabId, tabs } = store.getState();
  const isConnected = currentTabId !== void 0 && ((_a = tabs.get(currentTabId)) == null ? void 0 : _a.state) === "connected";
  chrome.contextMenus.update("playwriter-pin-element", { visible: isConnected });
}
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.tabs.create({ url: "welcome.html" });
  }
});
function serializeTabs(tabs) {
  return JSON.stringify(Array.from(tabs.entries()));
}
store.subscribe((state, prevState) => {
  logger.log(state);
  void updateIcons();
  updateContextMenuVisibility();
  const tabsChanged = serializeTabs(state.tabs) !== serializeTabs(prevState.tabs);
  if (tabsChanged) {
    tabGroupQueue = tabGroupQueue.then(syncTabGroup).catch((e) => {
      logger.debug("syncTabGroup error:", e);
    });
  }
});
logger.debug(`Using relay URL: ${RELAY_URL}`);
let lastMemoryUsage = 0;
let lastMemoryCheck = Date.now();
const MEMORY_WARNING_THRESHOLD = 50 * 1024 * 1024;
const MEMORY_CRITICAL_THRESHOLD = 100 * 1024 * 1024;
const MEMORY_GROWTH_THRESHOLD = 10 * 1024 * 1024;
function checkMemory() {
  try {
    const memory = performance.memory;
    if (!memory) {
      return;
    }
    const used = memory.usedJSHeapSize;
    const total = memory.totalJSHeapSize;
    const limit = memory.jsHeapSizeLimit;
    const now = Date.now();
    const timeDelta = now - lastMemoryCheck;
    const memoryDelta = used - lastMemoryUsage;
    const formatMB = (bytes) => (bytes / 1024 / 1024).toFixed(2) + "MB";
    const growthRate = timeDelta > 0 ? memoryDelta / timeDelta * 1e3 : 0;
    if (used > MEMORY_CRITICAL_THRESHOLD) {
      logger.error(`MEMORY CRITICAL: used=${formatMB(used)} total=${formatMB(total)} limit=${formatMB(limit)} growth=${formatMB(memoryDelta)} rate=${formatMB(growthRate)}/s`);
    } else if (used > MEMORY_WARNING_THRESHOLD) {
      logger.warn(`MEMORY WARNING: used=${formatMB(used)} total=${formatMB(total)} limit=${formatMB(limit)} growth=${formatMB(memoryDelta)} rate=${formatMB(growthRate)}/s`);
    } else if (memoryDelta > MEMORY_GROWTH_THRESHOLD && timeDelta < 6e4) {
      logger.warn(`MEMORY SPIKE: grew ${formatMB(memoryDelta)} in ${(timeDelta / 1e3).toFixed(1)}s (used=${formatMB(used)})`);
    }
    lastMemoryUsage = used;
    lastMemoryCheck = now;
  } catch (e) {
  }
}
setInterval(checkMemory, 5e3);
checkMemory();
chrome.tabs.onRemoved.addListener(onTabRemoved);
chrome.tabs.onActivated.addListener(onTabActivated);
chrome.action.onClicked.addListener(onActionClicked);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void updateIcons();
  if (changeInfo.groupId !== void 0) {
    tabGroupQueue = tabGroupQueue.then(async () => {
      var _a;
      const existingGroups = await chrome.tabGroups.query({ title: "playwriter" });
      const groupId = (_a = existingGroups[0]) == null ? void 0 : _a.id;
      if (groupId === void 0) {
        return;
      }
      const { tabs } = store.getState();
      if (changeInfo.groupId === groupId) {
        if (!tabs.has(tabId) && !isRestrictedUrl(tab.url)) {
          logger.debug("Tab manually added to playwriter group:", tabId);
          await connectTab(tabId);
        }
      } else if (tabs.has(tabId)) {
        const tabInfo = tabs.get(tabId);
        if ((tabInfo == null ? void 0 : tabInfo.state) === "connecting") {
          logger.debug("Tab removed from group while connecting, ignoring:", tabId);
          return;
        }
        logger.debug("Tab manually removed from playwriter group:", tabId);
        await disconnectTab(tabId);
      }
    }).catch((e) => {
      logger.debug("onTabUpdated handler error:", e);
    });
  }
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "playwriter-pin-element" || !(tab == null ? void 0 : tab.id)) return;
  const tabInfo = store.getState().tabs.get(tab.id);
  if (!tabInfo || tabInfo.state !== "connected") {
    logger.debug("Tab not connected, ignoring");
    return;
  }
  const debuggee = { tabId: tab.id };
  const count = (tabInfo.pinnedCount || 0) + 1;
  store.setState((state) => {
    const newTabs = new Map(state.tabs);
    const existing = newTabs.get(tab.id);
    if (existing) {
      newTabs.set(tab.id, { ...existing, pinnedCount: count });
    }
    return { tabs: newTabs };
  });
  const name = `playwriterPinnedElem${count}`;
  const connectedTabs = Array.from(store.getState().tabs.entries()).filter(([_, t]) => t.state === "connected").sort((a, b) => (a[1].attachOrder ?? 0) - (b[1].attachOrder ?? 0));
  const pageIndex = connectedTabs.findIndex(([id]) => id === tab.id);
  const hasMultiplePages = connectedTabs.length > 1;
  try {
    const result = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: `
        if (window.__playwriter_lastRightClicked) {
          window.${name} = window.__playwriter_lastRightClicked;
          '${name}';
        } else {
          throw new Error('No element was right-clicked');
        }
      `,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      logger.error("Failed to pin element:", result.exceptionDetails.text);
      return;
    }
    const clipboardText = hasMultiplePages ? `globalThis.${name} (page ${pageIndex}, ${tab.url || "unknown url"})` : `globalThis.${name}`;
    await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: `
        (() => {
          const el = window.${name};
          if (!el) return;
          const orig = el.getAttribute('style') || '';
          el.setAttribute('style', orig + '; outline: 3px solid #22c55e !important; outline-offset: 2px !important; box-shadow: 0 0 0 3px #22c55e !important;');
          setTimeout(() => el.setAttribute('style', orig), 300);
          return navigator.clipboard.writeText(${JSON.stringify(clipboardText)});
        })()
      `,
      awaitPromise: true
    });
    logger.debug("Pinned element as:", name);
  } catch (error) {
    logger.error("Failed to pin element:", error.message);
  }
});
void updateIcons();
