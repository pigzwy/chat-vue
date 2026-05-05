<script setup lang="ts">
import { computed, ref } from 'vue'

interface GalleryCase {
  id: string
  title: string
  category: string
  author: string
  imageUrl: string
  prompt: string
  ratio: string
  tags: string[]
}

const toast = useToast()
const search = ref('')
const activeCategory = ref('全部')
const selectedCase = ref<GalleryCase | null>(null)

const galleryCases: GalleryCase[] = [
  {
    id: 'neon-portrait',
    title: '便利店霓虹人像',
    category: '人像摄影',
    author: '@BubbleBrain',
    imageUrl: 'https://cdn.jsdelivr.net/gh/EvoLinkAI/awesome-gpt-image-2-prompts@main/images/portrait_case1/output.jpg',
    prompt: '35mm film photography with harsh convenience store fluorescent lighting mixed with colorful neon signs from outside, authentic film grain, high contrast, cinematic street editorial style, late-night convenience store atmosphere, realistic reflections, natural skin texture, no watermark, no text',
    ratio: '4:5',
    tags: ['35mm', '霓虹', '电影感']
  },
  {
    id: 'minimal-cinematic',
    title: '电影感极简人像',
    category: '人像摄影',
    author: '@iam_miharbi',
    imageUrl: 'https://cdn.jsdelivr.net/gh/EvoLinkAI/awesome-gpt-image-2-prompts@main/images/portrait_case2/output.jpg',
    prompt: 'Generate a cinematic minimal portrait of a solitary man standing in an intense orange to red gradient environment, strong silhouette lighting, deep shadow contrast, reflective glossy floor, symmetrical composition, minimal',
    ratio: '4:5',
    tags: ['极简', '轮廓光', '渐变']
  },
  {
    id: 'onsen-portrait',
    title: '日式温泉旅馆人像',
    category: '人像摄影',
    author: '@BubbleBrain',
    imageUrl: 'https://cdn.jsdelivr.net/gh/EvoLinkAI/awesome-gpt-image-2-prompts@main/images/portrait_case3/output.jpg',
    prompt: '35mm film photography, warm vintage Japanese onsen ryokan aesthetic, soft ambient wooden lantern lighting, gentle natural window light, subtle film grain, warm tones, traditional wooden interior, paper sliding doors, authentic Japanese onsen ryokan atmosphere',
    ratio: '4:5',
    tags: ['日式', '温泉', '胶片']
  },
  {
    id: 'spring-poster',
    title: '2026 波士顿春季城市海报',
    category: '海报插画',
    author: '@BubbleBrain',
    imageUrl: 'https://cdn.jsdelivr.net/gh/EvoLinkAI/awesome-gpt-image-2-prompts@main/images/poster_case1/output.jpg',
    prompt: 'A refined 2026 Boston spring city poster, editorial travel illustration, fresh spring palette, elegant typography layout, landmark composition, premium magazine cover feeling, clean details, poster design',
    ratio: '2:3',
    tags: ['城市海报', '旅行', '春季']
  },
  {
    id: 'persona-card',
    title: 'Persona5 角色设定卡',
    category: '角色设计',
    author: '@iamrednightS',
    imageUrl: 'https://cdn.jsdelivr.net/gh/EvoLinkAI/awesome-gpt-image-2-prompts@main/images/character_case2/output.jpg',
    prompt: 'Persona 5 style character design sheet, bold red black white graphic layout, full body character, expressions, dynamic poses, anime key art, stylish UI panels, high contrast, clean character concept presentation',
    ratio: '16:9',
    tags: ['角色设定', '动漫', '设定表']
  },
  {
    id: 'ui-design',
    title: '单一提示词生成 UI 设计',
    category: 'UI 截图',
    author: '@austinit',
    imageUrl: 'https://cdn.jsdelivr.net/gh/EvoLinkAI/awesome-gpt-image-2-prompts@main/images/ui_case1/output.jpg',
    prompt: 'Create a polished modern app UI design from one prompt, clean dashboard layout, soft gradients, glass cards, thoughtful spacing, production-ready visual design, realistic interface screenshot',
    ratio: '16:9',
    tags: ['UI', 'Dashboard', '界面']
  }
]

