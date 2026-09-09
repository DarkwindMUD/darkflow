export type FloatingBounds = { height: number; left: number; top: number; width: number };

export const FLOATING_SNAP_DISTANCE = 24;
export const FLOATING_SNAP_GAP = 6;

const overlaps = (start: number, end: number, otherStart: number, otherEnd: number) =>
  end >= otherStart - FLOATING_SNAP_DISTANCE && otherEnd >= start - FLOATING_SNAP_DISTANCE;

export function attractFloatingResize<T extends FloatingBounds>(
  left: number,
  top: number,
  proposedRight: number,
  proposedBottom: number,
  others: readonly T[],
): { bottom: number; right: number; target?: T } {
  let right = proposedRight;
  let bottom = proposedBottom;
  let target: T | undefined;
  let nearestRight = FLOATING_SNAP_DISTANCE + 1;
  let nearestBottom = FLOATING_SNAP_DISTANCE + 1;

  for (const other of others) {
    const otherRight = other.left + other.width;
    const otherBottom = other.top + other.height;
    if (overlaps(top, proposedBottom, other.top, otherBottom)) {
      for (const candidate of [other.left - FLOATING_SNAP_GAP, otherRight]) {
        const distance = Math.abs(proposedRight - candidate);
        if (distance < nearestRight && distance <= FLOATING_SNAP_DISTANCE) {
          nearestRight = distance;
          right = candidate;
          target = other;
        }
      }
    }
    if (overlaps(left, proposedRight, other.left, otherRight)) {
      for (const candidate of [other.top - FLOATING_SNAP_GAP, otherBottom]) {
        const distance = Math.abs(proposedBottom - candidate);
        if (distance < nearestBottom && distance <= FLOATING_SNAP_DISTANCE) {
          nearestBottom = distance;
          bottom = candidate;
          target = other;
        }
      }
    }
  }

  return { bottom, right, ...(target ? { target } : {}) };
}
