module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name !== 'workflow') return pkg
      if (pkg.version !== '5.2.2') {
        throw new Error(
          'Review the Workflow Nest dependency removal before upgrading Workflow',
        )
      }

      // This app uses workflow/next, never workflow/nest. The unused Nest
      // adapter auto-installs @swc/cli and its vulnerable downloader cache.
      // pnpm 9.1.0 needs this hook; it does not support "-" removal overrides.
      // Reassess this boundary before adding Nest support or changing Workflow.
      delete pkg.dependencies['@workflow/nest']
      return pkg
    },
  },
}
