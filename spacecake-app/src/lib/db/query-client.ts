import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // collections refetch on invalidation, not on window focus
      refetchOnWindowFocus: false,
      // keep stale data while refetching
      staleTime: Infinity,
    },
  },
})
