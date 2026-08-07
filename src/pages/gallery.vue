<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useIntersectionObserver } from '@vueuse/core'
import { galleryCases, type GalleryCase } from '../data/galleryCases'
import { useChunkedList } from '../composables/useChunkedList'

const router = useRouter()
const toast = useToast()
const search = ref('')
const activeCategory = ref('全部')
const activeSource = ref('全部来源')
const selectedCase = ref<GalleryCase | null>(null)
const caseModalOpen = ref(false)
const failedImageIds = ref<string[]>([])
const loadMoreSentinel = ref<HTMLElement | null>(null)

const categories = computed(() => {
  const values = new Set(galleryCases.map(item => item.category))
  return ['全部', ...values]
})

const sources = computed(() => {
  const values = new Set(galleryCases.map(item => item.sourceLabel).filter(Boolean))
  return ['全部来源', ...values]
})

const filteredCases = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return galleryCases.filter((item) => {
    const matchesCategory = activeCategory.value === '全部' || item.category === activeCategory.value
    const matchesSource = activeSource.value === '全部来源' || item.sourceLabel === activeSource.value
    const matchesKeyword = !keyword || [
      item.title,
      item.category,
      item.author,
      item.prompt,
      item.sourceLabel,
      item.searchIndex,
      ...item.tags
    ].join(' ').toLowerCase().includes(keyword)

    return matchesCategory && matchesSource && matchesKeyword
  })
})

const { visible: visibleCases, hasMore, loadMore } = useChunkedList(filteredCases, 24)

useIntersectionObserver(loadMoreSentinel, ([entry]) => {
  if (entry?.isIntersecting) {
    loadMore()
  }
}, { rootMargin: '600px 0px' })

function openCase(item: GalleryCase) {
  selectedCase.value = item
  caseModalOpen.value = true
}

function getImageUrl(item: GalleryCase) {
  return failedImageIds.value.includes(item.id) && item.fallbackImageUrl
    ? item.fallbackImageUrl
    : item.imageUrl || item.fallbackImageUrl
}

function onImageError(item: GalleryCase) {
  if (!failedImageIds.value.includes(item.id) && item.fallbackImageUrl && item.fallbackImageUrl !== item.imageUrl) {
    failedImageIds.value = [...failedImageIds.value, item.id]
  }
}

function createWithPrompt(item: GalleryCase) {
  caseModalOpen.value = false
  router.push({ path: '/studio', query: { prompt: item.prompt } })
}

async function copyPrompt(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({
    title: '已复制 Prompt',
    description: '可以到创作台直接粘贴使用',
    icon: 'i-lucide-copy'
  })
}
</script>

