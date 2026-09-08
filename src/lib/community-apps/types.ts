export interface EvidenceItem {
  label: string
  description: string
  tweetIds: string[]
}
export interface BirdseyeCluster {
  id: string
  name: string
  summary: string
  participants: string[]
  tweetIds: string[]
  years: { year: number; count: number }[]
  sections: { name: string; items: EvidenceItem[] }[]
}
export interface BirdseyeAnalysis {
  username: string
  groups: { name: string; clusterIds: string[] }[]
  clusters: BirdseyeCluster[]
}
export interface Strand {
  id: string
  title: string
  summary: string
  rating: number
  username: string
  text: string
  createdAt: string
  participants: string[]
  essentialTweets: { id: string; annotation: string }[]
  totalPosts?: number
  mapLabel?: string
  activity?: { months: string[]; counts: number[] }
  position?: { x: number; y: number; cluster: number; color: string }
}
export interface AppDataManifest {
  version: 1
  prefix: string
  importedAt: string
  strandsGeneratedAt: string
  birdseye: { username: string; hiddenClusterIds?: string[] }[]
}
