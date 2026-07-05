<template>
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
    <div class="bg-white rounded-lg w-full h-full max-w-6xl flex flex-col">
      <div class="flex items-center justify-between px-4 py-3 border-b">
        <h3 class="font-semibold">Markdown 编辑器</h3>
        <button @click="saveAndClose" class="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 mr-2">保存</button>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div v-if="loading" class="flex-1 flex items-center justify-center text-gray-400">加载中...</div>
      <div v-else class="flex-1 flex overflow-hidden">
        <!-- Preview pane -->
        <div class="flex-1 overflow-auto p-4 border-r" v-html="rendered"></div>
        <!-- Edit pane -->
        <textarea v-model="markdown" class="flex-1 p-4 font-mono text-sm resize-none border-none focus:outline-none"></textarea>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { marked } from "marked";
import { useDocumentsStore } from "../../stores/documents.js";

const props = defineProps<{ documentId: string }>();
const emit = defineEmits<{ close: [] }>();

const docs = useDocumentsStore();
const markdown = ref("");
const loading = ref(true);

onMounted(async () => {
  const data = await docs.getMarkdown(props.documentId);
  markdown.value = data.markdown;
  loading.value = false;
});

const rendered = computed(() => marked.parse(markdown.value || ""));

async function saveAndClose() {
  await docs.updateMarkdown(props.documentId, markdown.value);
  emit("close");
}
</script>
