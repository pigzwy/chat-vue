import { computed, ref, watch } from 'vue'
import { createSharedComposable, useStorage } from '@vueuse/core'
import { useModels } from '../useModels'
import {
  defaultGrokMediaGroupId,
  defaultImageModelId,
  defaultOpenaiMediaGroupId,
  defaultVideoModelId,
  isImageMediaModelId,
  isVideoMediaModelId,
  mediaApiKeyName,
  mediaModelCatalog,
  resolveMediaModelSpec,
  type MediaKind
} from '../../../shared/utils/mediaModels'

export interface MediaModelOption {
  label: string
  value: string
  icon: string
}

function iconForMediaModel(id: string) {
  if (/grok/i.test(id)) return 'i-simple-icons:xai'
  if (/gpt|dall/i.test(id)) return 'i-simple-icons:openai'
  return 'i-lucide-box'
}

function catalogOptions(kind: MediaKind): MediaModelOption[] {
  return mediaModelCatalog
    .filter(spec => spec.kind === kind)
    .map(spec => ({ label: spec.label, value: spec.id, icon: iconForMediaModel(spec.id) }))
}

/**
 * 创作台的模型选择。
 * 分组不再由用户手选：每个模型按 provider 绑定默认分组
 * （GPT Image 2 → 分组 25，Grok 全系 → 分组 66），key 沿用自动创建逻辑。
 * 与聊天页的 useModels 状态互相独立，不改动聊天页当前选中的 group/model。
 */
export const useMediaModels = createSharedComposable(() => {
  const { hasSub2apiToken, getModelsForGroup, getApiKeyForGroup, clearApiKeyForGroup } = useModels()

  const mediaMode = useStorage<MediaKind>('sub2api-media-mode', 'image')
  const openaiGroupId = useStorage<number>('sub2api-media-group-openai', defaultOpenaiMediaGroupId)
  const grokGroupId = useStorage<number>('sub2api-media-group-grok', defaultGrokMediaGroupId)
  const imageModel = useStorage<string>('sub2api-media-image-model', defaultImageModelId)
  const videoModel = useStorage<string>('sub2api-media-video-model', defaultVideoModelId)

  const openaiGroupModels = ref<MediaModelOption[]>([])
  const grokGroupModels = ref<MediaModelOption[]>([])
  const loadingModels = ref(false)

  const fallbackImageModels = catalogOptions('image')
  const fallbackVideoModels = catalogOptions('video')

  function groupForModel(modelId: string) {
    const spec = resolveMediaModelSpec(modelId)
    if (spec.provider === 'grok') return grokGroupId.value
    return spec.defaultGroupId ?? openaiGroupId.value
  }

  const imageModels = computed(() => {
    const fromGroups = [
      ...openaiGroupModels.value.filter(item => isImageMediaModelId(item.value) && resolveMediaModelSpec(item.value).provider === 'openai'),
      ...grokGroupModels.value.filter(item => isImageMediaModelId(item.value) && resolveMediaModelSpec(item.value).provider === 'grok')
    ]
    return fromGroups.length ? fromGroups : fallbackImageModels
  })

  const videoModels = computed(() => {
    const fromGroup = grokGroupModels.value.filter(item => isVideoMediaModelId(item.value))
    return fromGroup.length ? fromGroup : fallbackVideoModels
  })

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
      openaiGroupModels.value = []
      grokGroupModels.value = []
      return
    }

    loadingModels.value = true
    try {
      // 只拉两个默认媒体分组（会按需为各分组自动创建 key），不做全分组扫描
      const [openaiModels, grokModels] = await Promise.all([
        getModelsForGroup(openaiGroupId.value, mediaApiKeyName).catch(() => [] as MediaModelOption[]),
        getModelsForGroup(grokGroupId.value, mediaApiKeyName).catch(() => [] as MediaModelOption[])
      ])
      openaiGroupModels.value = openaiModels
      grokGroupModels.value = grokModels
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
  })
  watch(videoModels, (list) => {
    if (!list.some(item => item.value === videoModel.value)) {
      videoModel.value = list[0]?.value || defaultVideoModelId
    }
  })

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
