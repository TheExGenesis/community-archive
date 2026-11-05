'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { preloadTrendHeat } from './useMapHeat'

export default function TrendHeatPreload({ terms }: { terms: string[] }) {
  const client = useQueryClient()
  useEffect(() => {
    const controller = new AbortController()
    void preloadTrendHeat(client, terms, controller.signal)
    return () => controller.abort()
  }, [client, terms])
  return null
}
