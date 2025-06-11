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

      <h2 className="mt-8 mb-4 text-2xl font-semibold">Data Collection and Usage</h2>

      <p className="mb-4">
        The information we collect from your Twitter archive includes:
      </p>

      <ol className="list-inside list-decimal space-y-2 my-5 pl-4">
        <li>Profile information</li>
        <li>Tweets</li>
        <li>Likes</li>
        <li>Followers/following lists</li>
      </ol>

      <p className="mb-4">
        We do not access or upload:
      </p>

      <ul className="list-inside list-disc space-y-2 my-5 pl-4">
        <li>Direct messages</li>
        <li>Email addresses</li>
        <li>Deleted tweets</li>
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
          potentially use this data to make inferences about your psychology or
          for targeted phishing attempts.
        </li>
      </ul>

      <h2 className="mt-8 mb-4 text-2xl font-semibold">Privacy Options</h2>

      <p className="mb-4">
        We offer several options to give you more control over your data:
      </p>

      <ol className="list-inside list-decimal space-y-2 my-5 pl-4">
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
