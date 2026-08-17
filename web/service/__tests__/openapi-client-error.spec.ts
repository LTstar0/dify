import { afterEach, describe, expect, it, vi } from 'vitest'
import { logOpenApiClientError } from '../openapi-client-error'

describe('logOpenApiClientError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not treat cancelled fetches as console errors', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logOpenApiClientError(new DOMException('signal is aborted without reason', 'AbortError'))
    logOpenApiClientError('AbortError: signal is aborted without reason')

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('logs failed responses with status and url', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = new Response(null, { status: 400, statusText: 'Bad Request' })
    Object.defineProperty(response, 'url', { value: 'http://localhost/console/api/llm' })

    logOpenApiClientError(response)

    expect(errorSpy).toHaveBeenCalledWith('Request failed: 400 http://localhost/console/api/llm')
  })
})
