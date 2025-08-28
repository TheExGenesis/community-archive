import React from 'react'

export default function DataPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="mb-6 text-3xl font-bold">
        Community Archive Privacy Policy
      </h1>

      <p className="mb-6">
        We are committed to preserving the public
        history of Twitter conversations while respecting your privacy. This
        policy outlines how we handle your data and the options available to
        you.
      </p>

      <h2 className="mt-8 mb-4 text-2xl font-semibold">Data Collection Methods</h2>

      <p className="mb-4">
        We collect Twitter/X data through two methods:
      </p>

      <h3 className="mt-6 mb-3 text-xl font-semibold">1. Twitter Archive Upload</h3>
      <p className="mb-4">
        You can upload your complete Twitter archive file. The information we collect includes:
      </p>

      <ol className="list-inside list-decimal space-y-2 my-5 pl-4">
        <li>Profile information</li>
        <li>Tweets</li>
        <li>Likes</li>
        <li>Followers/following lists</li>
      </ol>

      <h3 className="mt-6 mb-3 text-xl font-semibold">2. Browser Extension (Real-time Streaming)</h3>
      <p className="mb-4">
        With your explicit consent, our browser extension can automatically collect your public tweets in real-time. This includes:
      </p>

      <ul className="list-inside list-disc space-y-2 my-5 pl-4">
        <li>Public tweets as they are posted</li>
        <li>Tweet metadata (timestamps, engagement metrics)</li>
        <li>Media URLs and attachments</li>
        <li>Reply chains and quote tweets</li>
      </ul>

      <p className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <strong>Important:</strong> The browser extension only works with users who have explicitly opted in to tweet streaming. 
        You maintain full control and can opt out at any time through this website.
      </p>

      <h3 className="mt-6 mb-3 text-xl font-semibold">What We Do Not Collect</h3>
      <p className="mb-4">
        Regardless of the method, we never access:
      </p>

      <ul className="list-inside list-disc space-y-2 my-5 pl-4">
        <li>Direct messages</li>
        <li>Email addresses</li>
        <li>Private account data</li>
        <li>Protected tweets</li>
        <li>Personal information beyond what&apos;s publicly visible</li>
      </ul>

      <h2 className="mt-8 mb-4 text-2xl font-semibold">Public Database and API</h2>

      <p className="mb-4">
        By default, your uploaded archive becomes part of our public database
        and API. This means:
      </p>

      <ul className="list-inside list-disc space-y-2 my-5 pl-4">
        <li>Your tweets and likes will be visible to anyone.</li>
        <li>
          Researchers, developers, and other users can access and analyze this
          data.
        </li>
        <li>
          This data may be used for various purposes, including digital
          anthropology research and fine-tuning language models.
        </li>
      </ul>

      <p className="mb-6">
        API docs & instructions for downloading the data <a href='https://github.com/TheExGenesis/community-archive/tree/main/docs#docs' className='text-blue-500 hover:underline'>are in the GitHub repo.</a>
      </p>

      <h2 className="mt-8 mb-4 text-2xl font-semibold">Important Considerations</h2>

      <ul className="list-inside list-disc space-y-2 my-5 pl-4">
        <li>
          <strong>Data Accessibility</strong>: While your tweets are already
          public on Twitter, our platform makes them more easily accessible to a
          wider audience.
        </li>
        <li>
          <strong>Potential Risks</strong>: Be aware that malicious actors could
          potentially use this data in various ways, such as making inferences about your psychology or
          for targeted phishing attempts, among other potential risks.
        </li>
      </ul>

      <h2 className="mt-8 mb-4 text-2xl font-semibold">Frequently Asked Questions</h2>

      <div className="mb-8">
        <h3 className="mt-6 mb-3 text-xl font-semibold">Do we stream every single tweet?</h3>
        <p className="mb-4">
          No. We have a temporary policy, and one we&apos;re aiming to adopt eventually.
        </p>
        <p className="mb-2">
          <strong>The policy we&apos;re currently running:</strong> streaming tweets from people who&apos;ve been mentioned in the community archive.
        </p>
        <p className="mb-4">
          <strong>The policy we&apos;re moving towards:</strong> only streaming tweets written by people who have explicitly opted in.
        </p>
        <p className="mb-4">
          The reasoning for this is that streaming only opted-in users would severely affect utility at the beginning, as this would be very few tweets.
        </p>

        <h3 className="mt-6 mb-3 text-xl font-semibold">Will the stream be exhaustive?</h3>
        <p className="mb-4">
          The stream won&apos;t be exhaustive because it only knows about tweets if an extension user has seen them.
        </p>

        <h3 className="mt-6 mb-3 text-xl font-semibold">Will others know what my feed looks like?</h3>
        <p className="mb-4">
          No. We keep the ids of scrapers so we can detect and remove bad actors but these are not public.
        </p>
      </div>

      <h2 className="mt-8 mb-4 text-2xl font-semibold">Browser Extension: How It Works</h2>

      <p className="mb-4">
        Our browser extension is designed with privacy and consent as core principles:
      </p>

      <ol className="list-inside list-decimal space-y-2 my-5 pl-4">
        <li>
          <strong>Explicit Opt-In Required</strong>: The extension only collects tweets from users who have 
          explicitly opted in through this website after signing in with Twitter.
        </li>
        <li>
          <strong>Public API Check</strong>: Before collecting any tweet, the extension checks our public API 
          to verify the user has opted in and their consent is current.
        </li>
        <li>
          <strong>Real-time Collection</strong>: When you post a public tweet, users with the extension 
          installed can automatically save it to the Community Archive.
        </li>
        <li>
          <strong>Distributed Preservation</strong>: This creates a distributed network of tweet preservation, 
          helping maintain historical records even if tweets are later deleted.
        </li>
      </ol>

      <h2 className="mt-8 mb-4 text-2xl font-semibold">Privacy Options</h2>

      <p className="mb-4">
        We offer several options to give you more control over your data:
      </p>

      <ol className="list-inside list-decimal space-y-2 my-5 pl-4">
        <li>
          <strong>Tweet Streaming Opt-In/Opt-Out</strong>: You can enable or disable real-time tweet 
          collection through the extension at any time via your account settings.
        </li>
        <li>
          <strong>Exclude Likes</strong>: You can opt to leave out your likes
          when uploading your archive.
        </li>
        <li>
          <strong>Date Filtering</strong>: You can choose to make only a
          specific date range of your archive public.
        </li>
        <li>
          <strong>Manual Deletion</strong>: We are planning to implement the ability to delete specific tweets from the archive, 
          but this feature is not yet active.
        </li>
        <li>
          <strong>Future Controls</strong>: We plan to implement more granular
          permission settings in the future, such as allowing access to mutuals
          or specific individuals.
        </li>
      </ol>

      <h2 className="mt-8 mb-4 text-2xl font-semibold">Contact Us</h2>

      <p className="mb-4">
        {`If you have any questions or concerns about our data policy, please
        don't hesitate to contact us.`}
      </p>

      <p className="mb-4">
        You can reach out to us on Twitter at{' '}
        <a
          href="https://x.com/exgenesis"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          @exgenesis
        </a>
        . Or find us on <a href="https://discord.gg/5mbWEfVrqw" className="text-blue-500 hover:underline">Discord</a> or <a href="https://github.com/TheExGenesis/community-archive" className="text-blue-500 hover:underline">GitHub</a>  
      </p>

      <p className="mb-8">
        By using the Community Archive, you acknowledge that you understand and
        agree to this privacy policy.
      </p>

      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <p className="text-md text-gray-700 dark:text-gray-300">
          For more detailed information on the specific data fields processed from your Twitter archive, including examples,
          please see our documentation:{' '}
          <a
            href="https://github.com/TheExGenesis/community-archive/blob/main/docs/archive_data.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline font-medium"
          >
            Twitter Archive Data Details
          </a>
          .
        </p>
      </div>

    </div>
  )
}
