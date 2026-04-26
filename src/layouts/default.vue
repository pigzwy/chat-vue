<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useRoute, useRouter } from 'vue-router'
import ModalConfirm from '../components/ModalConfirm.vue'
import { useChats } from '../composables/useChats'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const overlay = useOverlay()
const { groups, fetchChats, deleteChat: deleteLocalChat } = useChats()

await fetchChats()

const open = ref(false)
const isImagesRoute = computed(() => route.path.startsWith('/images'))

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
    <div class="pointer-events-none fixed left-4 top-3 z-50">
      <ULink
        to="/"
        class="warm-chip pointer-events-auto inline-flex items-center gap-1.5 py-1.5 pl-1.5 pr-2 sm:pr-3"
      >
        <img
          src="/logo-mark.jpg"
          alt="pigcoder"
          class="size-7 shrink-0 rounded-full object-cover"
        >
        <span class="hidden text-sm font-semibold text-highlighted sm:inline">pigcoder</span>
      </ULink>
    </div>

    <div class="pointer-events-none fixed top-3 left-1/2 z-50 -translate-x-1/2">
      <div class="warm-chip pointer-events-auto inline-flex items-center p-0.5">
        <UButton
          to="/"
          label="对话"
          icon="i-lucide-message-circle"
          size="sm"
          color="neutral"
          variant="ghost"
          class="h-8 rounded-full px-3.5 font-medium"
          :class="!isImagesRoute ? 'warm-btn' : ''"
          :style="!isImagesRoute ? 'border:none;box-shadow:none' : ''"
        />
        <UButton
          to="/images"
          label="画图"
          icon="i-lucide-image"
          size="sm"
          color="neutral"
          variant="ghost"
          class="h-8 rounded-full px-3.5 font-medium"
          :class="isImagesRoute ? 'warm-btn' : ''"
          :style="isImagesRoute ? 'border:none;box-shadow:none' : ''"
        />
      </div>
    </div>

    <div class="pointer-events-none fixed right-4 top-3 z-50">
      <UColorModeButton
        color="neutral"
        variant="ghost"
        class="warm-chip pointer-events-auto"
      />
    </div>

    <UDashboardSidebar
      v-if="!isImagesRoute"
      id="default"
      v-model:open="open"
      :min-size="12"
      collapsible
      resizable
      class="border-r-0 px-2 pb-4 pt-20"
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
            label="New chat"
            color="neutral"
            variant="soft"
            to="/"
            class="shrink-0 rounded-xl font-semibold"
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
            class="rounded-xl"
            aria-label="New chat"
            @click="open = false"
          />
          <UDashboardSearchButton collapsed />
        </div>

        <UNavigationMenu
          v-if="!collapsed"
          :items="items"
          :collapsed="collapsed"
          orientation="vertical"
          :ui="{ link: 'overflow-hidden rounded-xl data-[active=true]:bg-[var(--warm-accent)] data-[active=true]:text-white' }"
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

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      v-if="!isImagesRoute"
      placeholder="Search chats..."
      :groups="[{
        id: 'links',
        items: [{
          label: 'New chat',
          to: '/',
          icon: 'i-lucide-square-pen'
        }]
      }, ...groups]"
    />

    <div
      class="flex-1 flex min-w-0 overflow-hidden"
      :class="isImagesRoute ? 'mt-18' : 'warm-card mx-4 mb-4 mt-18 lg:ml-0'"
    >
      <RouterView :key="route.path" />
    </div>
  </UDashboardGroup>
</template>