const categories = computed(() => {
  const values = new Set(galleryCases.map(item => item.category))
  return ['全部', ...values]
})

const filteredCases = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return galleryCases.filter((item) => {
    const matchesCategory = activeCategory.value === '全部' || item.category === activeCategory.value
    const matchesKeyword = !keyword || [
      item.title,
      item.category,
      item.author,
      item.prompt,
      ...item.tags
    ].join(' ').toLowerCase().includes(keyword)

    return matchesCategory && matchesKeyword
  })
})
const featuredCase = computed(() => filteredCases.value[0] || galleryCases[0])

function openCase(item: GalleryCase) {
  selectedCase.value = item
}

function closeCase() {
  selectedCase.value = null
}

async function copyPrompt(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({
    title: '已复制 Prompt',
    description: '可以回到画图页直接粘贴使用',
    icon: 'i-lucide-copy'
  })
}
</script>

<template>
  <div class="hero-shell min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-0 sm:px-6">
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section class="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
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
              href="https://gpt.ominiapi.top/gallery/"
              target="_blank"
              icon="i-lucide-external-link"
              label="参考来源"
              color="neutral"
              variant="outline"
              class="warm-pill rounded-full px-5 font-semibold"
            />
          </div>

          <div class="mt-9 grid gap-3 sm:grid-cols-3">
            <div class="warm-card rounded-3xl p-4">
              <p class="text-2xl font-black text-highlighted">
                {{ galleryCases.length }}
              </p>
              <p class="mt-1 text-sm text-muted">
                精选案例
              </p>
            </div>
            <div class="warm-card rounded-3xl p-4">
              <p class="text-2xl font-black text-highlighted">
                {{ categories.length - 1 }}
              </p>
              <p class="mt-1 text-sm text-muted">
                创作分类
              </p>
            </div>
            <div class="warm-card rounded-3xl p-4">
              <p class="text-2xl font-black text-highlighted">
                Prompt
              </p>
              <p class="mt-1 text-sm text-muted">
                一键复制
              </p>
            </div>
          </div>
        </div>

        <button
          v-if="featuredCase"
          type="button"
          class="hero-panel group min-h-[420px] overflow-hidden p-3 text-left"
          @click="openCase(featuredCase)"
        >
          <div class="relative h-full min-h-[396px] overflow-hidden rounded-[1.25rem]">
            <img
              :src="featuredCase.imageUrl"
              :alt="featuredCase.title"
              class="size-full object-cover transition duration-500 group-hover:scale-105"
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
              按分类筛选，或搜索标题、作者、标签和 Prompt。
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
      </section>

      <section
        v-if="filteredCases.length"
        class="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        <article
          v-for="item in filteredCases"
          :key="item.id"
          class="warm-card-hover flex overflow-hidden rounded-[1.5rem] p-0"
        >
          <div class="flex w-full flex-col">
            <button
              type="button"
              class="group relative aspect-[4/5] overflow-hidden text-left"
              @click="openCase(item)"
            >
              <img
                :src="item.imageUrl"
                :alt="item.title"
                class="size-full object-cover transition duration-500 group-hover:scale-105"
              >
              <div class="absolute bottom-3 right-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                {{ item.ratio }}
              </div>
            </button>

            <div class="flex flex-1 flex-col gap-3 p-5">
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
      </section>

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
            :src="selectedCase.imageUrl"
            :alt="selectedCase.title"
            class="max-h-[45vh] w-full object-contain lg:h-full lg:max-h-[calc(100vh-2rem)]"
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
                {{ selectedCase.author }} · {{ selectedCase.ratio }}
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
