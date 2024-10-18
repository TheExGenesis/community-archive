import React from 'react'

export default function DataPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">
        Community Archive Privacy Policy
      </h1>

      <p>
        At the Community Archive, we are committed to preserving the public
        history of Twitter conversations while respecting your privacy. This
        policy outlines how we handle your data and the options available to
        you.
      </p>

      <h2 className="mt-6 text-2xl font-semibold">Data Collection and Usage</h2>

      <p>The information we collect from your Twitter archive includes:</p>

      <ol className="list-inside list-decimal space-y-2">
        <li>Profile information</li>
        <li>Tweets</li>
        <li>Likes</li>
        <li>Followers/following lists</li>
      </ol>

      <p>We do not access or upload:</p>

      <ul className="list-inside list-disc space-y-2">
        <li>Direct messages</li>
        <li>Email addresses</li>
        <li>Deleted tweets</li>
      </ul>

      <h2 className="mt-6 text-2xl font-semibold">Public Database and API</h2>

      <p>
        By default, your uploaded archive becomes part of our public database
        and API. This means:
      </p>

      <ul className="list-inside list-disc space-y-2">
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

      <h2 className="mt-6 text-2xl font-semibold">Important Considerations</h2>

      <ul className="list-inside list-disc space-y-2">
        <li>
          <strong>Data Accessibility</strong>: While your tweets are already
          public on Twitter, our platform makes them more easily accessible to a
          wider audience.
        </li>
        <li>
          <strong>Potential Risks</strong>: Be aware that malicious actors could
          potentially use this data to make inferences about your psychology or
          for targeted phishing attempts.
        </li>
      </ul>

      <h2 className="mt-6 text-2xl font-semibold">Privacy Options</h2>

      <p>We offer several options to give you more control over your data:</p>

      <ol className="list-inside list-decimal space-y-2">
        <li>
          <strong>Private Archive</strong>: You can choose to make your archive
          private. In this case:
          <ul className="ml-5 mt-2 list-inside list-disc space-y-1">
            <li>
              Only you and Community Archive stewards will have access to your
              full data.
            </li>
            <li>
              Your tweets may still appear in search results or aggregated data.
            </li>
            <li>
              We may use your data for research and to improve our services.
            </li>
          </ul>
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
          <strong>Future Controls</strong>: We plan to implement more granular
          permission settings in the future, such as allowing access to mutuals
          or specific individuals.
        </li>
      </ol>

      <h2 className="mt-6 text-2xl font-semibold">Data Access</h2>

      <p>
        We provide a full dump of the public database for easier data science
        use. This allows researchers and developers to work with the collective
        data more efficiently.
      </p>

      <h2 className="mt-6 text-2xl font-semibold">Contact Us</h2>

      <p>
        {`If you have any questions or concerns about our data policy, please
        don't hesitate to contact us.`}
      </p>

      <p>
        You can reach out to us on Twitter at{' '}
        <a
          href="https://x.com/exgenesis"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          @exgenesis
        </a>
        .
      </p>

      <p>
        By using the Community Archive, you acknowledge that you understand and
        agree to this privacy policy.
      </p>
    </div>
  )
}
