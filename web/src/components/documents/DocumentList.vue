<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h3 class="text-lg font-semibold">文档管理</h3>
      <label class="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 text-sm">
        上传文档
        <input type="file" accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp" class="hidden" @change="handleUpload" />
      </label>
    </div>

    <p v-if="uploadError" class="text-red-500 text-sm mb-3">{{ uploadError }}</p>

    <!-- Document table -->
    <div v-if="docs.documents.length > 0" class="bg-white rounded-lg border overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b bg-gray-50 text-left text-sm text-gray-600">
            <th class="px-4 py-3 font-medium">文件名</th>
            <th class="px-4 py-3 font-medium">状态</th>
            <th class="px-4 py-3 font-medium">版本</th>
            <th class="px-4 py-3 font-medium">上传时间</th>
            <th class="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in docs.documents" :key="doc.id" class="border-b hover:bg-gray-50">
            <td class="px-4 py-3">
              <div class="font-medium text-sm">{{ doc.fileName }}</div>
              <div class="text-xs text-gray-400">{{ formatSize(doc.fileSize) }}</div>
            </td>
            <td class="px-4 py-3">
              <ParseStatusBadge :status="doc.status" :errorMessage="doc.errorMessage" />
            </td>
            <td class="px-4 py-3 text-sm text-gray-500">v{{ doc.version }}</td>
            <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(doc.createdAt) }}</td>
            <td class="px-4 py-3">
              <div class="flex gap-2">
                <button v-if="doc.status === 'PARSED'" @click="openEditor(doc.id)" class="text-xs text-blue-600 hover:underline">预览编辑</button>
                <button v-if="doc.status === 'PARSED'" @click="handleIngest(doc.id)" class="text-xs text-green-600 hover:underline">入库</button>
                <button v-if="doc.status === 'ERROR'" @click="handleReparse(doc.id)" class="text-xs text-orange-600 hover:underline">重试</button>
                <button @click="handleArchive(doc.id)" class="text-xs text-red-500 hover:underline">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="!docs.loading" class="text-center py-16 text-gray-400">
      <p class="text-lg mb-2">暂无文档</p>
      <p class="text-sm">上传 PDF、Word、PPT 或图片文件开始构建知识库</p>
    </div>

    <div v-else class="text-center py-16 text-gray-400">
      <p>加载中...</p>
    </div>

    <!-- Markdown editor modal -->
    <MarkdownEditor v-if="editingDocId" :documentId="editingDocId" @close="editingDocId = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useDocumentsStore } from "../../stores/documents.js";
import ParseStatusBadge from "./ParseStatusBadge.vue";
import MarkdownEditor from "./MarkdownEditor.vue";
import api from "../../api/client.js";

const props = defineProps<{ projectId: string }>();
const docs = useDocumentsStore();
const uploadError = ref("");
const editingDocId = ref<string | null>(null);

onMounted(() => {
  if (props.projectId) docs.fetchDocuments(props.projectId);
});

watch(() => props.projectId, (id) => {
  if (id) docs.fetchDocuments(id);
});

async function handleUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploadError.value = "";
  try {
    await docs.uploadDocument(props.projectId, file);
  } catch (err: any) {
    uploadError.value = err.response?.data?.error?.message || "上传失败";
  }
}

async function handleIngest(documentId: string) {
  await docs.startIngest(documentId);
  docs.fetchDocuments(props.projectId);
}

async function handleReparse(documentId: string) {
  await api.post(`/documents/${documentId}/reparse`);
  docs.fetchDocuments(props.projectId);
}

async function handleArchive(documentId: string) {
  if (!confirm("确定要删除此文档吗？")) return;
  await docs.archiveDocument(documentId);
}

function openEditor(documentId: string) {
  editingDocId.value = documentId;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN");
}
</script>
