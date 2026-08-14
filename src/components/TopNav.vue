<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const isStudioRoute = computed(() => route.path.startsWith('/images') || route.path.startsWith('/studio'))
const isGalleryRoute = computed(() => route.path.startsWith('/gallery'))

const tabs = computed(() => [
  { label: '对话', icon: 'i-lucide-message-circle', to: '/', selected: !isStudioRoute.value && !isGalleryRoute.value },
  { label: '创作台', icon: 'i-lucide-wand-sparkles', to: '/studio', selected: isStudioRoute.value },
  { label: '灵感', icon: 'i-lucide-lightbulb', to: '/gallery', selected: isGalleryRoute.value }
])
</script>

<template>
  <div class="pointer-events-none fixed left-4 top-3 z-50">
    <ULink
      to="/"
      class="glass-chip pointer-events-auto inline-flex items-center gap-2 py-1.5 pl-1.5 pr-3 transition-transform hover:-translate-y-0.5"
    >
      <img
        src="/logo-mark.png"
        alt="pigcode"
        class="size-7 shrink-0 rounded-full object-cover ring-2 ring-white/70 dark:ring-white/10"
      >
      <span class="hidden text-sm font-bold tracking-tight text-highlighted sm:inline">pigcode</span>
    </ULink>
  </div>

  <nav class="pointer-events-none fixed top-3 left-1/2 z-50 -translate-x-1/2">
    <div class="glass-chip pointer-events-auto inline-flex items-center gap-1 p-1">
      <ULink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="glass-pill inline-flex h-8 items-center gap-1.5 px-3.5 text-sm font-semibold"
        :data-selected="tab.selected"
      >
        <UIcon
          :name="tab.icon"
          class="size-4"
        />
        <span class="whitespace-nowrap">{{ tab.label }}</span>
      </ULink>
    </div>
  </nav>

  <div class="pointer-events-none fixed right-4 top-3 z-50">
    <UColorModeButton
      color="neutral"
      variant="ghost"
      class="glass-chip pointer-events-auto"
    />
  </div>
</template>
