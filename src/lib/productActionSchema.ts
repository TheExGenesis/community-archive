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

export const homepageMapActions = [
  'community_selected',
  'hex_selected',
  'selection_cleared',
  'find_submitted',
  'content_tab_selected',
  'story_opened',
  'members_opened',
  'archive_overlay_toggled',
  'zoom_in_clicked',
  'zoom_out_clicked',
  'view_reset',
] as const
export const homepageMapTabs = [
  'Stories',
  'Bangers',
  'Latest',
  'Most liked',
  'Strands',
] as const
export type HomepageMapAction = (typeof homepageMapActions)[number]
export type HomepageMapTab = (typeof homepageMapTabs)[number]
