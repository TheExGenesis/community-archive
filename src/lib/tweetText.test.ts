import { decodeTweetText } from './tweetText'

describe('decodeTweetText', () => {
  test('decodes the HTML entities used by Twitter archives', () => {
    expect(
      decodeTweetText(
        'bread &amp; butter &lt;3 &gt;2 &quot;yes&quot; it&#39;s it&#x27;s',
      ),
    ).toBe('bread & butter <3 >2 "yes" it\'s it\'s')
  })

  test('fully decodes text that has been encoded more than once', () => {
    expect(
      decodeTweetText(
        'New paper &amp;amp; result; if &amp;gt; 50%, say &amp;quot;yes&amp;quot;',
      ),
    ).toBe('New paper & result; if > 50%, say "yes"')
    expect(decodeTweetText('&amp;lt;name&amp;gt;')).toBe('<name>')
  })

  test('decodes valid numeric Unicode entities and preserves invalid input', () => {
    expect(decodeTweetText('thread &#x1F9F5;')).toBe('thread 🧵')
    expect(decodeTweetText('&copy; &#0; &#xD800; &madeup;')).toBe(
      '&copy; &#0; &#xD800; &madeup;',
    )
  })
})
