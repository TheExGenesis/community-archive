'use client'
import { HelpCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import styles from './hero.module.css'

export default function MapHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Map navigation tips"
          title="Map navigation tips"
        >
          <HelpCircle size={19} aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className={styles.mapHelp}>
        <DialogHeader>
          <DialogTitle>Explore the community map</DialogTitle>
          <DialogDescription>
            A few ways to find people, conversations, and ideas.
          </DialogDescription>
        </DialogHeader>
        <dl className={styles.helpTips}>
          <div>
            <dt>Move around</dt>
            <dd>
              Hold Cmd or Ctrl and scroll to zoom; drag to pan. On touch
              screens, scroll the page with one finger; use two fingers to pan
              and pinch to zoom. Use + / − to zoom or ↺ to reset the view.
            </dd>
          </div>
          <div>
            <dt>Explore a community</dt>
            <dd>
              Click a community to browse its Digest, Best, Latest, Most liked,
              and Strands. Double-click a hexagon to select just that cell.
            </dd>
          </div>
          <div>
            <dt>Make room for posts</dt>
            <dd>
              Drag the divider between the map and sidebar to resize it. Focus
              the divider and use the left or right arrow keys, or double-click
              it to reset the width.
            </dd>
          </div>
          <div>
            <dt>Follow a conversation</dt>
            <dd>
              Hover a digest story to see its participants on the map. Open it
              to read posts; hover a post to find its author.
            </dd>
          </div>
          <div>
            <dt>Explore a trending idea</dt>
            <dd>
              Hover a trending term to preview its heatmap, or click to keep it
              open. Use the month slider or Play to explore its history; Clear
              heatmap returns to the map.
            </dd>
          </div>
          <div>
            <dt>Find yourself</dt>
            <dd>
              Use “Where am I?” after signing in and opting in to locate your
              account, if it is in the map snapshot.
            </dd>
          </div>
          <div>
            <dt>Keep exploring below</dt>
            <dd>
              Scroll normally over the map to move down the page, or follow
              “Read the Daily Digest.”
            </dd>
          </div>
          <div>
            <dt>Use the keyboard</dt>
            <dd>
              Focus the map, then use arrow keys to explore cells, Enter to
              select a community, Shift + Enter for one cell, and Escape to
              clear selection.
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  )
}
