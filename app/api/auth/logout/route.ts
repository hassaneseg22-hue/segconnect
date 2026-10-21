import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();

    await supabase.auth.signOut();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Supabase logout error:', err);

    return NextResponse.json(
      { ok: false, error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
