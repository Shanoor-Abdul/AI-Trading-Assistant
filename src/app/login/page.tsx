import { login, signup } from '../auth/actions'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default async function LoginPage(props: {
  searchParams: Promise<{ message: string }>
}) {
  const searchParams = await props.searchParams;
  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto min-h-screen">
      <Card className="p-8 bg-black/40 backdrop-blur-md border-zinc-800">
        <form className="animate-in flex-1 flex flex-col w-full justify-center gap-4 text-zinc-200">
          <div className="flex flex-col text-center mb-4">
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Universal Trading Platform</h1>
            <p className="text-sm text-zinc-400">Sign in to sync your AI trade history</p>
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="email">Email</label>
            <Input
              className="bg-black/50 border-zinc-800 text-white"
              name="email"
              placeholder="you@example.com"
              required
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="password">Password</label>
            <Input
              className="bg-black/50 border-zinc-800 text-white"
              type="password"
              name="password"
              placeholder="••••••••"
              required
            />
          </div>
          
          <div className="flex flex-col gap-2 mt-4">
            <button formAction={login} type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium h-9 rounded-md px-4 py-2 transition-colors flex items-center justify-center">
              Sign In
            </button>
            <button formAction={signup} type="submit" className="w-full border border-zinc-700 bg-transparent hover:bg-zinc-800 text-white font-medium h-9 rounded-md px-4 py-2 transition-colors flex items-center justify-center">
              Create Account
            </button>
          </div>
          
          {searchParams?.message && (
            <p className="mt-4 p-3 bg-zinc-900/50 text-zinc-300 text-center text-sm rounded border border-zinc-800">
              {searchParams.message}
            </p>
          )}
        </form>
      </Card>
    </div>
  )
}
