import { addCosmeticLineBreaks } from './profileTweetDisplay'

describe('addCosmeticLineBreaks', () => {
  it('restores obvious missing breaks in flattened profile text', () => {
    expect(
      addCosmeticLineBreaks(
        'God: Agapic lovePagan gods: distributed archetypesSoul: UnconsciousConsciousness: self-attentionChakras: embodied emotionsSpirits: semi-autonomous thought processesDemons: distributed processes that undermine GodMagic: subtle information transfer',
      ),
    ).toBe(
      'God: Agapic love\nPagan gods: distributed archetypes\nSoul: Unconscious\nConsciousness: self-attention\nChakras: embodied emotions\nSpirits: semi-autonomous thought processes\nDemons: distributed processes that undermine God\nMagic: subtle information transfer',
    )

    expect(
      addCosmeticLineBreaks(
        '*deep breath* ART IS PRE-PARADIGMATIC PHILSOPHY IS PRE-PRE-PARADIGMATIC SCIENCEand art is vervaekean relevance realization',
      ),
    ).toBe(
      '*deep breath* ART IS PRE-PARADIGMATIC PHILSOPHY IS PRE-PRE-PARADIGMATIC SCIENCE\nand art is vervaekean relevance realization',
    )
  })

  it('leaves existing line breaks and URLs alone', () => {
    const text = 'Already\nformatted https://example.com/OpenAI'
    expect(addCosmeticLineBreaks(text)).toBe(text)
    expect(addCosmeticLineBreaks('Read https://example.com/OpenAI')).toBe(
      'Read https://example.com/OpenAI',
    )
  })
})
