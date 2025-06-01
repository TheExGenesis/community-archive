'use client'
import AdvancedSearchForm from '@/components/AdvancedSearchForm'

export default function SearchTweetsPage() {
  // Style definitions copied from homepage
  const unifiedDeepBlueBase = "bg-slate-200 dark:bg-slate-900";
  const sectionPaddingClasses = "py-16 md:py-20"
  // Using max-w-3xl for search page
  const contentWrapperClasses = "w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"
  const glowBaseColor = "hsla(200, 100%, 60%,"
  const glowStyleStrong = {
    backgroundImage: `radial-gradient(ellipse at 50% 0%, ${glowBaseColor}0.2) 0%, transparent 50%)`,
    backgroundRepeat: 'no-repeat',
  }

  return (
    <main> 
      <section 
        className={`${unifiedDeepBlueBase} ${sectionPaddingClasses} overflow-hidden min-h-screen`}
        style={glowStyleStrong}
      >
        <div className={`${contentWrapperClasses}`}> 
          <h2 className="mb-8 text-4xl font-bold text-center text-gray-900 dark:text-white">🔬 Advanced Search</h2>
          <AdvancedSearchForm />
        </div>
      </section>
    </main>
  )
}
