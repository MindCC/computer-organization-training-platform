import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";

export function CircuitBridgeEdge(props) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data } = props;
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const markers = data?.bridgeMarkers ?? [];

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        {markers.map((marker, index) => (
          <span
            aria-label="导线相交但不连接"
            className="wire-bridge-marker"
            key={id + "-" + index}
            style={{ transform: "translate(-50%, -50%) translate(" + marker.x + "px, " + marker.y + "px)" }}
            title="导线相交但不连接"
          />
        ))}
      </EdgeLabelRenderer>
    </>
  );
}
