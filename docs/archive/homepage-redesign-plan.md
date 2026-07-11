# Homepage Redesign Plan

## Overview

Simplify the homepage to make CTAs more prominent and reduce cognitive load. Focus on getting users to take action immediately.

---

## Section 1: Hero (Above the Fold)

### Title
```
Community Archive
```

### Subtitle (UPDATED)
```
An open Twitter database.
```
- Short and clear

### Three Big CTA Buttons (NEW)
Horizontal row of 3 large buttons, each with tiny explanatory text below:

#### Button 1: Opt In
- **Button text:** "Opt In"
- **Tiny text below:** "Give permission to archive your public tweets"
- **Behavior:** If not signed in, clicking signs you in via Twitter OAuth. If signed in, opts you in immediately.
- **Style:** Primary green button, large

#### Button 2: Install Extension
- **Button text:** "Install Extension"
- **Tiny text below:** "Archive tweets as you browse"
- **Behavior:** Opens Chrome Web Store in new tab (target="_blank")
- **Style:** Secondary/outline button, large

#### Button 3: Upload Archive
- **Button text:** "Upload Archive"
- **Tiny text below:** "Export from X Settings > Download your data"
- **Behavior:** If not signed in, signs you in first. If signed in, opens file selector directly.
- **Style:** Secondary/outline button, large

### Social Proof (KEEP - move directly under buttons)
- Stats bar (accounts, tweets, likes)
- Avatar list of top followed accounts
- Keep compact, single row

---

## Section 2: Get Started with Apps (REPLACES "Built with the Archive")

### Section Title
```
Get Started
```

### Three Featured App Cards (side by side)
Large cards with:
- Placeholder image area (screenshot of app)
- App name
- Short description

#### Card 1: Bird's Eye
- **Link:** https://theexgenesis--community-archive-birdseye-run.modal.run/
- **Description:** "See your tweets by topic and over time"
- **Image:** Placeholder for screenshot

#### Card 2: Best Strands
- **Link:** (need URL - map of conversations)
- **Description:** "Explore the best conversations"
- **Image:** Placeholder for screenshot

#### Card 3: Bangers
- **Link:** (need URL - most important tweets browser)
- **Description:** "Browse the most impactful tweets"
- **Image:** Placeholder for screenshot

### Gallery Grid (below featured cards)
Grid layout (3-4 columns) showing remaining apps:
- Archive Trends
- Twitter Archive Toolkit
- Personal Semantic Search
- Banger Bot
- Historical Highlights Bot
- Thread of Community Builds

Each gallery item: small card with icon + name + one-line description

---

## Section 3: Data & Source Code (KEEP - minor tweaks)
- GitHub, Discord, Documentation links
- Keep the 3-panel layout

---

## Section 4: Our Supporters (KEEP as-is)
- Major backers
- Community backers
- Donate button

---

## Section 5: Footer (KEEP as-is)

---

## Components to Create/Modify

### New Components
1. `HeroCTAButtons.tsx` - The three big action buttons with auth logic
2. `FeaturedAppsSection.tsx` - The 3 featured app cards
3. `AppGallery.tsx` - Grid of remaining apps

### Components to Modify
1. `page.tsx` - Restructure sections, update subtitle
2. `HomeOptInWidget.tsx` - Extract opt-in logic for use in HeroCTAButtons
3. `ShowcasedApps.tsx` - Replace with new FeaturedAppsSection + AppGallery

### Components to Remove/Simplify
1. Remove the step-by-step card layout in Section 4 (Real-time Tweet Streaming)
2. Remove Section 5 (Upload Your Data) - merged into hero CTA
3. Remove "Our Mission" section - can go to About page

---

## Layout Flow (Mobile-First)

```
┌─────────────────────────────────────┐
│         Community Archive           │
│   An open Twitter database.         │
│      Anyone can download.           │
│                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐│
│  │ Opt In  │ │ Install │ │ Upload  ││
│  │         │ │Extension│ │ Archive ││
│  └─────────┘ └─────────┘ └─────────┘│
│   (tiny text) (tiny text) (tiny text)│
│                                     │
│  ━━━━━ 500 accounts • 2M tweets ━━━━│
│  [avatar] [avatar] [avatar] ...     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│           Get Started               │
│                                     │
│ ┌───────────┐┌───────────┐┌───────────┐
│ │ [image]   ││ [image]   ││ [image]   │
│ │ Bird's Eye││Best Strands││ Bangers  │
│ │ See your  ││ Explore   ││ Browse   │
│ │ tweets... ││ convos... ││ top...   │
│ └───────────┘└───────────┘└───────────┘
│                                     │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐       │
│  │App1│ │App2│ │App3│ │App4│  ...  │
│  └────┘ └────┘ └────┘ └────┘       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│       Data & Source Code            │
│  [GitHub] [Discord] [Docs]          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         Our Supporters              │
│            (as-is)                  │
└─────────────────────────────────────┘
```

---

## Questions to Clarify

1. **Best Strands URL** - What's the link for the "map of conversations" app?
2. **Bangers URL** - What's the link for the "most important tweets" browser?
3. **Image placeholders** - Should I add actual placeholder boxes or leave for later?

---

## Implementation Order

1. Create `HeroCTAButtons.tsx` with auth + opt-in + upload logic
2. Update `page.tsx` hero section (subtitle, remove mission)
3. Create `FeaturedAppsSection.tsx` with 3 cards
4. Create `AppGallery.tsx` for remaining apps
5. Replace `ShowcasedApps` with new components
6. Remove old sections (streaming cards, upload section)
7. Test auth flows and responsive layout
