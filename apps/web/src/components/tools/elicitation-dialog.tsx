import { useState } from 'react';
import type { ElicitationResult, ServerMessage } from '@mcp-studio/types';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToolArgsEditor } from './tool-args-editor';
import { getRequired, initialArgs } from './tool-schema-helpers';

type Request = Extract<ServerMessage, { type: 'elicitation_request' }>;

export function ElicitationFormDialog({ request, onRespond }: { request: Request; onRespond: (result: ElicitationResult) => void }) {
  const [args, setArgs] = useState(() => initialArgs(request.requestedSchema));
  const [valid, setValid] = useState(true);
  const missing = getRequired(request.requestedSchema).filter(key => args[key] === undefined || args[key] === '');
  return (
    <Dialog open onOpenChange={open => { if (!open) onRespond({ action: 'cancel' }); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>MCP Server needs your input</DialogTitle>
          <DialogDescription>{request.message}</DialogDescription>
        </DialogHeader>
        <ToolArgsEditor label="Fields" schema={request.requestedSchema} args={args} onChange={setArgs} onValidChange={setValid} />
        {missing.length > 0 && <p className="text-xs text-muted-foreground">Required: {missing.join(', ')}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onRespond({ action: 'cancel' })}>Cancel</Button>
          <Button variant="outline" onClick={() => onRespond({ action: 'decline' })}>Decline</Button>
          <Button disabled={!valid || missing.length > 0} onClick={() => onRespond({ action: 'accept', content: args as ElicitationResult['content'] })}>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ElicitationDialog() {
  const request = useStore(s => s.elicitations[0]);
  const respond = useStore(s => s.respondToElicitation);
  return request ? <ElicitationFormDialog key={request.elicitationId} request={request} onRespond={result => respond(request.elicitationId, result)} /> : null;
}
