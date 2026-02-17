"use client";

import "@xyflow/react/dist/style.css";

import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";

type FlowNodeData = {
  label: string;
  taskId?: string;
};

export function MindmapFlow({
  nodes,
  edges,
  onNodeClick
}: {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  onNodeClick: (event: React.MouseEvent, node: Node<FlowNodeData>) => void;
}) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      minZoom={0.35}
      maxZoom={1.8}
      onNodeClick={onNodeClick}
      proOptions={{ hideAttribution: true }}
    >
      <MiniMap zoomable pannable />
      <Controls />
      <Background gap={18} size={1} />
    </ReactFlow>
  );
}
