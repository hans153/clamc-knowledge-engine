<template>
  <div v-if="!auth.isAuthenticated" class="h-screen flex items-center justify-center">
    <router-view />
  </div>
  <div v-else class="h-screen flex">
    <NavBar />
    <SideBar />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useAuthStore } from "./stores/auth.js";
import NavBar from "./components/layout/NavBar.vue";
import SideBar from "./components/layout/SideBar.vue";

const auth = useAuthStore();

onMounted(() => {
  auth.fetchMe();
});
</script>
