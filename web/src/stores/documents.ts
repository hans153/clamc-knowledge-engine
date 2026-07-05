import { defineStore } from "pinia";
import { ref } from "vue";
import api from "../api/client.js";

export interface KnowledgeDocument {
  id: string;
  projectId: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  version: number;
  status: string;
  errorMessage?: string | null;
  markdownContent?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const useDocumentsStore = defineStore("documents", () => {
  const documents = ref<KnowledgeDocument[]>([]);
  const loading = ref(false);

  async function fetchDocuments(projectId: string) {
    loading.value = true;
    try {
      const { data } = await api.get(`/projects/${projectId}/documents`);
      documents.value = data.documents;
    } finally {
      loading.value = false;
    }
  }

  async function uploadDocument(projectId: string, file: File): Promise<KnowledgeDocument> {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post(`/projects/${projectId}/documents/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    documents.value.unshift(data.document);
    return data.document;
  }

  async function getMarkdown(documentId: string): Promise<{ markdown: string; version: number }> {
    const { data } = await api.get(`/documents/${documentId}/markdown`);
    return data;
  }

  async function updateMarkdown(documentId: string, markdown: string) {
    await api.put(`/documents/${documentId}/markdown`, { markdown });
  }

  async function startIngest(documentId: string) {
    await api.post(`/documents/${documentId}/ingest`);
  }

  async function archiveDocument(documentId: string) {
    await api.post(`/documents/${documentId}/archive`);
    documents.value = documents.value.filter(d => d.id !== documentId);
  }

  return { documents, loading, fetchDocuments, uploadDocument, getMarkdown, updateMarkdown, startIngest, archiveDocument };
});
