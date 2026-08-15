import * as mapData from './map-data-v2.js';
import { createMapRenderer } from './map-renderer-core.js';

export { createMapRenderer } from './map-renderer-core.js';

const legacy = createMapRenderer();

export function renderMap(bodyEl, source = mapData) {
  return legacy.render(bodyEl, source);
}

if (typeof window !== 'undefined') {
  window.mapRenderDebug = () => legacy.getDebug();
}
