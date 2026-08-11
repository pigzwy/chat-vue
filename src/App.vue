<script setup lang="ts">
import { computed } from 'vue'
import { useHead } from '@unhead/vue'
import { useColorMode } from '@vueuse/core'
import { useRoute } from 'vue-router'

const route = useRoute()
const colorMode = useColorMode()
const themeColor = computed(() => colorMode.value === 'dark' ? '#0b0c11' : '#f3f4f7')
const title = computed(() => {
  if (route.path.startsWith('/studio') || route.path.startsWith('/images')) return '创作台 - PIG Code'
  if (route.path.startsWith('/gallery')) return '灵感 - PIG Code'
  return '对话 - PIG Code'
})

useHead({
  title,
  meta: [
    { name: 'theme-color', content: themeColor }
  ]
})
</script>

<template>
  <Suspense>
    <UApp :toaster="{ position: 'top-right' }">
      <RouterView />
    </UApp>
  </Suspense>
</template>
