import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-config'

const publicRoutes = ['/', '/login', '/login/reset', '/register', '/api/health', '/pay', '/api/pay', '/api/auth', '/api/debug', '/maintenance']
const protectedRoutes = ['/dashboard', '/admin']

export default auth(async function middleware(request) {
  const { pathname } = request.nextUrl
  const session = (request as unknown as { auth?: { user?: { id: string; email?: string | null; role: string } } }).auth

  // --- Maintenance mode check (before auth checks) ---
  try {
    const baseUrl = request.nextUrl.origin
    const maintenanceRes = await fetch(`${baseUrl}/api/maintenance`, {
      next: { revalidate: 0 },
    })
    if (maintenanceRes.ok) {
      const maintenanceData = await maintenanceRes.json()
      const maintenance = maintenanceData?.value ?? maintenanceData

      if (maintenance?.enabled) {
        const scope = Array.isArray(maintenance.scope) ? maintenance.scope : [maintenance.scope]

        if (scope.includes('all')) {
          // Allow landing page and /api routes through
          if (pathname === '/' || pathname.startsWith('/api/')) {
            return NextResponse.next()
          }

          // Check if user is super_admin
          const role = session?.user?.role || ''

          if (role !== 'super_admin') {
            // Non-super_admin -> redirect to landing page
            return NextResponse.redirect(new URL('/', request.url))
          }
          // super_admin can proceed normally
        }
      }
    }
  } catch {
    // Maintenance check failed, proceed normally
  }

  const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'))
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route))

  // Redirect unauthenticated users to login
  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Single session enforcement: check if this session is still the active one
  if (session && isProtectedRoute) {
    try {
      const baseUrl = request.nextUrl.origin
      const sessionCheck = await fetch(`${baseUrl}/api/auth/session-check?userId=${session.user?.id}`, {
        next: { revalidate: 0 },
      })
      if (sessionCheck.ok) {
        const sessionData = await sessionCheck.json()
        const storedSessionId = sessionData?.sessionId

        // Use the JWT token's jti or sub as session identifier
        // The session ID is stored when user logs in
        if (storedSessionId && sessionData?.valid === false) {
          // This session was invalidated by a newer login
          return NextResponse.redirect(new URL('/login?error=session_expired', request.url))
        }
      }
    } catch {
      // Session check failed, proceed normally
    }
  }

  // Redirect authenticated users away from login/register
  if ((pathname.startsWith('/login') || pathname.startsWith('/register')) && session) {
    // Don't redirect /login/reset paths
    if (!pathname.startsWith('/login/reset')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*))',
  ],
}
