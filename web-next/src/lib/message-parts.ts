import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from 'ai'
import { isReasoningUIPart, isTextUIPart } from 'ai'

function sourceToMarkdownLink(url: string) {
  try {
    return ` [${new URL(url).hostname.replace(/^www\./, '')}](${url})`
  } catch {
    return ` [来源](${url})`
  }
}

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'
const THINK_SEPARATOR = '\n\n---\n\n'

type MessagePart = UIMessagePart<UIDataTypes, UITools>
type TextLikePart = Extract<MessagePart, { type: 'text' }>
type ReasoningLikePart = Extract<MessagePart, { type: 'reasoning' }>

export function getMergedParts(parts: UIMessage['parts']): UIMessage['parts'] {
  const result: UIMessage['parts'] = []

  for (const part of parts.flatMap(splitThinkTags)) {
    const prev = result[result.length - 1]

    if (part.type === 'source-url') {
      if (prev && isTextUIPart(prev)) appendText(result, sourceToMarkdownLink(part.url), prev.state)
      continue
    }

    if (isTextUIPart(part) && prev && isTextUIPart(prev)) {
      appendText(result, part.text, part.state)
      continue
    }

    if (isReasoningUIPart(part) && prev && isReasoningUIPart(prev)) {
      appendReasoning(result, joinReasoningText(prev.text, part.text), part.state)
      continue
    }

    result.push(part)
  }

  return result
}

function splitThinkTags(part: MessagePart): MessagePart[] {
  if (!isTextUIPart(part) || !part.text.includes(THINK_OPEN_TAG)) return [part]

  const result: MessagePart[] = []
  let cursor = 0

  while (cursor < part.text.length) {
    const openIndex = part.text.indexOf(THINK_OPEN_TAG, cursor)

    if (openIndex === -1) {
      pushText(result, part.text.slice(cursor), part)
      break
    }

    pushText(result, part.text.slice(cursor, openIndex), part)

    const reasoningStart = openIndex + THINK_OPEN_TAG.length
    const closeIndex = part.text.indexOf(THINK_CLOSE_TAG, reasoningStart)
    const reasoningEnd = closeIndex === -1 ? part.text.length : closeIndex

    pushReasoning(result, part.text.slice(reasoningStart, reasoningEnd), part)
    cursor = closeIndex === -1 ? part.text.length : closeIndex + THINK_CLOSE_TAG.length
  }

  return result
}

function pushText(result: MessagePart[], text: string, original: TextLikePart) {
  if (!text) return
  result.push({
    ...original,
    type: 'text',
    text: stripLooseThinkCloseTag(text)
  })
}

function pushReasoning(result: MessagePart[], text: string, original: TextLikePart) {
  const reasoningText = stripLooseThinkCloseTag(text).trim()
  if (!reasoningText) return
  result.push({
    type: 'reasoning',
    text: reasoningText,
    state: original.state,
    providerMetadata: original.providerMetadata
  })
}

function appendText(result: UIMessage['parts'], text: string, state: TextLikePart['state']) {
  const prev = result[result.length - 1]
  if (!prev || !isTextUIPart(prev)) return
  result[result.length - 1] = { ...prev, text: prev.text + text, state: state ?? prev.state }
}

function appendReasoning(result: UIMessage['parts'], text: string, state: ReasoningLikePart['state']) {
  const prev = result[result.length - 1]
  if (!prev || !isReasoningUIPart(prev)) return
  result[result.length - 1] = { ...prev, text, state: state ?? prev.state }
}

function joinReasoningText(current: string, next: string) {
  if (!current) return next
  if (!next) return current
  return `${current}${THINK_SEPARATOR}${next}`
}

function stripLooseThinkCloseTag(text: string) {
  return text.split(THINK_CLOSE_TAG).join('')
}
