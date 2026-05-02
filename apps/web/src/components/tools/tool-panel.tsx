import { useEffect, useCallback } from 'react';
import { Play, ChevronRight } from 'lucide-react';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { ToolList } from './tool-list';
import { SchemaForm } from './tool-schema-form';
import { defaultValue, buildParams, seedValues, getProperties } from './tool-schema-helpers';

export default function ToolPanel() {
  const {
    connectionStatus,
    selectedRequestId,
    connectedRequestId,
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
  const isSelectedRequestConnected =
    connectionStatus === 'connected' && selectedRequestId === connectedRequestId;

  useEffect(() => {
    if (!selectedTool) { setToolFormValues({}); return; }
    const defaults: Record<string, string> = {};
    for (const [key, prop] of Object.entries(getProperties(selectedTool.inputSchema))) {
      defaults[key] = defaultValue(prop);
    }
    setToolFormValues(defaults);
  }, [selectedTool?.name, setToolFormValues]);

  useEffect(() => {
    if (!pendingParams || !selectedTool) return;
    setToolFormValues({ ...toolFormValues, ...seedValues(selectedTool.inputSchema, pendingParams) });
    clearPendingParams();
  }, [pendingParams, selectedTool?.name, toolFormValues, setToolFormValues, clearPendingParams]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setToolFormValues({ ...toolFormValues, [key]: value });
  }, [toolFormValues, setToolFormValues]);

  const handleInvoke = useCallback(() => {
    if (!selectedTool) return;
    invokeTool(selectedTool.name, buildParams(selectedTool.inputSchema, toolFormValues)).catch(console.error);
  }, [selectedTool, toolFormValues, invokeTool]);

  if (!isSelectedRequestConnected) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Connect to this request to load tools
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

            <SchemaForm
              schema={selectedTool.inputSchema}
              values={toolFormValues}
              onChange={handleFieldChange}
            />

            <div className="flex justify-end pt-2 border-t border-border mt-auto">
              <Button
                size="sm"
                onClick={handleInvoke}
                disabled={response.isStreaming}
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
