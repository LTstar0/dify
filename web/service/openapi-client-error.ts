function isAbortError(error: unknown) {
  if (typeof error === 'string') return error === 'AbortError' || error.startsWith('AbortError:')
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

export function logOpenApiClientError(error: unknown) {
  if (isAbortError(error)) return
  if (error instanceof Response) {
    console.error(`Request failed: ${error.status} ${error.url}`)
    return
  }
  console.error(error)
}
