<template>
  <div :class="['flex gap-3', message.role === 'user' ? 'justify-end' : '']">
    <div v-if="message.role === 'assistant'" class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">AI</div>
    <div :class="[
      'max-w-[75%] rounded-lg px-4 py-2.5 text-sm',
      message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
    ]">
      <div v-html="renderMarkdown(message.content)" class="prose prose-sm max-w-none"></div>
      <!-- Citations -->
      <div v-if="message.citations?.length" class="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-500">
        <details>
          <summary class="cursor-pointer">引用来源 ({{ message.citations.length }})</summary>
          <div v-for="(c, i) in message.citations" :key="i" class="mt-1 pl-2 border-l-2 border-gray-300">
            <span v-if="c.heading" class="font-medium">{{ c.heading }}</span>
            <p class="text-gray-400">{{ c.content }}</p>
          </div>
        </details>
      </div>
    </div>
    <div v-if="message.role === 'user'" class="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-sm flex-shrink-0">U</div>
  </div>
</template>

<script setup lang="ts">
import { marked } from "marked";
import type { ChatMessage as ChatMessageType } from "../../stores/chat.js";

defineProps<{ message: ChatMessageType }>();

function renderMarkdown(text: string): string {
  return marked.parse(text || "") as string;
}
</script>
