# Website Style Guide

This document outlines the key styling elements, color palettes, typography, and layout patterns used in the Community Archive website. It serves as a reference for maintaining visual consistency. The styling is primarily managed through Tailwind CSS and adopts the conventions of `shadcn/ui`, including CSS variables for theming.

## 1. Color Palette

Colors are defined using CSS variables and applied with Tailwind CSS utility classes. The base definitions can be found in `src/app/globals.css`.

### 1.1. Primary Semantic Colors (Theme-aware)

These variables automatically adapt to light and dark modes.

*   **Background**:
    *   Page Background: `bg-background` (e.g., `hsl(var(--background))`)
    *   Card/Component Background: `bg-card` (e.g., `hsl(var(--card))`)
*   **Foreground (Text)**:
    *   Primary Text: `text-foreground` (e.g., `hsl(var(--foreground))`)
    *   Card Text: `text-card-foreground` (e.g., `hsl(var(--card-foreground))`)
*   **Primary Accent (Buttons, active elements)**:
    *   Background: `bg-primary` (e.g., `hsl(var(--primary))`)
    *   Text: `text-primary-foreground` (e.g., `hsl(var(--primary-foreground))`)
*   **Secondary Accent (Less prominent interactive elements)**:
    *   Background: `bg-secondary` (e.g., `hsl(var(--secondary))`)
    *   Text: `text-secondary-foreground` (e.g., `hsl(var(--secondary-foreground))`)
*   **Muted (Subtle backgrounds and text)**:
    *   Background: `bg-muted` (e.g., `hsl(var(--muted))`)
    *   Text: `text-muted-foreground` (e.g., `hsl(var(--muted-foreground))`)
*   **Accent (Hover states, focus indicators)**:
    *   Background: `bg-accent` (e.g., `hsl(var(--accent))`)
    *   Text: `text-accent-foreground` (e.g., `hsl(var(--accent-foreground))`)
*   **Destructive (Error states, delete actions)**:
    *   Background: `bg-destructive` (e.g., `hsl(var(--destructive))`)
    *   Text: `text-destructive-foreground` (e.g., `hsl(var(--destructive-foreground))`)
*   **Borders**: `border-border` (e.g., `hsl(var(--border))`)
*   **Input Fields**: `bg-input` (e.g., `hsl(var(--input))`), text often `text-foreground`.
*   **Focus Ring**: `ring-ring` (e.g., `hsl(var(--ring))`)

### 1.2. Specific Usage Notes from Previous Palette (To be refactored or verified if still custom)

The following were previously defined with specific Tailwind classes. Their current equivalents using the semantic color system should be preferred. Some page layouts may still use direct color classes for broader page sectioning.

*   **Unified Base Background for Main Page Sections (e.g., `src/app/page.tsx`, `src/app/tweets/page.tsx`):**
    *   Uses a local constant: `const unifiedDeepBlueBase = "bg-slate-200 dark:bg-slate-900";`. This provides a distinct background from the default `bg-background` for these specific page structures.
*   **Secondary Accent Background (e.g., "Upload Your Data", "Data & Source Code" sections on homepage):**
    *   Previously `bg-sky-100` (light) and `dark:bg-slate-800` (dark).
    *   Verify if these sections now use `bg-secondary`, `bg-muted`, or `bg-accent`. `src/app/page.tsx` indicates a move to `bg-slate-100 dark:bg-slate-700` for info panels, which are closer to `bg-secondary` or `bg-muted`.
*   **Tertiary Accent Background (e.g., "Showcased Apps", "Our Supporters" sections on homepage):**
    *   Previously `bg-white` (light) and `dark:bg-slate-900` (dark).
    *   Consider `bg-card` or `bg-background` for light mode, and `bg-card` or a slightly off-background color for dark mode (e.g. `bg-muted`).
*   **Link Text:**
    *   Standard links typically use browser defaults or can be styled with `text-primary` or `text-blue-600 dark:text-blue-400` and `hover:underline`. Specific components might have their own link styling.

### 1.3. Glow Effects

*   Glow effects previously implemented using custom JavaScript styles (`glowStyleStrong`, `glowBaseColor`, etc.) have been largely **removed** from the project to simplify the visual design. Any remaining glow effects are likely minimal and part of specific component libraries or very targeted CSS.

## 2. Layout

*   **Main Page Structure**:
    *   Pages are typically wrapped in a `<main>` tag.
    *   Content is often divided into full-width `<section>` elements.
    *   Specific pages (e.g., homepage, user pages) use the `unifiedDeepBlueBase` (`bg-slate-200 dark:bg-slate-900`) for main section backgrounds. Other content typically resides on `bg-background` or `bg-card`.
    *   Padding: `sectionPaddingClasses = "py-12 md:py-16 lg:py-20"` (example, verify actual common values).
    *   Content within sections is usually centered and constrained by a `div` with `contentWrapperClasses`:
        *   Example: `w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8` (adjust `max-w-*` as needed).
