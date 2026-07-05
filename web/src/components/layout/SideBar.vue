<template>
  <aside class="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
    <div class="p-4 border-b flex items-center justify-between">
      <h2 class="font-semibold text-gray-700">知识库</h2>
      <button @click="showCreate = true" class="text-blue-600 hover:text-blue-800 text-lg leading-none" title="新建知识库">+</button>
    </div>

    <!-- Create project dialog -->
    <div v-if="showCreate" class="p-3 border-b bg-gray-50">
      <input v-model="newName" placeholder="知识库名称" class="w-full px-2 py-1 border rounded text-sm mb-2" @keyup.enter="handleCreate" />
      <div class="flex gap-2">
        <button @click="handleCreate" class="text-xs bg-blue-600 text-white px-2 py-1 rounded">创建</button>
        <button @click="showCreate = false" class="text-xs text-gray-500 px-2 py-1">取消</button>
      </div>
    </div>

    <!-- Project list -->
    <div class="flex-1 overflow-y-auto">
      <div
        v-for="p in projectsStore.projects"
        :key="p.id"
        @click="projectsStore.selectProject(p.id)"
        :class="[
          'px-4 py-2.5 cursor-pointer text-sm border-l-2 transition-colors',
          p.id === projectsStore.activeProjectId
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-transparent hover:bg-gray-50 text-gray-700'
        ]"
      >
        {{ p.name }}
      </div>
      <div v-if="projectsStore.projects.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
        暂无知识库，点击 + 创建
      </div>
    </div>

    <!-- User info -->
    <div class="p-3 border-t">
      <span class="text-sm text-gray-500 truncate block">{{ auth.user?.email ?? '' }}</span>
      <button @click="handleLogout" class="text-sm text-red-500 hover:underline mt-1">退出登录</button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth.js";
import { useProjectsStore } from "../../stores/projects.js";

const router = useRouter();
const auth = useAuthStore();
const projectsStore = useProjectsStore();

const showCreate = ref(false);
const newName = ref("");

// Load projects on mount
projectsStore.fetchProjects();

async function handleCreate() {
  if (!newName.value.trim()) return;
  await projectsStore.createProject(newName.value.trim());
  newName.value = "";
  showCreate.value = false;
}

function handleLogout() {
  auth.logout();
  router.push("/login");
}
</script>
