const RECONNECT_FALLBACK_MS = 5000;

/** Session-owned authority/fallback selector over injected map instances. */
export function createLiveMapSource(options) {
  const darkwindMap = options.darkwindMap;
  const gmcpMap = options.gmcpMap;
  const getIdentity = options.getIdentity || (() => ({}));
  const notifySourceChanged = options.notifySourceChanged || (() => {});
  const schedule = (...args) => (options.setTimeout || setTimeout)(...args);
  const cancel = (...args) => (options.clearTimeout || clearTimeout)(...args);
  let mode = 'auto';
  let endpointKey = '';
  let reconnectFallbackTimer = null;
  let reconnectFallbackToken = 0;

  const connectionKey = (identity = {}) =>
    identity.worldKey || [identity.host || '', identity.port || ''].join('@');

  function clearReconnectFallback() {
    reconnectFallbackToken++;
    if (reconnectFallbackTimer) cancel(reconnectFallbackTimer);
    reconnectFallbackTimer = null;
  }

  function armReconnectFallback() {
    clearReconnectFallback();
    if (mode !== 'darkwind' || !darkwindMap.hasCurrentRoom()) return;
    const fallbackToken = ++reconnectFallbackToken;
    reconnectFallbackTimer = schedule(() => {
      if (fallbackToken !== reconnectFallbackToken) return;
      reconnectFallbackTimer = null;
      if (mode !== 'darkwind' || darkwindMap.hasLiveCurrent()) return;
      mode = 'auto';
      notifySourceChanged();
    }, options.reconnectFallbackMs ?? RECONNECT_FALLBACK_MS);
    if (reconnectFallbackTimer && typeof reconnectFallbackTimer.unref === 'function') {
      reconnectFallbackTimer.unref();
    }
  }

  function getLiveMapSource() {
    return mode === 'darkwind' && darkwindMap.hasCurrentRoom() ? darkwindMap : gmcpMap;
  }

  function resetLiveMapModeForConnection() {
    const identity = getIdentity();
    const nextEndpointKey = connectionKey(identity);
    const endpointChanged = !!endpointKey && endpointKey !== nextEndpointKey;
    endpointKey = nextEndpointKey;
    clearReconnectFallback();
    if (endpointChanged) mode = 'auto';

    const darkwindLoad = darkwindMap.configureWorld(identity);
    const genericLoad = gmcpMap.configureWorld(identity);
    darkwindMap.resetForConnection();
    gmcpMap.resetForConnection();
    if (!endpointChanged) armReconnectFallback();
    return Promise.all([Promise.resolve(darkwindLoad), Promise.resolve(genericLoad)]);
  }

  function disposeLiveMapSourceLifecycle() {
    clearReconnectFallback();
    mode = 'auto';
  }

  function markMapData2Active() {
    if (!darkwindMap.hasLiveCurrent()) return;
    clearReconnectFallback();
    mode = 'darkwind';
  }

  function markMapData2Unavailable(data = {}) {
    if (data.code === 'current_unavailable' && data.reason === 'grid_reflow') return false;
    clearReconnectFallback();
    mode = 'auto';
    notifySourceChanged();
    return true;
  }

  function processGenericHello(data) {
    gmcpMap.processHello(data, getIdentity());
  }

  function processGenericRoomInfo(data) {
    return gmcpMap.processRoomInfo(data);
  }

  return {
    getLiveMapSource,
    resetLiveMapModeForConnection,
    disposeLiveMapSourceLifecycle,
    markMapData2Active,
    markMapData2Unavailable,
    processGenericHello,
    processGenericRoomInfo,
    notifyLiveRoomChange: (roomId) => roomId,
  };
}
