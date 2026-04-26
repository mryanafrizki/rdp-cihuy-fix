import { NextResponse } from 'next/server'

// OAuth callback — simplified for Auth.js (Credentials only, no OAuth exchange needed)
// Kept for backward compatibility with any existing links
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') || '/dashboard'

  // For password recovery links, redirect to confirm page with token
  const token = searchParams.get('token')
  if (token) {
    return NextResponse.redirect(`${origin}/login/reset/confirm?token=${token}`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
