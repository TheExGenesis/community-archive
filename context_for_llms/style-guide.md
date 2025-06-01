# Website Style Guide

This document outlines the key styling elements, color palettes, typography, and layout patterns used in the Community Archive website. It serves as a reference for maintaining visual consistency.

## 1. Color Palette

Colors are defined using Tailwind CSS utility classes.

### 1.1. Backgrounds

*   **Unified Base Background (for primary page sections like headers, mission, user profiles, etc.):**
    *   Light Mode: `bg-slate-200`
    *   Dark Mode: `dark:bg-slate-900`
    *   Tailwind Variable: `unifiedDeepBlueBase` (used in some page components)
*   **Secondary Accent Background (e.g., "Upload Your Data", "Data & Source Code" sections):
    *   Light Mode: `bg-sky-100`
    *   Dark Mode: `dark:bg-slate-800` (Kept darker for contrast)
*   **Tertiary Accent Background (e.g., "Showcased Apps", "Our Supporters" sections):
    *   Light Mode: `bg-white`
    *   Dark Mode: `dark:bg-slate-900`
*   **Card Backgrounds (general content cards):
    *   Light Mode: `bg-white`
    *   Dark Mode: `dark:bg-slate-800`
*   **Inset/Subtle Card Backgrounds (e.g., "Featured Archives" panel on homepage):
    *   Light Mode: `bg-slate-100/50` (semi-transparent lighter slate)
    *   Dark Mode: `dark:bg-slate-800/50` (semi-transparent darker slate)
*   **Gradient Card Backgrounds (e.g., "Data & Source Code" info panels, "Built with the Archive" app cards):
    *   Light Mode: `bg-slate-100 bg-gradient-to-br from-slate-50 to-slate-200`
    *   Dark Mode: `dark:bg-slate-800 dark:bg-gradient-to-br dark:from-slate-700 dark:to-slate-800`

### 1.2. Text Colors

*   **Primary Text:**
    *   Light Mode: `text-gray-900`
    *   Dark Mode: `dark:text-white` or `dark:text-gray-100`
*   **Secondary/Muted Text:**
    *   Light Mode: `text-gray-600` or `text-gray-700`
    *   Dark Mode: `dark:text-gray-300` or `dark:text-gray-400`
*   **Link Text:**
    *   Light Mode: `text-blue-600 hover:underline`
    *   Dark Mode: `dark:text-blue-400 dark:hover:underline`
*   **Emphasis/Strong Text within paragraphs:**
    *   Light Mode: `text-gray-800 font-semibold`
    *   Dark Mode: `dark:text-gray-100 font-semibold`

### 1.3. Glow Effect

*   **Base Color Variable**: `glowBaseColor = "hsla(200, 100%, 60%,"` (a cool blue)
*   The glow is typically applied via inline styles using `backgroundImage: radial-gradient(...)`.

## 2. Glow Effects Styles

These are JavaScript style objects applied to sections for a subtle visual lift.

*   **`glowStyleStrong`**: Used for the main background wrapper of top page sections.
    *   `backgroundImage: radial-gradient(ellipse at 50% 0%, ${glowBaseColor}0.2) 0%, transparent 50%)`
*   **`glowStyleModerate`**: Used for secondary sections or larger content blocks.
    *   `backgroundImage: radial-gradient(ellipse at 50% 0%, ${glowBaseColor}0.15) 0%, transparent 50%)`
*   **`glowStyleSubtleDiffuse`**: Used for inset panels or smaller focused areas.
    *   `backgroundImage: radial-gradient(ellipse at 50% 0%, ${glowBaseColor}0.07) 0%, transparent 70%)`
*   **`glowStyleCarouselFocused`**: Specifically for sections housing carousels, with a slightly adjusted focus point.
    *   `backgroundImage: radial-gradient(ellipse at 50% 30%, ${glowBaseColor}0.1) 0%, transparent 50%)`

## 3. Layout

*   **Main Page Structure**:
    *   Pages are typically wrapped in a `<main>` tag.
    *   Content is divided into full-width `<section>` elements.
    *   Each section often has the `unifiedDeepBlueBase` background or an alternative from the palette, and a glow style.
    *   Padding: `sectionPaddingClasses = "py-16 md:py-20"` (or `py-12 md:py-16` for user profile page and similar detail pages).
    *   Content within sections is usually centered and constrained by a `div` with `contentWrapperClasses`:
        *   Homepage/General: `w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10`
        *   User Directory (wider table): `w-full max-w-6xl mx-auto ...`
        *   User Profile Page (slightly narrower focus): `w-full max-w-4xl mx-auto ...`
