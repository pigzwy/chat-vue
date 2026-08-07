<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useRoute, useRouter } from 'vue-router'
import ModalConfirm from '../components/ModalConfirm.vue'
import TopNav from '../components/TopNav.vue'
import { useChats } from '../composables/useChats'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const overlay = useOverlay()
const { groups, fetchChats, deleteChat: deleteLocalChat } = useChats()

await fetchChats()

const open = ref(false)
const isCreationRoute = computed(() =>
  route.path.startsWith('/images')
  || route.path.startsWith('/studio')
  || route.path.startsWith('/gallery')
)

const deleteModal = overlay.create(ModalConfirm, {
  props: {
    title: '删除对话',
    description: '确定要删除这个对话吗？删除后无法恢复。'
  }
})

const items = computed(() => groups.value?.flatMap((group) => {
  return [{
    label: group.label,
    type: 'label' as const
  }, ...group.items.map(item => ({
    ...item,
    slot: 'chat' as const,
    icon: undefined,
    class: item.label === 'Untitled' ? 'text-muted' : ''
  }))]
}))

async function deleteChat(id: string) {
  const instance = deleteModal.open()
  const result = await instance.result
  if (!result) {
    return
  }

  deleteLocalChat(id)

  toast.add({
    title: '对话已删除',
    description: '已从本地对话列表中移除',
    icon: 'i-lucide-trash'
  })

  await fetchChats()

  if ((route as RouteLocationNormalizedLoaded<'/chat/[id]'>).params?.id === id) {
    router.push('/')
  }
}

defineShortcuts({
  c: () => {
    router.push('/')
  }
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <TopNav />

    <UDashboardSidebar
      v-if="!isCreationRoute"
      id="default"
      v-model:open="open"
      :min-size="12"
      collapsible
      resizable
      class="border-r-0 px-2 pb-4 pt-20"
      :ui="{ root: 'bg-transparent', body: 'gap-3' }"
    >
      <template #default="{ collapsed }">
        <div
          v-if="!collapsed"
          class="flex items-center gap-2"
        >
          <UDashboardSearchButton
            collapsed
            class="shrink-0"
          />
          <UButton
            icon="i-lucide-plus"
            label="新建对话"
            color="neutral"
            variant="soft"
            to="/"
            class="glass-btn shrink-0 rounded-full px-4 font-semibold"
            @click="open = false"
          />
        </div>

        <div
          v-else
          class="flex flex-col gap-1.5"
        >
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="soft"
            block
            to="/"
            class="glass-btn rounded-full"
            aria-label="新建对话"
            @click="open = false"
          />
          <UDashboardSearchButton collapsed />
        </div>

        <UNavigationMenu
          v-if="!collapsed"
          :items="items"
          :collapsed="collapsed"
          orientation="vertical"
          :ui="{ link: 'overflow-hidden rounded-xl border border-transparent transition-all hover:border-default hover:bg-muted data-[active=true]:border-transparent data-[active=true]:bg-primary data-[active=true]:text-inverted data-[active=true]:shadow-lg' }"
        >
          <template #chat-trailing="{ item }">
            <div class="flex -mr-1.25 translate-x-full group-hover:translate-x-0 transition-transform">
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                class="text-muted hover:text-primary hover:bg-accented/50 focus-visible:bg-accented/50 p-0.5"
                aria-label="删除对话"
                tabindex="-1"
                @click.stop.prevent="deleteChat((item as any).id)"
              />
            </div>
          </template>
        </UNavigationMenu>
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      v-if="!isCreationRoute"
      placeholder="搜索对话..."
      :groups="[{
        id: 'links',
        items: [{
          label: '新建对话',
          to: '/',
          icon: 'i-lucide-square-pen'
        }]
      }, ...groups]"
    />

    <div
      class="flex-1 flex min-w-0 overflow-hidden"
      :class="isCreationRoute ? 'mt-18' : 'glass-panel glass-panel--lg aurora-shell mx-4 mb-4 mt-18 lg:ml-0'"
    >
      <RouterView :key="route.path" />
    </div>
  </UDashboardGroup>
</template>
