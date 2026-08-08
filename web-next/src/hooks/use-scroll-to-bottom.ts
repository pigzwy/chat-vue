'use client'

// 参照 vercel/ai-chatbot 的 use-scroll-to-bottom（MIT）适配:
// 黏底自动滚动(MutationObserver+ResizeObserver) + 用户主动上滚时让位
import { useCallback, useEffect, useRef, useState } from 'react'

export function useScrollToBottom() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)
  const isUserScrollingRef = useRef(false)

  const checkIfAtBottom = useCallback(() => {
    if (!containerRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    return scrollTop + clientHeight >= scrollHeight - 100
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!containerRef.current) return
    containerRef.current.scrollTo({ behavior, top: containerRef.current.scrollHeight })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let scrollTimeout: ReturnType<typeof setTimeout>

    const handleScroll = () => {
      isUserScrollingRef.current = true
      clearTimeout(scrollTimeout)

      const atBottom = checkIfAtBottom()
      setIsAtBottom(atBottom)
      isAtBottomRef.current = atBottom

      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false
      }, 150)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [checkIfAtBottom])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scrollIfNeeded = () => {
      if (isAtBottomRef.current && !isUserScrollingRef.current) {
        requestAnimationFrame(() => {
          container.scrollTo({ behavior: 'instant', top: container.scrollHeight })
          setIsAtBottom(true)
          isAtBottomRef.current = true
        })
      }
    }

    const mutationObserver = new MutationObserver(scrollIfNeeded)
    mutationObserver.observe(container, { characterData: true, childList: true, subtree: true })

    const resizeObserver = new ResizeObserver(scrollIfNeeded)
    resizeObserver.observe(container)
    for (const child of container.children) {
      resizeObserver.observe(child)
    }

    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  const reset = useCallback(() => {
    setIsAtBottom(true)
    isAtBottomRef.current = true
    isUserScrollingRef.current = false
  }, [])

  return { containerRef, isAtBottom, scrollToBottom, reset }
}