*   **Sticky Header**: The main header is sticky (`sticky top-0 z-50`) with a blurred background (`bg-white/80 dark:bg-gray-950/80 backdrop-blur-md`).
*   **Flexbox and Grid**: Tailwind's flexbox and grid utilities are used extensively for component layout (e.g., info panels, avatar lists).

## 4. Typography

*   **Font Family**: `GeistSans` (applied globally in `layout.tsx`). Anti-aliased (`antialiased`).
*   **Headings** (general guidance, may vary slightly by page context):
    *   **H1 (Page Title/Hero)**: `text-5xl md:text-6xl font-bold tracking-tight` (Homepage Hero) or `text-3xl sm:text-4xl font-bold` (User Profile Name).
    *   **H2 (Section Titles)**: `text-3xl font-semibold` (Homepage Sections) or `text-2xl font-semibold mb-4` (Card Titles within pages).
    *   **H3 (Sub-headings/Card Titles)**: `text-xl font-semibold` (e.g., InfoPanel titles, placeholder titles).
*   **Paragraph Text**:
    *   Homepage Hero Subtitle: `text-xl md:text-2xl`
    *   General Section Descriptions: `text-lg`
    *   Card Descriptions/Body Text: `text-sm` or `text-base`.
*   **Stats Text** (e.g., community stats, user stats within cards):
    *   Generally `text-sm` or `text-base` with `font-semibold` for numbers.
    *   `CommunityStats` component on homepage: `text-xl`.

## 5. Card Component Styling

Cards are a common UI element for grouping content.

*   **Standard Card (`UserProfile`, `AdvancedSearchForm`, content sections on `user/[account_id]` page):**
    *   `bg-white dark:bg-slate-800`
    *   `p-6 sm:p-8` (padding)
    *   `rounded-lg` or `rounded-xl`
    *   `shadow-lg` (sometimes `shadow-xl` for more prominence)
*   **Info Panels (Homepage "Data & Source Code") / App Cards (Homepage "Built with the Archive")**:
    *   Gradient background (see 1.1 Backgrounds)
    *   `p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 h-full`
    *   Typically include an icon (`text-4xl mb-4 text-blue-500 dark:text-blue-400`).
*   **Inset Panel ("Featured Archives" on Homepage):**
    *   `bg-slate-100/50 dark:bg-slate-800/50` (semi-transparent)
    *   `rounded-xl p-8 md:p-10 shadow-lg`
    *   Has its own `glowStyleSubtleDiffuse`.

## 6. Buttons

Uses `shadcn/ui` Button component as a base, styled with Tailwind.

*   **Primary Action (e.g., Donate Button):**
    *   `px-8 py-3 text-lg font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 shadow-md hover:shadow-lg`
*   **Standard Button (e.g., Search button in Advanced Search):**
    *   Often uses default `shadcn/ui` button styling or `variant="outline"`.
    *   Upload button (`file-upload-dialog.tsx`): Primary `shadcn/ui` button.
*   **Icon Buttons / Ghost Buttons (e.g., Mobile Menu trigger, Theme Toggle):**
    *   `variant="ghost" size="icon"`.

## 7. Navigation

*   **Desktop Header (`src/components/HeaderNavigation.tsx`):**
    *   Uses `shadcn/ui NavigationMenu`.
    *   Links have `hover:bg-gray-100 dark:hover:bg-gray-800`.
    *   Active link: `bg-gray-100 dark:bg-gray-800 font-semibold`.
    *   Hidden below `md` breakpoint (`hidden md:flex`).
*   **Mobile Menu (`src/components/MobileMenu.tsx`):**
    *   Uses `shadcn/ui Sheet` (drawer from left).
    *   Triggered by a hamburger icon (`lucide-react MenuIcon`), visible only below `md` breakpoint (`md:hidden`).
    *   Links are full-width, `px-3 py-2 rounded-md text-base font-medium`.
    *   Active link: `bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100`.
    *   Inactive link: `text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700`.

## 8. Responsive Design

*   **Approach**: Primarily uses Tailwind CSS responsive prefixes (e.g., `sm:`, `md:`, `lg:`).
*   **Key Examples**: 
    *   Navigation (as described above).
    *   `AvatarList`: Uses `flex-wrap justify-center` to allow avatars to flow onto multiple lines.
    *   Grid layouts often change column count, e.g., `grid-cols-1 md:grid-cols-3`.
    *   Text sizes and padding are often adjusted for different breakpoints.

This guide should help in creating new pages or modifying existing ones while keeping the visual style consistent. 