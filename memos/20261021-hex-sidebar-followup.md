# Sidebar follow-up

Digest is the sole top-level view; cluster tabs remain. Best has Last 7 days (default) and All time with an accessible ranking explanation. Removed per-card member-quote counts. Single-click selects a community; double-click selects a blue outlined individual hex, including empty cells. Shift+Enter is the keyboard equivalent. Wheel containment is preserved.

Visible story cards preload at most two requests concurrently; details share feeds' 30-second freshness and 60-second memory retention. Selecting a community starts Latest alongside the default digest. Story tweets use canonical live hydration, preserving focal ordering, public quoted context, images, and opt-outs. Top-level posts still require membership.

Validation: nine focused frontend tests, TypeScript and scoped lint passed. Local browser: top tabs absent; preloaded story click ~401ms, Latest ~356ms; TheZvi's formerly missing Marcus Williams quote and image visible; double-click selected one cell and single-click restored community selection. These are preloaded timings, not a cold-network guarantee.

Backend dependency: control-panel PR291. Candidate against read-only production data measured Latest 392ms/288ms first/second page, Best week 377ms/254ms, excluding website/network and cold membership resolution. CI passed; deployment approval requested. Week fails closed against an old gateway rather than showing all-time results. Quiet selections retain a potentially slower lifetime fallback. Homepage remains local/preview in draft PR1126.