<template>
  <div class="aurora-shell min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-6">
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section class="glass-panel glass-panel--lg p-4 sm:p-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-highlighted">
              灵感墙
            </h1>
            <p class="mt-1 text-sm text-muted">
              {{ filteredCases.length }} 个公开案例 · 点击卡片看 Prompt，喜欢就直接拿去创作
            </p>
          </div>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="搜索灵感 / Prompt"
            class="w-full lg:w-80"
            :ui="{ base: 'rounded-full bg-elevated' }"
          />
        </div>

        <div
          v-if="categories.length > 2"
          class="mt-4 flex gap-2 overflow-x-auto pb-1"
        >
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            class="glass-pill shrink-0 px-3.5 py-1.5 text-sm font-semibold"
            :data-selected="activeCategory === category"
            @click="activeCategory = category"
          >
            {{ category }}
          </button>
        </div>

        <div class="mt-2 flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="source in sources"
            :key="source"
            type="button"
            class="glass-pill shrink-0 px-3.5 py-1.5 text-xs font-semibold"
            :data-selected="activeSource === source"
            @click="activeSource = source"
          >
            {{ source }}
          </button>
        </div>
      </section>

      <template v-if="filteredCases.length">
        <div class="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <article
            v-for="item in visibleCases"
            :key="item.id"
            class="glass-card-hover group flex h-full flex-col overflow-hidden rounded-2xl"
          >
            <button
              type="button"
              class="relative aspect-[3/4] shrink-0 overflow-hidden bg-muted text-left"
              @click="openCase(item)"
            >
              <img
                :src="getImageUrl(item)"
                :alt="item.title"
                loading="lazy"
                decoding="async"
                class="block size-full object-cover transition duration-500 group-hover:scale-105"
                @error="onImageError(item)"
              >
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8">
                <p class="line-clamp-1 text-sm font-semibold text-white">
                  {{ item.title }}
                </p>
                <p class="mt-0.5 line-clamp-1 text-xs text-white/70">
                  {{ item.category }} · {{ item.author }}
                </p>
              </div>
            </button>

            <div class="flex items-center justify-between gap-1.5 px-3 py-2">
              <UButton
                type="button"
                icon="i-lucide-wand-sparkles"
                label="用它创作"
                color="primary"
                size="xs"
                class="glass-btn rounded-full"
                @click="createWithPrompt(item)"
              />
              <div class="flex gap-1">
                <UButton
                  type="button"
                  icon="i-lucide-copy"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="glass-pill rounded-full"
                  aria-label="复制 Prompt"
                  @click="copyPrompt(item.prompt)"
                />
                <UButton
                  type="button"
                  icon="i-lucide-eye"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="glass-pill rounded-full"
                  aria-label="查看详情"
                  @click="openCase(item)"
                />
              </div>
            </div>
          </article>
        </div>

        <div
          v-if="hasMore"
          ref="loadMoreSentinel"
          class="flex items-center justify-center gap-2 py-6 text-sm text-muted"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-4 animate-spin"
          />
          正在加载更多灵感（{{ visibleCases.length }} / {{ filteredCases.length }}）
        </div>
      </template>

      <section
        v-else
        class="glass-panel glass-panel--lg grid min-h-80 place-items-center p-8 text-center"
      >
        <div>
          <UIcon
            name="i-lucide-search-x"
            class="mx-auto size-10 text-muted"
          />
          <h2 class="mt-4 text-xl font-bold text-highlighted">
            没有找到匹配灵感
          </h2>
          <p class="mt-2 text-sm text-muted">
            换一个关键词或清空分类筛选再试。
          </p>
        </div>
      </section>
    </div>

    <UModal
      v-model:open="caseModalOpen"
      :ui="{ content: 'glass-panel glass-panel--lg max-w-6xl overflow-hidden rounded-3xl p-0 divide-y-0' }"
    >
      <template #content>
        <div
          v-if="selectedCase"
          class="grid max-h-[calc(100vh-2rem)] lg:grid-cols-[0.95fr_0.85fr]"
        >
          <div class="min-h-0 bg-black">
            <img
              :src="getImageUrl(selectedCase)"
              :alt="selectedCase.title"
              class="max-h-[45vh] w-full object-contain lg:h-full lg:max-h-[calc(100vh-2rem)]"
              @error="onImageError(selectedCase)"
            >
          </div>
          <div class="flex min-h-0 flex-col p-5 sm:p-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <UBadge
                  :label="selectedCase.category"
                  color="neutral"
                  variant="subtle"
                  class="rounded-full"
                />
                <h2 class="mt-3 text-2xl font-bold text-highlighted">
                  {{ selectedCase.title }}
                </h2>
                <p class="mt-2 text-sm text-muted">
                  {{ selectedCase.author }} · {{ selectedCase.sourceLabel || '未标记来源' }}
                </p>
              </div>
              <UButton
                type="button"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                class="glass-pill rounded-full"
                aria-label="关闭"
                @click="caseModalOpen = false"
              />
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <UButton
                v-if="selectedCase.sourceUrl"
                :href="selectedCase.sourceUrl"
                target="_blank"
                icon="i-lucide-external-link"
                label="原始来源"
                color="neutral"
                variant="outline"
                size="xs"
                class="glass-pill rounded-full"
              />
              <UBadge
                v-for="tag in selectedCase.tags"
                :key="tag"
                :label="tag"
                color="neutral"
                variant="outline"
                class="rounded-full"
              />
            </div>

            <div class="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-default bg-muted p-4">
              <div class="mb-2 flex items-center justify-between gap-3">
                <p class="label-mono">
                  Prompt
                </p>
                <UButton
                  type="button"
                  icon="i-lucide-copy"
                  label="复制"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="glass-pill rounded-full"
                  @click="copyPrompt(selectedCase.prompt)"
                />
              </div>
              <p class="overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-muted">
                {{ selectedCase.prompt }}
              </p>
            </div>

            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <UButton
                type="button"
                icon="i-lucide-wand-sparkles"
                label="用它创作"
                color="primary"
                class="glass-btn rounded-full"
                @click="createWithPrompt(selectedCase)"
              />
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
