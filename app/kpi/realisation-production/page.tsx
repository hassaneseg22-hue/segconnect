'use client';

import { RequirePermission } from '@/components/auth/RequirePermission';
import { ProductionRealisation } from '@/components/production/ProductionRealisation';

export default function RealisationProductionPage() {
  return (
    <RequirePermission code="production.view">
      <ProductionRealisation />
    </RequirePermission>
  );
}
