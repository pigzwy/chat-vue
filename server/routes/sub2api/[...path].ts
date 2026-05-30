import { defineHandler, HTTPError } from 'nitro'
import { getRequestURL, proxyRequest } from 'nitro/h3'
import { sub2apiRootURL } from '../../utils/sub2api'

const ALLOWED_PREFIXES = ['v1/', 'api/v1/']

export default defineHandler((event) => {
  const url = getRequestURL(event)
  const path = url.pathname.replace(/^\/sub2api\/?/, '')

  if (path.includes('..') || !ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  return proxyRequest(event, `${sub2apiRootURL()}/${path}${url.search}`, {
    headers: {
      'Accept-Encoding': 'identity'
    }
  })
})
