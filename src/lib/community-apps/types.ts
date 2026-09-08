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
export interface AppDataManifest {
  version: 1
  prefix: string
  importedAt: string
  birdseye: { username: string; hiddenClusterIds?: string[] }[]
}
