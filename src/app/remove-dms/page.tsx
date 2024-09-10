import React from 'react'

export default function RemoveDMsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">
        How to Remove DMs from Your Archive
      </h1>
      <div className="space-y-4">
        <p>
          We promise that your DMs won&apos;t leave your computer, and we never
          see them. However, if you want to be 100% sure, you can remove them
          from your archive before uploading. Here&apos;s how:
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Unzip your Twitter archive</li>
          <li>
            Navigate to the &quot;data&quot; folder within the unzipped archive
          </li>
          <li>Find and delete the file named &quot;direct-messages.js&quot;</li>
          <li>Zip the main folder again</li>
        </ol>
        <p className="mt-4">
          After following these steps, your archive will no longer contain any
          direct messages. You can then upload this modified archive to our
          Community Archive with complete peace of mind.
        </p>
        <p className="mt-4">
          If you trust our process and our commitment to privacy, you can skip
          this step and upload your archive as-is. We guarantee that we will not
          access or store any of your direct messages.
        </p>
      </div>
    </div>
  )
}
