<script setup lang="ts">
import { computed } from 'vue'
import { useHead } from '@unhead/vue'
import { useColorMode } from '@vueuse/core'
import { useRoute } from 'vue-router'

const route = useRoute()
const colorMode = useColorMode()
const themeColor = computed(() => colorMode.value === 'dark' ? '#0c0d14' : '#f2f3f8')
const title = computed(() => {
  if (route.path.startsWith('/studio') || route.path.startsWith('/images')) return '创作台 - PIG Coder'
  if (route.path.startsWith('/gallery')) return '灵感 - PIG Coder'
  return '对话 - PIG Coder'
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
