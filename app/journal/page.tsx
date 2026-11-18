'use client';

import { RequirePermission } from '@/components/auth/RequirePermission';
import { JournalDG } from '@/components/journal/JournalDG';

export default function JournalPage() {
  return (
    <RequirePermission code="journal.view">
      <JournalDG />
    </RequirePermission>
  );
}
