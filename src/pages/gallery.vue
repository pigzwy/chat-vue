<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { galleryCases, galleryMeta, type GalleryCase } from '../data/galleryCases'

const toast = useToast()
const featuredRotateInterval = 5000
const search = ref('')
const activeCategory = ref('全部')
const activeSource = ref('全部来源')
const selectedCase = ref<GalleryCase | null>(null)
const failedImageIds = ref<string[]>([])
const featuredCaseIndex = ref(0)
let featuredRotateTimer: ReturnType<typeof setInterval> | undefined

interface GalleryCaseSection {
  title: string
  cases: GalleryCase[]
}

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
const featuredCase = computed(() => filteredCases.value[featuredCaseIndex.value] || filteredCases.value[0] || galleryCases[0])

const filteredCaseSections = computed<GalleryCaseSection[]>(() => {
  const groups = new Map<string, GalleryCase[]>()

  for (const item of filteredCases.value) {
    const sectionCases = groups.get(item.category) || []
    sectionCases.push(item)
    groups.set(item.category, sectionCases)
  }

  return [...groups.entries()].map(([title, cases]) => ({ title, cases }))
})

function getRandomFeaturedIndex(total: number) {
  if (total <= 1) return 0

  let nextIndex = Math.floor(Math.random() * total)
  if (nextIndex === featuredCaseIndex.value) {
    nextIndex = (nextIndex + 1) % total
  }
  return nextIndex
}

function rotateFeaturedCase() {
  featuredCaseIndex.value = getRandomFeaturedIndex(filteredCases.value.length)
}

function startFeaturedRotation() {
  featuredRotateTimer = setInterval(rotateFeaturedCase, featuredRotateInterval)
}

function openCase(item: GalleryCase) {
  selectedCase.value = item
}

