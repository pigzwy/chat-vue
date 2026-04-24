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
    title: 'Delete chat',
    description: 'Are you sure you want to delete this chat? This cannot be undone.'
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
    title: 'Chat deleted',
    description: 'Your chat has been deleted',
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
    <div class="pointer-events-none fixed top-3 left-1/2 z-50 -translate-x-1/2">
      <div class="pointer-events-auto inline-flex items-center rounded-full bg-default/95 p-1 ring ring-default shadow-sm backdrop-blur">
        <UButton
          to="/"
          label="对话"
          icon="i-lucide-message-circle"
          size="sm"
          color="neutral"
          :variant="isImagesRoute ? 'ghost' : 'solid'"
          class="rounded-full px-4"
        />
        <UButton
          to="/images"
          label="画图"
          icon="i-lucide-image"
          size="sm"
          color="neutral"
          :variant="isImagesRoute ? 'solid' : 'ghost'"
          class="rounded-full px-4"
        />
      </div>
    </div>

    <div class="pointer-events-none fixed right-4 top-3 z-50">
      <UColorModeButton
        color="neutral"
        variant="ghost"
        class="pointer-events-auto rounded-full bg-default/95 ring ring-default shadow-sm backdrop-blur"
      />
    </div>

    <UDashboardSidebar
      v-if="!isImagesRoute"
      id="default"
      v-model:open="open"
      :min-size="12"
      collapsible
      resizable
      class="border-r-0 pt-4 pb-4"
    >
      <template #header="{ collapsed }">
        <ULink
          to="/"
          class="flex items-center gap-2"
        >
          <img
            src="/logo-mark.svg"
            alt="pigcoder"
            class="size-7 shrink-0 rounded-md object-contain"
          >
          <span
            v-if="!collapsed"
            class="text-xl font-bold text-highlighted"
          >pigcoder</span>
        </ULink>
      </template>

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
            variant="soft"
            to="/"
            class="shrink-0"
            @click="open = false"
          />
        </div>

        <div
          v-else
          class="flex flex-col gap-1.5"
        >
          <UButton
            icon="i-lucide-plus"
            variant="soft"
            block
            to="/"
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
          :ui="{ link: 'overflow-hidden' }"
        >
          <template #chat-trailing="{ item }">
            <div class="flex -mr-1.25 translate-x-full group-hover:translate-x-0 transition-transform">
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                class="text-muted hover:text-primary hover:bg-accented/50 focus-visible:bg-accented/50 p-0.5"
                aria-label="Delete chat"
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
      :class="isImagesRoute ? 'mt-18' : 'mx-4 mb-4 mt-18 rounded-lg ring ring-default bg-default/75 shadow lg:ml-0'"
    >
      <RouterView :key="route.path" />
    </div>
  </UDashboardGroup>
</template>
