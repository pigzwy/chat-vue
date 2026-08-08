'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink, Eye, LoaderCircle, Search, SearchX, WandSparkles, X } from 'lucide-react'
import { galleryCases, type GalleryCase } from '@/data/gallery-cases'
import { toast } from '@/lib/toast'

const chunkSize = 24

export default function GalleryPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [activeSource, setActiveSource] = useState('全部来源')
  const [selectedCase, setSelectedCase] = useState<GalleryCase | null>(null)
  const [failedImageIds, setFailedImageIds] = useState<string[]>([])
  const [visibleCount, setVisibleCount] = useState(chunkSize)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const categories = useMemo(() => ['全部', ...new Set(galleryCases.map(item => item.category))], [])
  const sources = useMemo(
    () => ['全部来源', ...new Set(galleryCases.map(item => item.sourceLabel).filter(Boolean))],
    []
  )

  const filteredCases = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return galleryCases.filter((item) => {
      const matchesCategory = activeCategory === '全部' || item.category === activeCategory
      const matchesSource = activeSource === '全部来源' || item.sourceLabel === activeSource
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
  }, [search, activeCategory, activeSource])

  // 筛选条件变化时回到第一段（渲染期状态调整）
  const [lastFilterKey, setLastFilterKey] = useState('')
  const filterKey = `${search}|${activeCategory}|${activeSource}`
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    setVisibleCount(chunkSize)
  }

  const visibleCases = filteredCases.slice(0, visibleCount)
  const hasMore = visibleCount < filteredCases.length

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount(count => Math.min(count + chunkSize, filteredCases.length))
      }
    }, { rootMargin: '600px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, filteredCases.length])

  function getImageUrl(item: GalleryCase) {
    return failedImageIds.includes(item.id) && item.fallbackImageUrl
      ? item.fallbackImageUrl
      : item.imageUrl || item.fallbackImageUrl
  }

  function onImageError(item: GalleryCase) {
    if (!failedImageIds.includes(item.id) && item.fallbackImageUrl && item.fallbackImageUrl !== item.imageUrl) {
      setFailedImageIds(ids => [...ids, item.id])
    }
  }

  function createWithPrompt(item: GalleryCase) {
    setSelectedCase(null)
    router.push(`/studio?prompt=${encodeURIComponent(item.prompt)}`)
  }

  async function copyPrompt(text: string) {
    await navigator.clipboard.writeText(text)
    toast({ title: '已复制 Prompt', description: '可以到创作台直接粘贴使用' })
  }

  return (
    <div className="aurora-shell min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <section className="glass-panel glass-panel--lg p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">灵感墙</h1>
              <p className="mt-1 text-sm opacity-60">
                {filteredCases.length} 个公开案例 · 点击卡片看 Prompt，喜欢就直接拿去创作
              </p>
            </div>
            <label className="glass-pill flex h-10 w-full items-center gap-2 px-4 lg:w-80">
              <Search className="size-4 shrink-0 opacity-50" />
              <input
                value={search}
                placeholder="搜索灵感 / Prompt"
                className="w-full bg-transparent text-sm outline-none placeholder:opacity-50"
                onChange={event => setSearch(event.target.value)}
              />
            </label>
          </div>

          {categories.length > 2 && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {categories.map(category => (
                <button
                  key={category}
                  type="button"
                  className="glass-pill shrink-0 px-3.5 py-1.5 text-sm font-semibold"
                  data-selected={activeCategory === category}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {sources.map(source => (
              <button
                key={source}
                type="button"
                className="glass-pill shrink-0 px-3.5 py-1.5 text-xs font-semibold"
                data-selected={activeSource === source}
                onClick={() => setActiveSource(source)}
              >
                {source}
              </button>
            ))}
          </div>
        </section>

        {filteredCases.length
          ? (
              <>
                <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {visibleCases.map(item => (
                    <article key={item.id} className="glass-card-hover group flex h-full flex-col overflow-hidden rounded-2xl">
                      <button
                        type="button"
                        className="relative aspect-[3/4] shrink-0 overflow-hidden bg-black/5 text-left dark:bg-white/5"
                        onClick={() => setSelectedCase(item)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getImageUrl(item)}
                          alt={item.title}
                          loading="lazy"
                          decoding="async"
                          className="block size-full object-cover transition duration-500 group-hover:scale-105"
                          onError={() => onImageError(item)}
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8">
                          <p className="line-clamp-1 text-sm font-semibold text-white">{item.title}</p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-white/70">
                            {item.category} · {item.author}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center justify-between gap-1.5 px-3 py-2">
                        <button
                          type="button"
                          className="glass-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                          onClick={() => createWithPrompt(item)}
                        >
                          <WandSparkles className="size-3.5" />
                          用它创作
                        </button>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            aria-label="复制 Prompt"
                            className="glass-pill p-1.5"
                            onClick={() => { void copyPrompt(item.prompt) }}
                          >
                            <Copy className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="查看详情"
                            className="glass-pill p-1.5"
                            onClick={() => setSelectedCase(item)}
                          >
                            <Eye className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {hasMore && (
                  <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-6 text-sm opacity-60">
                    <LoaderCircle className="size-4 animate-spin" />
                    正在加载更多灵感（{visibleCases.length} / {filteredCases.length}）
                  </div>
                )}
              </>
            )
          : (
              <section className="glass-panel glass-panel--lg grid min-h-80 place-items-center p-8 text-center">
                <div>
                  <SearchX className="mx-auto size-10 opacity-50" />
                  <h2 className="mt-4 text-xl font-bold">没有找到匹配灵感</h2>
                  <p className="mt-2 text-sm opacity-60">换一个关键词或清空分类筛选再试。</p>
                </div>
              </section>
            )}
      </div>

      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label={selectedCase.title}>
          <button
            type="button"
            aria-label="关闭"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedCase(null)}
          />
          <div className="glass-panel glass-panel--lg relative grid max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-3xl lg:grid-cols-[0.95fr_0.85fr]">
            <div className="min-h-0 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getImageUrl(selectedCase)}
                alt={selectedCase.title}
                className="max-h-[45vh] w-full object-contain lg:h-full lg:max-h-[calc(100vh-2rem)]"
                onError={() => onImageError(selectedCase)}
              />
            </div>
            <div className="flex min-h-0 flex-col p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="glass-chip inline-block px-2.5 py-1 text-xs font-semibold">{selectedCase.category}</span>
                  <h2 className="mt-3 text-2xl font-bold">{selectedCase.title}</h2>
                  <p className="mt-2 text-sm opacity-60">
                    {selectedCase.author} · {selectedCase.sourceLabel || '未标记来源'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="关闭"
                  className="glass-pill p-2"
                  onClick={() => setSelectedCase(null)}
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedCase.sourceUrl && (
                  <a
                    href={selectedCase.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-pill flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                  >
                    <ExternalLink className="size-3.5" />
                    原始来源
                  </a>
                )}
                {selectedCase.tags.map(tag => (
                  <span key={tag} className="glass-pill px-3 py-1.5 text-xs">{tag}</span>
                ))}
              </div>

              <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-black/5 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="label-mono">Prompt</p>
                  <button
                    type="button"
                    className="glass-pill flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                    onClick={() => { void copyPrompt(selectedCase.prompt) }}
                  >
                    <Copy className="size-3.5" />
                    复制
                  </button>
                </div>
                <p className="overflow-y-auto whitespace-pre-wrap text-sm leading-7 opacity-70">
                  {selectedCase.prompt}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="glass-btn flex items-center gap-1.5 px-4 py-2 text-sm font-semibold"
                  onClick={() => createWithPrompt(selectedCase)}
                >
                  <WandSparkles className="size-4" />
                  用它创作
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