*   **Sticky Header**: The main header is sticky (`sticky top-0 z-50`) with a blurred background (`bg-background/80 backdrop-blur-md` - verify exact opacity and color).
*   **Flexbox and Grid**: Tailwind's flexbox and grid utilities are used extensively for component layout.
*   **Border Radius**: Governed by CSS variable `--radius: 0.3rem;`. Applied as `rounded-lg` (`var(--radius)`), `rounded-md` (`calc(var(--radius) - 2px)`), `rounded-sm` (`calc(var(--radius) - 4px)`).

## 3. Typography

*   **Font Family**: `GeistSans` (applied globally in `src/app/layout.tsx`). Anti-aliased (`antialiased`).
*   **Headings** (general guidance, may vary by component and page context):
    *   **H1 (Page Title/Hero)**: Example: `text-4xl lg:text-5xl font-bold tracking-tight`.
    *   **H2 (Section Titles)**: Example: `text-3xl font-semibold`.
    *   **H3 (Sub-headings/Card Titles)**: Example: `text-xl font-semibold`.
*   **Paragraph Text**: Generally `text-base`. Larger descriptive text might use `text-lg`.
*   **Muted Text**: Use `text-muted-foreground` for less emphasis.

## 4. Card Component Styling

Cards are a common UI element for grouping content, typically using `bg-card` and `text-card-foreground`.

*   **Standard Card (e.g., `shadcn/ui` Card component):**
    *   Background: `bg-card`
    *   Padding: Common values include `p-4`, `p-6`.
    *   Border Radius: `rounded-lg` (uses `--radius`).
    *   Shadows: Custom large shadows like `shadow-lg` or `shadow-xl` have been mostly removed from general cards. `shadcn/ui` components (Dialogs, Popovers, Dropdown Menus, etc.) may have their own built-in, more subtle shadows (e.g., `shadow-md` or `shadow-lg` as part of their default styles). `TieredSupportersDisplay` uses `shadow-xl` for specific decorative effect on avatars.
*   **Info Panels / App Cards (Homepage):**
    *   These have moved away from gradient backgrounds and heavy shadows.
    *   Current: `bg-slate-100 dark:bg-slate-700` (as per comment in `src/app/page.tsx`). This is closer to `bg-muted` or `bg-secondary`.
    *   Padding and border radius should be consistent.

## 5. Buttons

Primarily uses the `shadcn/ui` Button component (`src/components/ui/button.tsx`), styled with variants.

*   **Default Button (Primary Action):**
    *   `bg-primary text-primary-foreground hover:bg-primary/90`
*   **Secondary Button:**
    *   `bg-secondary text-secondary-foreground hover:bg-secondary/80`
*   **Outline Button:**
    *   `border border-input bg-background hover:bg-accent hover:text-accent-foreground`
*   **Ghost Button (for icon buttons, subtle actions):**
    *   `hover:bg-accent hover:text-accent-foreground`
*   **Link Button (styled as text):**
    *   `text-primary underline-offset-4 hover:underline`
*   **Destructive Button:**
    *   `bg-destructive text-destructive-foreground hover:bg-destructive/90`
*   Shadows on buttons (e.g. `shadow-md`, `shadow-lg`) have been generally removed for a flatter look.

## 6. Navigation

*   **Desktop Header (`src/components/HeaderNavigation.tsx`):**
    *   Uses `shadcn/ui NavigationMenu`.
    *   Links likely use `bg-accent` or `bg-muted` for hover/active states. Verify specific classes.
    *   Hidden below `md` breakpoint (`hidden md:flex`).
*   **Mobile Menu (`src/components/MobileMenu.tsx`):**
    *   Uses `shadcn/ui Sheet` (drawer).
    *   Triggered by a hamburger icon, visible only below `md` breakpoint (`md:hidden`).
    *   Links should use appropriate hover/active states with semantic colors (e.g., `hover:bg-accent`, active: `bg-muted` or `bg-accent`).

## 7. Responsive Design

*   **Approach**: Primarily uses Tailwind CSS responsive prefixes (e.g., `sm:`, `md:`, `lg:`).
*   **Key Examples**:
    *   Navigation (as described above).
    *   `AvatarList`: Uses `flex-wrap justify-center`.
    *   Grid layouts often change column count (e.g., `grid-cols-1 md:grid-cols-3`).
    *   Text sizes and padding are often adjusted for different breakpoints.

This guide should help in creating new pages or modifying existing ones while keeping the visual style consistent. 