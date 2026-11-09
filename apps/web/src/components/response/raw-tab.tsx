interface RawTabProps {
  result: unknown;
  error: string | null;
}

export function RawTab({ result, error }: RawTabProps) {
  if (error) {
    return <pre className="text-xs font-mono text-destructive-text whitespace-pre-wrap">{error}</pre>;
  }
  return (
    <pre className="text-xs font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}
