import { ImageResponse } from 'next/og'

export const alt = 'Community Archive — explore the conversations we preserve'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '72px 80px',
          background: '#f8fbfd',
          color: '#111113',
          borderTop: '18px solid #25aadf',
        }}
      >
        <div
          style={{
            display: 'flex',
            color: '#168bb8',
            fontSize: 25,
            letterSpacing: 3,
          }}
        >
          COMMUNITY-ARCHIVE.ORG
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 88,
              fontWeight: 700,
              letterSpacing: -4,
            }}
          >
            Community Archive
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontSize: 36,
              lineHeight: 1.35,
              maxWidth: 900,
              color: '#5e6570',
            }}
          >
            Explore the people, ideas, and conversations we preserve together.
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 25, color: '#168bb8' }}>
          Search tweets · Discover people · Follow the conversation
        </div>
      </div>
    ),
    size,
  )
}
