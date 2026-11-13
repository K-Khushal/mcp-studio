import { useState } from 'react';
import { FolderPlus, Import } from 'lucide-react';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogoMark } from '@/components/shell/logo-mark';
import { ImportConnectionsDialog } from './import-connections-dialog';

/** First run: no Collections yet, so the main pane leads with the two ways to start instead of a dead end. */
export function FirstRunPanel() {
  const createCollection = useStore((s) => s.createCollection);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [importing, setImporting] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createCollection(trimmed);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <LogoMark size={40} className="shadow-lg shadow-primary/25 rounded-[9px]" />
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Welcome to MCP Studio</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          A Collection groups the Connections to your MCP Servers. Create one, or import the servers from your Claude Desktop config.
        </p>
      </div>
      {naming ? (
        <form
          className="flex w-full max-w-xs items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(false)}
            placeholder="Collection name"
            aria-label="Collection name"
            className="h-8 text-xs"
          />
          <Button type="submit" disabled={!name.trim()}>Create</Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => setNaming(true)}>
            <FolderPlus aria-hidden /> New collection
          </Button>
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Import aria-hidden /> Import claude_desktop_config.json
          </Button>
        </div>
      )}
      {importing && <ImportConnectionsDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
