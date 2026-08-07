'use client'

import posthog from 'posthog-js/dist/module.slim'
import {
  AnalyticsExtensions,
  ErrorTrackingExtensions,
  SessionReplayExtensions,
} from 'posthog-js/dist/extension-bundles'
import type { PostHogConfig } from 'posthog-js/dist/module.slim'
import 'posthog-js/dist/exception-autocapture'
import 'posthog-js/dist/posthog-recorder'
import 'posthog-js/dist/web-vitals'

export const postHogMonitoringExtensions: NonNullable<
  PostHogConfig['__extensionClasses']
> = {
  ...AnalyticsExtensions,
  ...ErrorTrackingExtensions,
  ...SessionReplayExtensions,
}

export default posthog
