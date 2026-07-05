<template>
  <span :class="badgeClass" class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium">
    <span v-if="status === 'UPLOADING' || status === 'PENDING' || status === 'PARSING' || status === 'INGESTING'" class="animate-spin w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full"></span>
    {{ label }}
  </span>
  <div v-if="errorMessage" class="text-xs text-red-500 mt-1">{{ errorMessage }}</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ status: string; errorMessage?: string | null }>();

const statusMap: Record<string, { label: string; class: string }> = {
  UPLOADING: { label: "上传中", class: "bg-blue-100 text-blue-700" },
  PENDING: { label: "等待解析", class: "bg-yellow-100 text-yellow-700" },
  PARSING: { label: "解析中", class: "bg-purple-100 text-purple-700" },
  PARSED: { label: "已解析", class: "bg-green-100 text-green-700" },
  INGESTING: { label: "入库中", class: "bg-purple-100 text-purple-700" },
  READY: { label: "就绪", class: "bg-emerald-100 text-emerald-700" },
  ARCHIVED: { label: "已归档", class: "bg-gray-100 text-gray-500" },
  ERROR: { label: "失败", class: "bg-red-100 text-red-700" },
};

const label = computed(() => statusMap[props.status]?.label ?? props.status);
const badgeClass = computed(() => statusMap[props.status]?.class ?? "bg-gray-100 text-gray-700");
</script>
