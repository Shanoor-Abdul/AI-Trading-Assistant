import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="mobile-layout min-h-screen bg-black text-white pb-20">
      {children}
    </div>
  )
}
