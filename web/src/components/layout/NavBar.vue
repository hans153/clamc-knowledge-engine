<template>
  <nav class="w-14 bg-gray-900 flex flex-col items-center py-4 gap-4 flex-shrink-0">
    <router-link to="/knowledge" class="nav-icon" title="知识库">
      <span class="text-xl">📚</span>
    </router-link>
    <div class="flex-1" />
  </nav>
</template>

<style scoped>
.nav-icon {
  @apply w-10 h-10 flex items-center justify-center rounded-lg text-white hover:bg-gray-700 transition-colors;
}
</style>
