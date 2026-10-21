import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const GUEST_ONLY = [
  '/login',
  '/activate-account',
  '/forgot-password',
  '/reset-password',
  '/confirm-email',
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isGuestPage = GUEST_ONLY.some(
    (path) =>
      pathname === path ||
      pathname.startsWith(`${path}/`)
  );

  // Pages publiques de connexion / activation / récupération
  if (isGuestPage) {
    // Si déjà connecté, retour au dashboard
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return response;
  }

  // Toutes les autres pages nécessitent une session Supabase
  if (!user) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname);

    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|ico\\.jpeg|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:png|jpe?g|svg|ico|webp|gif)$).*)',
  ],
};
