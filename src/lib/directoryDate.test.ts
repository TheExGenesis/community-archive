test('matches UTC server rendering in a browser west of UTC at midnight', () => {
  const Formatter = Intl.DateTimeFormat
  for (const timeZone of ['UTC', 'America/Los_Angeles']) {
    const mock = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(
        (locales, options) => new Formatter(locales, { timeZone, ...options }),
      )
    try {
      jest.isolateModules(() => {
        const { formatDirectoryDate } = require('./directoryDate')
        expect(formatDirectoryDate('2026-08-01T00:00:00Z')).toBe('Aug 1, 2026')
        expect(formatDirectoryDate(null)).toBe('—')
      })
    } finally {
      mock.mockRestore()
    }
  }
})
