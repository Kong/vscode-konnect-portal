/** Pagination metadata returned by Konnect collection endpoints */
interface PaginationPage {
  /** Current server-reported page number */
  readonly number: number
  /** Number of resources per page */
  readonly size: number
  /** Total number of resources */
  readonly total: number
}

/**
 * Returns the next bounded page number, or undefined when pagination should stop.
 * Advances independently of stale server metadata while rejecting malformed values.
 */
export function getNextPageNumber(currentPage: number, page?: PaginationPage): number | undefined {
  if (!page ||
      !Number.isInteger(page.number) || page.number < 1 ||
      !Number.isInteger(page.size) || page.size < 1 ||
      !Number.isInteger(page.total) || page.total < 1) {
    return undefined
  }

  const totalPages = Math.ceil(page.total / page.size)
  const nextPage = Math.max(currentPage + 1, page.number + 1)
  return nextPage <= totalPages ? nextPage : undefined
}
