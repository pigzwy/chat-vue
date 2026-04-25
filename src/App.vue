<script setup lang="ts">
import { computed } from 'vue'
import { useHead } from '@unhead/vue'
import { useColorMode } from '@vueuse/core'
import { useRoute } from 'vue-router'

const route = useRoute()
const colorMode = useColorMode()
const themeColor = computed(() => colorMode.value === 'dark' ? '#0D1B2A' : '#EEF2F7')
const title = computed(() => route.path.startsWith('/images') ? '画图 - PIG Coder' : '对话 - PIG Coder')

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
