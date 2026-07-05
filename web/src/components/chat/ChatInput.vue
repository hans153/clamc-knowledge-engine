<template>
  <div class="border-t p-4 bg-white">
    <form @submit.prevent="handleSend" class="flex gap-2">
      <input
        v-model="input"
        :disabled="disabled"
        placeholder="输入问题，按 Enter 发送..."
        class="flex-1 px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
      />
      <button
        type="submit"
        :disabled="disabled || !input.trim()"
        class="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        发送
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ send: [content: string] }>();

const input = ref("");

function handleSend() {
  if (!input.value.trim()) return;
  emit("send", input.value.trim());
  input.value = "";
}
</script>
