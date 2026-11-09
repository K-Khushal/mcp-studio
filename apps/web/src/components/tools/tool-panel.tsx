import { useEffect, useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { useStore } from '@/store';
import { RequiredNotice, RunButton, isRunShortcut } from '@/components/shared/run-button';
import { ToolIcon, ToolBadges, toolTitle } from './tool-metadata';
import { ToolList } from './tool-list';
import { ToolArgsEditor } from './tool-args-editor';
import { initialArgs, missingRequired } from './tool-schema-helpers';

export default function ToolPanel() {
  const {
    connectionStatus,
    selectedConnectionId,
    connectedConnectionId,
    tools,
    selectedTool,
    toolSearch,
    pendingParams,
    toolFormValues,
    response,
    selectTool,
    setToolSearch,
    setToolFormValues,
    invokeTool,
    clearPendingParams,
  } = useStore();
  const [argsValid, setArgsValid] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const argsRef = useRef<HTMLDivElement>(null);
  const requiredId = useId();
  const missing = selectedTool ? missingRequired(selectedTool.inputSchema, toolFormValues) : [];
  const isSelectedConnectionConnected =
    connectionStatus === 'connected' && selectedConnectionId === connectedConnectionId;

  useEffect(() => {
    if (!selectedTool) {
      if (Object.keys(toolFormValues).length === 0) return;
      setToolFormValues({});
      return;
    }
    if (Object.keys(toolFormValues).length > 0) return;
    setToolFormValues(initialArgs(selectedTool.inputSchema));
  }, [selectedTool?.name, setToolFormValues]);

  useEffect(() => {
    if (!pendingParams || !selectedTool) return;
    setToolFormValues({ ...toolFormValues, ...pendingParams });
    clearPendingParams();
  }, [pendingParams, selectedTool?.name, setToolFormValues, clearPendingParams]);

  useEffect(() => {
    if (attempts > 0) {
      const invalid = argsRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      const target = invalid?.matches('input, select, textarea, button')
        ? invalid
        : invalid?.querySelector<HTMLElement>('input, select, textarea, button');
      target?.focus();
    }
  }, [attempts]);

  useEffect(() => setAttempts(0), [selectedTool?.name]);

  const handleInvoke = useCallback(() => {
    if (!selectedTool || missing.length > 0) return;
    invokeTool(selectedTool.name, toolFormValues).catch(console.error);
  }, [selectedTool, toolFormValues, invokeTool, missing.length]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isRunShortcut(e) || response.isRunning) return;
    e.preventDefault();
    if (missing.length === 0 && argsValid) handleInvoke();
    else if (missing.length > 0) setAttempts((n) => n + 1);
  };

  if (!isSelectedConnectionConnected) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Connect to load tools
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <ToolList
        tools={tools}
        selectedToolName={selectedTool?.name}
        search={toolSearch}
        onSearch={setToolSearch}
        onSelect={selectTool}
      />

      <div className="flex-1 flex flex-col min-w-0 p-4 gap-4 overflow-y-auto">
        {!selectedTool ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ChevronRight size={12} />
            Select a tool to get started
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"><span aria-hidden="true"><ToolIcon tool={selectedTool} /></span><span className="truncate">{toolTitle(selectedTool)}</span></h3>
                <RunButton label="Run Tool" running={response.isRunning} disabled={!argsValid || missing.length > 0} describedBy={missing.length > 0 ? requiredId : undefined} onClick={handleInvoke} />
              </div>
              {toolTitle(selectedTool) !== selectedTool.name && <p className="mt-1 font-mono text-xs text-muted-foreground">{selectedTool.name}</p>}
              <ToolBadges tool={selectedTool} />
              {selectedTool.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{selectedTool.description}</p>
              )}
              <div className="mt-1"><RequiredNotice id={requiredId} missing={missing} /></div>
            </div>

            {selectedTool.outputSchema && (
              <details className="rounded-md border border-border px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium">Output schema</summary>
                <pre className="mt-2 overflow-auto font-mono text-muted-foreground">{JSON.stringify(selectedTool.outputSchema, null, 2)}</pre>
              </details>
            )}

            <div ref={argsRef} onKeyDown={handleKeyDown}>
              <ToolArgsEditor
                key={selectedTool.name}
                schema={selectedTool.inputSchema}
                args={toolFormValues}
                onChange={setToolFormValues}
                onValidChange={setArgsValid}
                showRequired={attempts > 0}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
