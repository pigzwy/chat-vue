import { computed, ref, watch } from 'vue'
import { createSharedComposable, useStorage } from '@vueuse/core'
import { useModels } from '../useModels'
import {
  defaultGrokMediaGroupId,
  defaultImageModelId,
  defaultOpenaiMediaGroupId,
  defaultVideoModelId,
  mediaApiKeyName,
  mediaModelCatalog,
  resolveMediaModelSpec,
  videoCostPerSecondByResolution,
  type MediaKind,
  type MediaModelSpec
} from '../../../shared/utils/mediaModels'

export interface MediaModelOption {
  label: string
  value: string
  icon: string
  description?: string
  price?: string
}

function iconForMediaModel(id: string) {
  if (/grok/i.test(id)) return 'i-mingcute:grok-fill'
  if (/gpt|dall/i.test(id)) return 'i-simple-icons:openai'
  return 'i-lucide-box'
}

function priceTextForSpec(spec: MediaModelSpec) {
  if (spec.kind === 'video') {
    const rates = Object.values(videoCostPerSecondByResolution)
    return `$${Math.min(...rates)}~${Math.max(...rates)}/秒`
  }
  if (spec.costPerImage) return `$${spec.costPerImage}/张`
  if (spec.costByResolution) {
    const rates = Object.values(spec.costByResolution)
    return `$${Math.min(...rates)}~${Math.max(...rates)}/张`
  }
  return undefined
}

function toOption(spec: MediaModelSpec): MediaModelOption {
  return {
    label: spec.label,
    value: spec.id,
    icon: iconForMediaModel(spec.id),
    description: spec.description,
    price: priceTextForSpec(spec)
  }
}

/**
 * 创作台的模型选择：只展示目录精选的模型（带中文名/说明/价格），
 * 分组对用户不可见——每个模型按 provider 绑定默认分组
 * （GPT Image 2 → 分组 25，Grok 全系 → 分组 66），key 沿用自动创建逻辑。
 * 与聊天页的 useModels 状态互相独立。
 */
export const useMediaModels = createSharedComposable(() => {
  const { hasSub2apiToken, getModelsForGroup, getApiKeyForGroup, clearApiKeyForGroup } = useModels()

  const mediaMode = useStorage<MediaKind>('sub2api-media-mode', 'image')
  const openaiGroupId = useStorage<number>('sub2api-media-group-openai', defaultOpenaiMediaGroupId)
  const grokGroupId = useStorage<number>('sub2api-media-group-grok', defaultGrokMediaGroupId)
  const imageModel = useStorage<string>('sub2api-media-image-model', defaultImageModelId)
  const videoModel = useStorage<string>('sub2api-media-video-model', defaultVideoModelId)

  /** 两个媒体分组实际可用的模型 id（拉取失败/未登录时为 null，表示未知） */
  const availableModelIds = ref<Set<string> | null>(null)
  const loadingModels = ref(false)

  function groupForModel(modelId: string) {
    const spec = resolveMediaModelSpec(modelId)
    if (spec.provider === 'grok') return grokGroupId.value
    return spec.defaultGroupId ?? openaiGroupId.value
  }

  function curatedOptions(kind: MediaKind): MediaModelOption[] {
    const specs = mediaModelCatalog.filter(spec => spec.kind === kind)
    if (!availableModelIds.value) return specs.map(toOption)

    const available = specs.filter(spec => availableModelIds.value!.has(spec.id))
    return (available.length ? available : specs).map(toOption)
  }

  const imageModels = computed(() => curatedOptions('image'))
  const videoModels = computed(() => curatedOptions('video'))

  const activeModel = computed(() => mediaMode.value === 'video' ? videoModel.value : imageModel.value)
  const activeModelSpec = computed(() => resolveMediaModelSpec(activeModel.value))
  const activeGroupId = computed(() => groupForModel(activeModel.value))
  const activeModelOptions = computed(() => mediaMode.value === 'video' ? videoModels.value : imageModels.value)
  const activeModelLabel = computed(() => {
    return activeModelOptions.value.find(item => item.value === activeModel.value)?.label
      || resolveMediaModelSpec(activeModel.value).label
  })

  async function refreshGroupModels() {
    if (!hasSub2apiToken.value) {
      availableModelIds.value = null
      return
    }

    loadingModels.value = true
    try {
      // 只拉两个默认媒体分组（会按需为各分组自动创建 key），不做全分组扫描
      const [openaiModels, grokModels] = await Promise.all([
        getModelsForGroup(openaiGroupId.value, mediaApiKeyName).catch(() => []),
        getModelsForGroup(grokGroupId.value, mediaApiKeyName).catch(() => [])
      ])
      const ids = [...openaiModels, ...grokModels].map(item => item.value)
      availableModelIds.value = ids.length ? new Set(ids) : null
    } finally {
      loadingModels.value = false
    }
  }

  function selectModel(modelId: string) {
    if (mediaMode.value === 'video') {
      videoModel.value = modelId
    } else {
      imageModel.value = modelId
    }
  }

  function getMediaApiKey() {
    return getApiKeyForGroup(activeGroupId.value, mediaApiKeyName)
  }

  function clearMediaApiKey() {
    clearApiKeyForGroup(activeGroupId.value)
  }

  watch([openaiGroupId, grokGroupId], () => {
    void refreshGroupModels()
  })

  // 模型列表变化时校正当前选择（避免残留不存在的模型 id）
  watch(imageModels, (list) => {
    if (!list.some(item => item.value === imageModel.value)) {
      imageModel.value = list[0]?.value || defaultImageModelId
    }
  }, { immediate: true })
  watch(videoModels, (list) => {
    if (!list.some(item => item.value === videoModel.value)) {
      videoModel.value = list[0]?.value || defaultVideoModelId
    }
  }, { immediate: true })

  function init() {
    void refreshGroupModels()
  }

  return {
    mediaMode,
    openaiGroupId,
    grokGroupId,
    imageModel,
    videoModel,
    imageModels,
    videoModels,
    activeModel,
    activeModelSpec,
    activeGroupId,
    activeModelOptions,
    activeModelLabel,
    loadingModels,
    hasSub2apiToken,
    groupForModel,
    selectModel,
    getMediaApiKey,
    clearMediaApiKey,
    init
  }
})
