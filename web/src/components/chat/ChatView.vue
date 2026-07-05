<template>
  <div class="flex h-full">
    <!-- Session sidebar -->
    <div class="w-56 border-r bg-gray-50 flex flex-col flex-shrink-0">
      <div class="p-3 border-b">
        <button @click="handleNewSession" class="w-full bg-blue-600 text-white text-sm py-1.5 rounded hover:bg-blue-700">
          + 新对话
        </button>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div
          v-for="s in chat.sessions"
          :key="s.id"
          @click="selectSession(s.id)"
          :class="[
            'px-3 py-2 text-sm cursor-pointer truncate border-l-2',
            s.id === chat.activeSessionId
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-transparent hover:bg-gray-100 text-gray-700'
          ]"
        >
          {{ s.title }}
        </div>
      </div>
    </div>

    <!-- Chat area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Messages -->
      <div ref="msgContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
        <div v-if="chat.messages.length === 0" class="text-center py-20 text-gray-400">
          <p class="text-lg mb-2">开始对话</p>
          <p class="text-sm">向知识库提问，获取基于文档的回答</p>
        </div>
        <ChatMessage v-for="(msg, i) in chat.messages" :key="i" :message="msg" />
        <div v-if="chat.streaming" class="text-sm text-gray-400 animate-pulse">思考中...</div>
      </div>

      <!-- Input -->
      <ChatInput :disabled="chat.streaming" @send="handleSend" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from "vue";
import { useChatStore } from "../../stores/chat.js";
import ChatMessage from "./ChatMessage.vue";
import ChatInput from "./ChatInput.vue";

const props = defineProps<{ projectId: string }>();
const chat = useChatStore();
const msgContainer = ref<HTMLElement>();

onMounted(() => {
  if (props.projectId) chat.fetchSessions(props.projectId);
});

watch(() => props.projectId, (id) => {
  if (id) chat.fetchSessions(id);
});

async function selectSession(sessionId: string) {
  chat.activeSessionId = sessionId;
  await chat.fetchMessages(sessionId);
  scrollToBottom();
}

async function handleNewSession() {
  await chat.createSession(props.projectId);
  scrollToBottom();
}

async function handleSend(content: string) {
  if (!chat.activeSessionId) {
    await chat.createSession(props.projectId);
  }
  await chat.sendMessage(chat.activeSessionId!, content, () => {
    scrollToBottom();
  });
}

function scrollToBottom() {
  nextTick(() => {
    if (msgContainer.value) {
      msgContainer.value.scrollTop = msgContainer.value.scrollHeight;
    }
  });
}
</script>
