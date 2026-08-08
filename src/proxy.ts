import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  
  // Get the user agent from the headers
  const userAgent = request.headers.get('user-agent') || '';
  
  // Check if the device is a mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  // If user is on the root path (/) and using a mobile device, rewrite to /mobile
  if (url.pathname === '/' && isMobile) {
    url.pathname = '/mobile';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/',
};
