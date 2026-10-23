# Homepage map on mobile

Below 980 CSS pixels, the homepage map and stories share the page's scroll.
The username finder, heat status, time scrubber,
zoom/reset buttons, and selection summary occupy rows outside the map canvas.
The “Show archived” checkbox sits below the map on every screen size. Default
community colors stay flat at every zoom level; archive coverage shading is
opt-in. Explicit keyword heat searches retain their separate heat layer.
Individual hex terms and cluster phrases use darker region colors without an outline.
Country and map-cell clicks highlight immediately and ease the camera into place
over 200ms (instant with reduced motion). Gestures interrupt the animation; desktop double-click still selects
the original individual hex even after the first click zooms.
The featured-account row shows three accounts without horizontal scrolling on phones.
The development preview selector sits after page content; query devtools do
not float over the mobile page.

- One finger scrolls the page, including gestures that start on a map label.
- Two fingers pan and pinch-zoom. Put both fingers down before moving; an
  already-started page scroll continues until the fingers lift.
- A tap highlights and zooms into a community, then updates stories below
  without scrolling the page or opening a sheet. Touch selection has no
  double-click delay. Use Clear selection to return to browsing.
- Scroll down to read stories and back up to return to the same map view.
- Desktop keeps the resizable, independently scrolling story panel, mouse
  drag, modifier-wheel zoom, and keyboard navigation.

`useMapCamera` registers non-passive touch listeners only on the map surface
(including its labels). One-finger movement is left to the browser; an
unclaimed two-finger gesture is cancelled and applied as midpoint translation
plus distance-based zoom. This follows the [Touch Events cancellation
contract](https://www.w3.org/community/reports/touchevents/CG-FINAL-touch-events-20240704/).
Touch movement/cancellation suppresses the subsequent selection click.
`useMobileMapLayout` switches both story pagination observers to the document
viewport and disables the desktop panel scroll reset.

## Focused verification

Run `useMapCamera.test.tsx` and `SelectionFeed.test.tsx`. In a touch browser:

1. Swipe from map to stories and back with one finger, including from a label.
2. Pan with two fingers at a constant distance, then pinch while moving.
3. Lift one finger, cancel a gesture, and start a fresh scroll; no accidental
   selection or stuck gesture should occur.
4. Tap a community: its map view zooms, its stories change, and page scroll
   stays unchanged. Scroll down and back to confirm state retention.
5. At 320 and 390 CSS pixels, check that controls/results stay outside the
   canvas and the page has no horizontal overflow or nested story scroll.
6. Check desktop label selection, drag, modifier-wheel zoom, and keyboard reset.

Automated Chromium touch checks cover browser event dispatch and layout.
Physical iOS Safari and Android Chrome checks remain necessary before a
production rollout; viewport emulation is not evidence of device compatibility.
