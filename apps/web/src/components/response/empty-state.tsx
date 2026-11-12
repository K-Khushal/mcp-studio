import { Inbox } from 'lucide-react';
import { PanelEmptyState } from '@/components/shared/panel-empty-state';

export function EmptyState() {
  return <PanelEmptyState icon={Inbox} title="Run a tool or prompt to see the response" hint="Ctrl/⌘ + Enter in the arguments runs it." />;
}
