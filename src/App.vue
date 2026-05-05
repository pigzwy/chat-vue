<script setup lang="ts">
import { computed } from 'vue'
import { useHead } from '@unhead/vue'
import { useColorMode } from '@vueuse/core'
import { useRoute } from 'vue-router'

const route = useRoute()
const colorMode = useColorMode()
const themeColor = computed(() => colorMode.value === 'dark' ? '#111118' : '#faf8f5')
const title = computed(() => {
  if (route.path.startsWith('/images')) return '画图 - PIG Coder'
  if (route.path.startsWith('/gallery')) return '案例观摩馆 - PIG Coder'
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
