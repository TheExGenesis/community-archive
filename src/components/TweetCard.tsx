/**
 * Canonical full-fidelity tweet card entrypoint for product surfaces.
 *
 * Adapters must populate `media` and `quotedTweet`; do not replace this with a
 * surface-specific partial tweet renderer.
 */
export {
  TweetRow as TweetCard,
  TweetRow as default,
  type TweetCardProps,
} from './portal/TweetRow'
