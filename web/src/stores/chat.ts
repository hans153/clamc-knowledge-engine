import { defineStore } from "pinia";
import { ref } from "vue";
import api from "../api/client.js";

export interface ChatSession {
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: string;
}

export interface Citation {
  chunkId: string;
  heading?: string;
  content: string;
  score: number;
}

export const useChatStore = defineStore("chat", () => {
  const sessions = ref<ChatSession[]>([]);
  const activeSessionId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const streaming = ref(false);

  async function fetchSessions(projectId: string) {
    const { data } = await api.get(`/projects/${projectId}/chat/sessions`);
    sessions.value = data.sessions;
  }

  async function createSession(projectId: string, title?: string) {
    const { data } = await api.post(`/projects/${projectId}/chat/sessions`, { title });
    sessions.value.unshift(data.session);
    activeSessionId.value = data.session.id;
    messages.value = [];
    return data.session;
  }

  async function fetchMessages(sessionId: string) {
    const { data } = await api.get(`/chat/sessions/${sessionId}`);
    messages.value = data.messages;
  }

  async function sendMessage(sessionId: string, content: string, onChunk: (text: string) => void): Promise<void> {
    streaming.value = true;
    // Add user message immediately
    messages.value.push({ id: "", role: "user", content, createdAt: new Date().toISOString() });
    // Placeholder for assistant
    const assistantIdx = messages.value.length;
    messages.value.push({ id: "", role: "assistant", content: "", createdAt: "" });

    const token = localStorage.getItem("token");
    const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const line of buffer.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              messages.value[assistantIdx].content += data.content;
              onChunk(data.content);
            }
          } catch {}
        }
      }
      buffer = "";
    }

    streaming.value = false;
    // Refresh messages to get proper IDs
    await fetchMessages(sessionId);
  }

  return { sessions, activeSessionId, messages, streaming, fetchSessions, createSession, fetchMessages, sendMessage };
});
