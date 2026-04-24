import { defineHandler } from 'nitro'
import { getRequestURL, proxyRequest } from 'nitro/h3'
import { sub2apiRootURL } from '../../utils/sub2api'

export default defineHandler((event) => {
  const url = getRequestURL(event)
  const path = url.pathname.replace(/^\/sub2api\/?/, '')
  return proxyRequest(event, `${sub2apiRootURL()}/${path}${url.search}`, {
    headers: {
      'Accept-Encoding': 'identity'
    }
  })
})
