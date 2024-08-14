import AuthButton from '@/components/AuthButton'
import ConnectSupabaseSteps from '@/components/ConnectSupabaseSteps'
import SignUpUserSteps from '@/components/SignUpUserSteps'
import Header from '@/components/Header'
import ThemeToggle from '@/components/ThemeToggle'
import { cookies } from 'next/headers'
import { createServerClient } from '@/utils/supabase'
import UploadTwitterArchive from '@/components/UploadTwitterArchive'

import { redirect } from 'next/navigation'

export default async function Index() {
  redirect('/upload-archive')
}

// export default async function Index() {
//   const cookieStore = cookies()

//   return (
//     <div className="flex w-full flex-1 flex-col items-center gap-20">
//       <UploadTwitterArchive />
//     </div>
//   )
// }
