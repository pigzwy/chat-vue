<script setup lang="ts">
import type { MediaTask } from '../../composables/studio/useStudioTasks'
import MediaTaskCard from './MediaTaskCard.vue'

defineProps<{
  tasks: MediaTask[]
}>()
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
    <MediaTaskCard
      v-for="task in tasks"
      :key="task.id"
      :task="task"
      class="animate-fade-scale"
    />
  </div>
</template>
