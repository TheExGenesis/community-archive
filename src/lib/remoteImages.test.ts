import { isTwitterImage } from './remoteImages'

describe('isTwitterImage', () => {
  it('matches pbs.twimg.com URLs', () => {
    expect(
      isTwitterImage('https://pbs.twimg.com/profile_images/1/a_normal.jpg'),
    ).toBe(true)
    expect(
      isTwitterImage('https://pbs.twimg.com/profile_banners/1/2/1500x500'),
    ).toBe(true)
  })

  it('rejects other hosts, relative paths and empty values', () => {
    expect(isTwitterImage('https://www.gravatar.com/avatar/x')).toBe(false)
    expect(isTwitterImage('https://pbs.twimg.com.evil.example/x.jpg')).toBe(
      false,
    )
    expect(isTwitterImage('/images/logo.png')).toBe(false)
    expect(isTwitterImage(null)).toBe(false)
    expect(isTwitterImage(undefined)).toBe(false)
  })
})
