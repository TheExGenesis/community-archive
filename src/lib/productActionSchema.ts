export const productFeatures = [
  'social_graph',
  'conversation_map',
  'strands',
  'birdseye',
  'tweet',
] as const
export const productActions = [
  'node_selected',
  'group_selected',
  'view_changed',
  'topic_opened',
  'summary_expanded',
  'source_opened',
  'thread_expanded',
  'searched',
  'filter_changed',
  'load_more',
  'link_copied',
] as const
export type ProductFeature = (typeof productFeatures)[number]
export type ProductAction = (typeof productActions)[number]
