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
      className="bg-[repeating-linear-gradient(0deg,rgba(24,24,27,0.06),rgba(24,24,27,0.06)_2px,transparent_2px,transparent_24px),repeating-linear-gradient(90deg,rgba(24,24,27,0.06),rgba(24,24,27,0.06)_2px,transparent_2px,transparent_24px)] dark:bg-[repeating-linear-gradient(0deg,rgba(228,228,231,0.08),rgba(228,228,231,0.08)_2px,transparent_2px,transparent_24px),repeating-linear-gradient(90deg,rgba(228,228,231,0.08),rgba(228,228,231,0.08)_2px,transparent_2px,transparent_24px)]"
      proOptions={{ hideAttribution: true }}
    >
      <MiniMap zoomable pannable className="!border-2 !border-zinc-900 !bg-white !shadow-[3px_3px_0_0_rgb(24,24,27)] dark:!border-zinc-100 dark:!bg-zinc-900 dark:!shadow-[3px_3px_0_0_rgb(0,0,0)]" />
      <Controls className="[&_button]:!border-2 [&_button]:!border-zinc-900 [&_button]:!bg-white [&_button]:!shadow-[2px_2px_0_0_rgb(24,24,27)] [&_button]:hover:!translate-y-[-1px] [&_button]:hover:!shadow-none dark:[&_button]:!border-zinc-100 dark:[&_button]:!bg-zinc-900 dark:[&_button]:!shadow-[2px_2px_0_0_rgb(0,0,0)]" />
      <Background gap={24} size={2} color="#27272a" />
    </ReactFlow>
  );
}
