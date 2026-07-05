<template>
  <div class="h-full p-4">
    <div v-if="loading" class="flex items-center justify-center h-full">
      <span class="text-gray-400">加载图谱数据...</span>
    </div>
    <div v-else-if="nodes.length === 0" class="flex items-center justify-center h-full">
      <span class="text-gray-400">暂无图谱数据，先上传文档并入库</span>
    </div>
    <div v-else ref="container" class="w-full h-full overflow-auto border rounded-lg bg-white relative">
      <svg :width="svgWidth" :height="svgHeight">
        <!-- Edges (grey lines from events to entities) -->
        <line
          v-for="edge in edges" :key="edge.id"
          :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
          stroke="#ddd" stroke-width="1" stroke-dasharray="4,2"
        />
        <!-- Event nodes (small dots) -->
        <circle
          v-for="ev in eventNodes" :key="ev.id"
          :cx="ev.x" :cy="ev.y" r="5"
          :fill="entityColor(ev.type)" stroke="#fff" stroke-width="1"
          @mouseenter="hoveredEvent = ev" @mouseleave="hoveredEvent = null"
        />
        <!-- Entity nodes (larger circles with labels) -->
        <g v-for="node in nodes" :key="node.id" :transform="`translate(${node.x}, ${node.y})`">
          <circle :r="node.radius" :fill="entityColor(node.type)" stroke="#fff" stroke-width="2" opacity="0.85" />
          <text :y="node.radius + 14" text-anchor="middle" font-size="11" fill="#333">
            {{ truncate(node.name, 12) }}
          </text>
        </g>
      </svg>
      <!-- Tooltip -->
      <div v-if="hoveredEvent" class="absolute bg-gray-900 text-white text-xs rounded px-2 py-1 pointer-events-none" :style="{ left: hoveredEvent.x + 15 + 'px', top: hoveredEvent.y - 10 + 'px' }">
        {{ hoveredEvent.title }}
      </div>
    </div>
    <!-- Legend -->
    <div v-if="nodes.length > 0" class="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
      <span v-for="(color, type) in typeMap" :key="type" class="flex items-center gap-1">
        <span class="w-2.5 h-2.5 rounded-full" :style="{ background: color }"></span>
        {{ type }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import api from "../../api/client.js";

const props = defineProps<{ projectId: string }>();

const loading = ref(true);
const nodes = ref<any[]>([]);
const eventNodes = ref<any[]>([]);
const edges = ref<any[]>([]);
const hoveredEvent = ref<any | null>(null);
const svgWidth = ref(800);
const svgHeight = ref(600);

const typeMap: Record<string, string> = {
  person: "#f59e0b", organization: "#3b82f6", subject: "#10b981",
  location: "#ef4444", time: "#8b5cf6", product: "#ec4899",
  metric: "#06b6d4", action: "#f97316", work: "#84cc16",
  group: "#6b7280", tags: "#9ca3af",
};

function entityColor(type: string): string {
  return typeMap[type] ?? "#6b7280";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

onMounted(() => {
  if (props.projectId) loadGraph();
});

watch(() => props.projectId, () => {
  if (props.projectId) loadGraph();
});

async function loadGraph() {
  loading.value = true;
  try {
    const { data } = await api.get(`/projects/${props.projectId}/graph`);
    const graph = data.graph;
    const entities = graph.entities ?? [];

    // Layout entities in a grid
    const padding = 60;
    const cols = Math.ceil(Math.sqrt(Math.max(entities.length, 1)));
    const cellW = (800 - padding * 2) / cols;
    const cellH = 80;

    nodes.value = entities.map((e: any, i: number) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      radius: Math.min(24, 10 + Math.min(e.eventCount ?? 0, 10) * 1.4),
      x: padding + ((i % cols) + 0.5) * cellW,
      y: padding + (Math.floor(i / cols) + 0.5) * cellH,
    }));

    // Position event nodes near their connected entities
    const events = graph.events ?? [];
    const graphEdges = graph.edges ?? [];

    eventNodes.value = [];
    edges.value = [];

    for (const edge of graphEdges) {
      const entityNode = nodes.value.find(n => n.id === edge.entityId);
      if (!entityNode) continue;

      // Create or find event node
      let evNode = eventNodes.value.find(n => n.id === edge.eventId);
      if (!evNode) {
        const event = events.find((ev: any) => ev.id === edge.eventId);
        const offsetX = (Math.random() - 0.5) * 40;
        const offsetY = -30 - Math.random() * 20;
        evNode = {
          id: edge.eventId,
          title: event?.title ?? "Event",
          type: event?.type ?? "subject",
          x: entityNode.x + offsetX,
          y: entityNode.y + offsetY,
        };
        eventNodes.value.push(evNode);
      }

      edges.value.push({
        id: `${edge.entityId}-${edge.eventId}`,
        x1: entityNode.x, y1: entityNode.y,
        x2: evNode.x, y2: evNode.y,
      });
    }

    svgHeight.value = Math.max(400, padding * 2 + Math.ceil(entities.length / cols) * cellH);
  } catch {
    // Graph not available
  } finally {
    loading.value = false;
  }
}
</script>
