'use client'

import { useState } from 'react'

export default function UploadTwitterArchive() {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState<'uploading' | 'processing' | null>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setProgress('uploading')
    debugger;
    const getFileContents = (event: React.ChangeEvent<HTMLInputElement>): Promise<string> => {
      return new Promise((resolve, reject) => {
        const file = event.target.files?.[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          resolve(content);
        };
        reader.onerror = (e) => {
          reject(new Error('Error reading file'));
        };
        reader.readAsText(file);
      });
    };

    const content = await getFileContents(event)
    window.YTD = { tweets: {} };

    // Evaluate the content as a JS file
    eval(content)

    // Access the tweets from the window object
    const tweetParts = (window as any).YTD.tweets;

    if (!tweetParts) {
      throw new Error('No tweets found in the uploaded file');
    }

    console.log(tweetParts)
    // Flatten the tweets array
    const allTweets = Object.values(tweetParts).flatMap(part => part);
    console.log(allTweets)

    // Stringify the tweets array
    const tweetsJson = JSON.stringify(allTweets);


    // Update the content to be sent to the API
    try {
      setProgress('processing')
      const response = await fetch('/api/upload-tweets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: tweetsJson }),
      })

      if (response.ok) {
        const result = await response.json()
        alert(result.message)
      } else {
        const error = await response.json()
        alert(error.message || 'Failed to upload tweets')
      }
    } catch (error) {
      console.error('Error uploading tweets:', error)
      alert('An error occurred while uploading tweets')
    }

    setIsUploading(false)
    setProgress(null)
  }

  return (
    <div>
      <input
        type="file"
        accept=".js"
        onChange={handleFileUpload}
        disabled={isUploading}
      />
      {isUploading && (
        <div>
          <p>{progress === 'uploading' ? 'Uploading...' : 'Processing tweets...'}</p>
          <div style={{ width: '200px', height: '20px', border: '1px solid #ccc', borderRadius: '10px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress === 'uploading' ? '50%' : '100%'}`,
                height: '100%',
                backgroundColor: '#4CAF50',
                transition: 'width 0.5s ease-in-out'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}