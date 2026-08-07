import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'

/**
 * 大列表分段渐进渲染：初始只渲染一段，配合底部 sentinel 逐段追加。
 * source 变化（搜索/筛选）时自动回到第一段。
 */
export function useChunkedList<T>(source: Ref<T[]>, chunkSize = 24) {
  const visibleCount = ref(chunkSize)

  watch(source, () => {
    visibleCount.value = chunkSize
  })

  const visible = computed(() => source.value.slice(0, visibleCount.value))
  const hasMore = computed(() => visibleCount.value < source.value.length)

  function loadMore() {
    if (!hasMore.value) return
    visibleCount.value = Math.min(visibleCount.value + chunkSize, source.value.length)
  }

  function reset() {
    visibleCount.value = chunkSize
  }

  return { visible, hasMore, loadMore, reset }
}
