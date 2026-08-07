<script setup lang="ts">
import { onBeforeMount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// 旧画图页已合并进创作台，保留此路由做重定向，避免旧链接/书签失效。
const router = useRouter()
const route = useRoute()

onBeforeMount(() => {
  void router.replace({ path: '/studio', query: route.query })
})
</script>

<template>
  <div class="flex flex-1 items-center justify-center">
    <UIcon
      name="i-lucide-loader-circle"
      class="size-5 animate-spin text-muted"
    />
  </div>
</template>