function closeCase() {
  selectedCase.value = null
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

async function copyPrompt(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({
    title: '已复制 Prompt',
    description: '可以回到画图页直接粘贴使用',
    icon: 'i-lucide-copy'
  })
}

watch(filteredCases, (cases) => {
  featuredCaseIndex.value = getRandomFeaturedIndex(cases.length)
})

startFeaturedRotation()

onBeforeUnmount(() => {
  if (featuredRotateTimer) {
    clearInterval(featuredRotateTimer)
  }
})
</script>

<template>
  <div class="hero-shell min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-0 sm:px-6">
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section class="grid gap-5 xl:grid-cols-2">
        <div class="hero-panel p-6 sm:p-8 lg:p-10">
          <UBadge
            label="GPT-Image-2 Gallery"
            color="neutral"
            variant="outline"
            class="warm-pill rounded-full"
          />
          <h1 class="mt-5 text-4xl font-black tracking-tight text-highlighted sm:text-6xl">
            案例观摩馆
          </h1>
          <p class="mt-5 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            参考公开案例库的浏览体验，集中展示图片、分类、作者与 Prompt。先看案例找方向，再复制提示词去画图页生成或改写。
          </p>
          <div class="mt-7 flex flex-wrap gap-3">
            <UButton
              to="/images"
              icon="i-lucide-wand-sparkles"
              label="打开画图工具"
              color="primary"
              class="warm-btn rounded-full px-5 font-semibold"
            />
            <UButton
              href="https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts"
              target="_blank"
              icon="i-lucide-external-link"
              label="原始仓库"
              color="neutral"
              variant="outline"
              class="warm-pill rounded-full px-5 font-semibold"
            />
          </div>

          <div class="mt-9 grid gap-3 sm:grid-cols-3">
            <div class="warm-card rounded-3xl p-4">
              <p class="text-2xl font-black text-highlighted">
                {{ galleryMeta.totalCases }}
              </p>
              <p class="mt-1 text-sm text-muted">
                完整案例
              </p>
            </div>
            <div class="warm-card rounded-3xl p-4">
              <p class="text-2xl font-black text-highlighted">
                {{ galleryMeta.sectionCount }}
              </p>
              <p class="mt-1 text-sm text-muted">
                原站分区
              </p>
            </div>
            <div class="warm-card rounded-3xl p-4">
              <p class="text-2xl font-black text-highlighted">
                {{ galleryMeta.dataVersion }}
              </p>
              <p class="mt-1 text-sm text-muted">
                数据版本
              </p>
            </div>
          </div>
        </div>

        <button
          v-if="featuredCase"
          type="button"
          class="hero-panel group overflow-hidden p-3 text-left"
          @click="openCase(featuredCase)"
        >
          <div class="relative aspect-video overflow-hidden rounded-[1.25rem] bg-[var(--warm-surface-hover)]">
            <img
              :src="getImageUrl(featuredCase)"
              :alt="featuredCase.title"
              class="block size-full object-cover transition duration-500 group-hover:scale-105"
              @error="onImageError(featuredCase)"
            >
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-6 text-white">
              <UBadge
                :label="featuredCase.category"
                color="neutral"
                variant="solid"
                class="rounded-full bg-white/20 text-white backdrop-blur"
              />
              <h2 class="mt-3 text-2xl font-black">
                {{ featuredCase.title }}
              </h2>
              <p class="mt-2 line-clamp-2 text-sm leading-6 text-white/75">
                {{ featuredCase.prompt }}
              </p>
            </div>
          </div>
        </button>
      </section>

      <section class="hero-panel p-4 sm:p-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="text-2xl font-black text-highlighted">
              浏览案例
            </h2>
            <p class="mt-1 text-sm text-muted">
              按分类和来源筛选，或搜索标题、作者、标签和 Prompt。
            </p>
          </div>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="搜索案例 / Prompt"
            class="w-full lg:w-80"
            :ui="{ base: 'rounded-full bg-[var(--warm-card)]' }"
          />
        </div>

        <div class="mt-5 flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="category in categories"
            :key="category"
            type="button"
            class="warm-pill shrink-0 px-4 py-2 text-sm font-semibold"
            :class="activeCategory === category ? 'warm-btn' : ''"
            @click="activeCategory = category"
          >
            {{ category }}
          </button>
        </div>

        <div class="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="source in sources"
            :key="source"
            type="button"
            class="warm-pill shrink-0 px-4 py-2 text-sm font-semibold"
            :class="activeSource === source ? 'warm-btn' : ''"
            @click="activeSource = source"
          >
            {{ source }}
          </button>
        </div>
      </section>

      <template v-if="filteredCases.length">
        <section
          v-for="section in filteredCaseSections"
          :key="section.title"
          class="hero-panel p-4 sm:p-5"
        >
          <div class="mb-5 flex items-end justify-between gap-4">
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.2em] text-muted">
                Gallery
              </p>
              <h2 class="mt-2 text-2xl font-black text-highlighted">
                {{ section.title }}
              </h2>
            </div>
            <div class="warm-pill shrink-0 px-4 py-2 text-sm font-semibold text-muted">
              {{ section.cases.length }} 个案例
            </div>
          </div>

          <div class="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="item in section.cases"
              :key="item.id"
              class="warm-card-hover flex h-full overflow-hidden rounded-[1.5rem] p-0"
            >
              <div class="flex w-full flex-col">
                <button
                  type="button"
                  class="group relative aspect-video shrink-0 overflow-hidden bg-[var(--warm-surface-hover)] text-left"
                  @click="openCase(item)"
                >
                  <img
                    :src="getImageUrl(item)"
                    :alt="item.title"
                    class="block size-full object-cover transition duration-500 group-hover:scale-105"
                    @error="onImageError(item)"
                  >
                  <div class="absolute bottom-3 right-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                    {{ item.sourceLabel || item.imageCount + ' 张' }}
                  </div>
                </button>

                <div class="flex min-h-64 flex-1 flex-col gap-3 p-5">
                  <div class="flex items-center justify-between gap-3">
                    <UBadge
                      :label="item.category"
                      color="neutral"
                      variant="subtle"
                      class="rounded-full"
                    />
                    <span class="text-xs text-muted">{{ item.author }}</span>
                  </div>
                  <h3 class="text-lg font-black text-highlighted">
                    {{ item.title }}
                  </h3>
                  <p class="line-clamp-3 text-sm leading-6 text-muted">
                    {{ item.prompt }}
                  </p>
                  <div class="mt-auto flex flex-wrap gap-2">
                    <UBadge
                      v-for="tag in item.tags"
                      :key="tag"
                      :label="tag"
                      color="neutral"
                      variant="outline"
                      class="rounded-full"
                    />
                  </div>
                  <div class="flex flex-wrap gap-2 pt-1">
                    <UButton
                      type="button"
                      icon="i-lucide-eye"
                      label="查看"
                      color="neutral"
                      variant="soft"
                      size="sm"
                      class="warm-pill rounded-full"
                      @click="openCase(item)"
                    />
                    <UButton
                      type="button"
                      icon="i-lucide-copy"
                      label="复制 Prompt"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      class="warm-pill rounded-full"
                      @click="copyPrompt(item.prompt)"
                    />
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </template>

      <section
        v-else
        class="hero-panel grid min-h-80 place-items-center p-8 text-center"
      >
        <div>
          <UIcon
            name="i-lucide-search-x"
            class="mx-auto size-10 text-muted"
          />
          <h2 class="mt-4 text-xl font-black text-highlighted">
            没有找到匹配案例
          </h2>
          <p class="mt-2 text-sm text-muted">
            换一个关键词或清空分类筛选再试。
          </p>
        </div>
      </section>
    </div>

    <div
      v-if="selectedCase"
      class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur"
      @click.self="closeCase"
    >
      <div class="hero-panel grid max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-[2rem] lg:grid-cols-[0.95fr_0.85fr]">
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
              <h2 class="mt-3 text-2xl font-black text-highlighted sm:text-3xl">
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
              class="warm-pill rounded-full"
              aria-label="关闭"
              @click="closeCase"
            />
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <UButton
              v-if="selectedCase.sourceUrl"
              :href="selectedCase.sourceUrl"
              target="_blank"
              icon="i-lucide-external-link"
              label="原始来源"
              color="neutral"
              variant="outline"
              size="xs"
              class="warm-pill rounded-full"
            />
            <UButton
              v-if="selectedCase.authorUrl"
              :href="selectedCase.authorUrl"
              target="_blank"
              icon="i-lucide-user"
              label="作者"
              color="neutral"
              variant="outline"
              size="xs"
              class="warm-pill rounded-full"
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

          <div class="mt-5 flex min-h-0 flex-1 flex-col rounded-3xl border border-[var(--warm-border)] bg-[var(--warm-surface-hover)] p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <p class="text-sm font-bold text-highlighted">
                Prompt
              </p>
              <UButton
                type="button"
                icon="i-lucide-copy"
                label="复制"
                color="neutral"
                variant="ghost"
                size="xs"
                class="warm-pill rounded-full"
                @click="copyPrompt(selectedCase.prompt)"
              />
            </div>
            <p class="overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-muted">
              {{ selectedCase.prompt }}
            </p>
          </div>

          <div class="mt-5 flex flex-wrap justify-end gap-2">
            <UButton
              to="/images"
              icon="i-lucide-wand-sparkles"
              label="去画图"
              color="primary"
              class="warm-btn rounded-full"
            />
            <UButton
              type="button"
              icon="i-lucide-copy"
              label="复制 Prompt"
              color="neutral"
              variant="outline"
              class="warm-pill rounded-full"
              @click="copyPrompt(selectedCase.prompt)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
