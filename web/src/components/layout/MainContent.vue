<template>
  <div class="flex-1 flex flex-col min-w-0">
    <div v-if="!projectsStore.activeProjectId" class="flex-1 flex items-center justify-center text-gray-400">
      请选择或创建一个知识库
    </div>
    <template v-else>
      <!-- Tabs -->
      <div class="flex border-b bg-white px-4 gap-0 flex-shrink-0">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === tab.id
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab content -->
      <div class="flex-1 overflow-auto">
        <DocumentList v-if="activeTab === 'documents'" :projectId="projectsStore.activeProjectId" />
        <ChatView v-else-if="activeTab === 'chat'" :projectId="projectsStore.activeProjectId" />
        <KnowledgeGraph v-else-if="activeTab === 'graph'" :projectId="projectsStore.activeProjectId" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useProjectsStore } from "../../stores/projects.js";
import DocumentList from "../documents/DocumentList.vue";
import ChatView from "../chat/ChatView.vue";
import KnowledgeGraph from "../graph/KnowledgeGraph.vue";

const projectsStore = useProjectsStore();

const tabs = [
  { id: "documents" as const, label: "文档" },
  { id: "chat" as const, label: "问答" },
  { id: "graph" as const, label: "图谱" },
];
const activeTab = ref<"documents" | "chat" | "graph">("documents");
</script>
