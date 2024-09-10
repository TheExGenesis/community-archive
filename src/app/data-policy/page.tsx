import React from 'react'

export default function DataPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Our Data Policy</h1>
      <div className="space-y-4">
        <p>
          {`At the Community Archive, we take your privacy seriously. Here's our data policy:`}
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            The only information that leaves your machine are:
            <ol className="ml-5 mt-2 list-decimal">
              <li>Profile information</li>
              <li>Tweets</li>
              <li>Likes</li>
              <li>Followers/following lists</li>
            </ol>
          </li>
          <li>
            Our code never accesses or uploads:
            <ul className="ml-5 mt-2 list-disc">
              <li>Direct messages</li>
              <li>Email addresses</li>
              <li>Deleted tweets</li>
            </ul>
          </li>
          <li>
            We make{' '}
            <a
              href="https://github.com/TheExGenesis/community-archive/releases"
              className="text-blue-500 hover:underline"
            >
              a full dump of the database
            </a>{' '}
            accessible for easier data science use.
          </li>
        </ul>
        <p>
          {`We are committed to preserving the public history of Twitter
          conversations while respecting your privacy. If you have any questions
          or concerns about our data policy, please don't hesitate to contact
          us.`}
        </p>
      </div>
    </div>
  )
}
