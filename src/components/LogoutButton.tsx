import { logout } from '@/app/auth/actions'
import { LogOut } from 'lucide-react'

export function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-800">
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </form>
  )
}
