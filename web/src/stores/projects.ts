import { defineStore } from "pinia";
import { ref, computed } from "vue";
import api from "../api/client";

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
}

export const useProjectsStore = defineStore("projects", () => {
  const projects = ref<Project[]>([]);
  const activeProjectId = ref<string | null>(null);
  const activeProject = computed(() => projects.value.find(p => p.id === activeProjectId.value) ?? null);

  async function fetchProjects() {
    const { data } = await api.get("/projects");
    projects.value = data.projects;
    if (!activeProjectId.value && projects.value.length > 0) {
      activeProjectId.value = projects.value[0].id;
    }
  }

  async function createProject(name: string, description?: string) {
    const { data } = await api.post("/projects", { name, description });
    projects.value.unshift(data.project);
    activeProjectId.value = data.project.id;
    return data.project;
  }

  function selectProject(projectId: string) {
    activeProjectId.value = projectId;
  }

  return { projects, activeProjectId, activeProject, fetchProjects, createProject, selectProject };
});
