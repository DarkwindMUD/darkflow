const DEFAULT_STEP_TIMEOUT_MS = 5000;

// Shortest known same-area route as [{ dir, destId }], or null.
export function findPath(fromId, toId, source) {
  const start = source.getRoom(fromId);
  const goal = source.getRoom(toId);
  if (!start || !goal || start.area !== goal.area) return null;
  if (fromId === toId) return [];

  const cameFrom = new Map([[fromId, null]]);
  const queue = [fromId];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const room = source.getRoom(id);
    if (!room || !room.exits) continue;
    for (const [dir, destId] of Object.entries(room.exits)) {
      if (!destId || cameFrom.has(destId)) continue;
      if (source.canWalkExit && !source.canWalkExit(room, dir, destId)) continue;
      if (!source.canWalkExit && room.exitDoors && room.exitDoors[dir] >= 2) continue;
      const dest = source.getRoom(destId);
      if (!dest || dest.area !== start.area) continue;
      cameFrom.set(destId, { from: id, dir });
      if (destId === toId) {
        const steps = [];
        let cursor = destId;
        while (cursor !== fromId) {
          const link = cameFrom.get(cursor);
          steps.unshift({ dir: link.dir, destId: cursor });
          cursor = link.from;
        }
        return steps;
      }
      queue.push(destId);
    }
  }
  return null;
}

/** Creates one verified, step-at-a-time speedwalk controller. */
export function createMapSpeedwalk(options = {}) {
  const schedule = options.setTimeout || setTimeout;
  const cancelTimer = options.clearTimeout || clearTimeout;
  let config = {
    source: options.source,
    send: options.send || (() => false),
    rerender: options.rerender || (() => {}),
    stepTimeoutMs: options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
  };
  let walk = null;
  let stepTimer = null;

  function configure(next = {}) {
    config = { ...config, ...next };
  }

  function activeSource() {
    return typeof config.source === 'function' ? config.source() : config.source;
  }

  function setStatus(message) {
    const source = activeSource();
    if (source && source.setMapStatus) source.setMapStatus(message);
  }

  function clearStepTimer() {
    if (stepTimer) cancelTimer(stepTimer);
    stepTimer = null;
  }

  function cancel(reason) {
    if (!walk) return;
    walk = null;
    clearStepTimer();
    if (reason) {
      setStatus('Speedwalk stopped: ' + reason);
      config.rerender();
    }
  }

  function sendStep() {
    const step = walk.steps[walk.index];
    const source = activeSource();
    if (walk.epoch && source && source.getMapEpoch
      && source.getMapEpoch() !== walk.epoch) {
      cancel('map data changed');
      return;
    }
    const current = source && source.getRoom
      ? source.getRoom(source.getCurrentRoomId()) : null;
    if (source && source.canWalkExit
      && !source.canWalkExit(current, step.dir, step.destId)) {
      cancel('route is no longer available');
      return;
    }
    const remaining = walk.steps.length - walk.index;
    setStatus('Walking to ' + walk.targetName + ' (' + remaining
      + (remaining === 1 ? ' step)' : ' steps)'));
    if (config.send(step.dir) === false) {
      cancel('command was not sent');
      return;
    }
    clearStepTimer();
    stepTimer = schedule(() => {
      stepTimer = null;
      cancel('no progress');
    }, config.stepTimeoutMs);
  }

  function start(targetId, source = activeSource()) {
    if (typeof source === 'function') source = source();
    if (!source) return false;
    const currentId = source.getCurrentRoomId();
    if (!currentId || targetId === currentId) return false;
    cancel();
    const target = source.getRoom(targetId);
    const steps = findPath(currentId, targetId, source);
    if (!steps || !steps.length) {
      setStatus('No known path to ' + ((target && target.name) || 'there') + '.');
      config.rerender();
      return false;
    }
    walk = {
      steps,
      index: 0,
      targetName: (target && target.name) || 'there',
      epoch: source.getMapEpoch ? source.getMapEpoch() : '',
    };
    sendStep();
    return true;
  }

  function notifyRoomChange(roomId) {
    if (!walk) return;
    clearStepTimer();
    const expected = walk.steps[walk.index].destId;
    if (roomId !== expected) {
      cancel('route changed');
      return;
    }
    walk.index++;
    if (walk.index >= walk.steps.length) {
      const name = walk.targetName;
      walk = null;
      setStatus('Arrived: ' + name);
      return;
    }
    sendStep();
  }

  function dispose() {
    cancel();
    clearStepTimer();
  }

  return {
    configure,
    start,
    cancel,
    notifyRoomChange,
    isSpeedwalking: () => !!walk,
    dispose,
  };
}
