import { useEffect, useCallback, useState } from 'react';
import { Play, ChevronRight } from 'lucide-react';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { ToolList } from './tool-list';
import { ToolArgsEditor } from './tool-args-editor';
import { initialArgs } from './tool-schema-helpers';

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

  const handleInvoke = useCallback(() => {
    if (!selectedTool) return;
    invokeTool(selectedTool.name, toolFormValues).catch(console.error);
  }, [selectedTool, toolFormValues, invokeTool]);

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
              <h3 className="text-sm font-semibold text-foreground">{selectedTool.name}</h3>
              {selectedTool.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{selectedTool.description}</p>
              )}
            </div>

            <ToolArgsEditor
              key={selectedTool.name}
              schema={selectedTool.inputSchema}
              args={toolFormValues}
              onChange={setToolFormValues}
              onValidChange={setArgsValid}
            />

            <div className="flex justify-end pt-2 border-t border-border mt-auto">
              <Button
                size="sm"
                onClick={handleInvoke}
                disabled={response.isStreaming || !argsValid}
                className="gap-1.5 text-xs"
              >
                <Play size={12} />
                {response.isStreaming ? 'Running…' : 'Run Tool'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
