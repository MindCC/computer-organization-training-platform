const EPSILON = 0.001;

function pointForNode(nodesById, id) {
  const node = nodesById.get(id);
  if (!node) return null;
  return {
    x: Number(node.position?.x ?? 0),
    y: Number(node.position?.y ?? 0),
  };
}

function between(value, start, end) {
  return value >= Math.min(start, end) + 8 && value <= Math.max(start, end) - 8;
}

function segmentIntersection(a, b, c, d) {
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < EPSILON) return null;

  const px = ((a.x * b.y - a.y * b.x) * (c.x - d.x) - (a.x - b.x) * (c.x * d.y - c.y * d.x)) / denominator;
  const py = ((a.x * b.y - a.y * b.x) * (c.y - d.y) - (a.y - b.y) * (c.x * d.y - c.y * d.x)) / denominator;

  if (!between(px, a.x, b.x) || !between(py, a.y, b.y) || !between(px, c.x, d.x) || !between(py, c.y, d.y)) return null;
  return { x: px, y: py };
}

function sharesEndpoint(first, second) {
  return first.source === second.source
    || first.source === second.target
    || first.target === second.source
    || first.target === second.target;
}

export function findWireBridgeMarkers(edges = [], nodes = []) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const segments = edges
    .map((edge) => ({ edge, start: pointForNode(nodesById, edge.source), end: pointForNode(nodesById, edge.target) }))
    .filter((item) => item.start && item.end);
  const markers = [];

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (sharesEndpoint(segments[i].edge, segments[j].edge)) continue;
      const crossing = segmentIntersection(segments[i].start, segments[i].end, segments[j].start, segments[j].end);
      if (!crossing) continue;
      markers.push({ edgeId: segments[i].edge.id, ...crossing });
      markers.push({ edgeId: segments[j].edge.id, ...crossing });
    }
  }

  return markers;
}
