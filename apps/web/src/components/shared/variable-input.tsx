import { useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useStore } from '@/store';
import { isSecretName } from '@/lib/is-secret-name';
import { cn } from '@/lib/utils';

type InputProps = ComponentProps<'input'>;
type TextareaProps = ComponentProps<'textarea'>;

export function VariableInput(props: InputProps) {
  return <VariableField inputProps={props} />;
}

export function VariableTextarea({ json = false, ...props }: TextareaProps & { json?: boolean }) {
  return <VariableField textareaProps={props} json={json} />;
}

/** Native controls own editing, selection and composition. The inert mirror only paints backgrounds. */
function VariableField({ inputProps, textareaProps, json = false }: { inputProps?: InputProps; textareaProps?: TextareaProps; json?: boolean }) {
  const props = (inputProps ?? textareaProps)!;
  const environments = useStore((s) => s.environments);
  const activeId = useStore((s) => s.activeEnvironmentId);
  const variables = environments.find((env) => env.id === activeId)?.variables;
  const control = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const [draft, setDraft] = useState(() => String(props.defaultValue ?? ''));
  const text = props.value === undefined ? draft : String(props.value);
  const parts: ReactNode[] = [];
  const previews: string[] = [];
  let offset = 0;
  let unresolved = false;
  // JSON property names are literal, even when they contain Variable syntax.
  const keys = json ? [...text.matchAll(/"(?:\\.|[^"\\])*"\s*:/g)] : [];
  for (const match of text.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)) {
    if (keys.some((key) => match.index >= key.index && match.index < key.index + key[0].length)) continue;
    const name = match[1]!;
    const resolved = variables !== undefined && Object.hasOwn(variables, name);
    unresolved ||= !resolved;
    parts.push(text.slice(offset, match.index));
    parts.push(<mark key={match.index} data-variable={name} data-resolved={resolved}
      className={cn('rounded-[2px] bg-primary/20 text-transparent', !resolved && 'bg-destructive/20 underline decoration-destructive decoration-wavy underline-offset-2')}>{match[0]}</mark>);
    previews.push(`${name}: ${resolved ? (isSecretName(name) || inputProps?.type === 'password' ? '•••••••• (masked)' : variables![name] || '(empty)') : 'Unresolved Variable — define it in the active Environment'}`);
    offset = match.index + match[0].length;
  }
  parts.push(text.slice(offset), '\u200b');

  const syncScroll = () => {
    if (control.current && content.current) content.current.style.transform = `translate(${-control.current.scrollLeft}px, ${-control.current.scrollTop}px)`;
  };
  useLayoutEffect(() => {
    const element = control.current;
    const layer = mirror.current;
    if (!element || !layer) return;
    const sync = () => {
      const style = getComputedStyle(element);
      for (const property of ['font', 'letter-spacing', 'text-indent', 'text-align', 'padding', 'border-width', 'box-sizing', 'line-height', 'tab-size']) {
        layer.style.setProperty(property, style.getPropertyValue(property));
      }
      layer.style.width = `${element.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
      layer.style.height = `${element.clientHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`;
      syncScroll();
    };
    sync();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  });

  const preview = previews.join('\n');
  const shared = {
    title: preview || props.title,
    'aria-invalid': props['aria-invalid'] || unresolved || undefined,
    'aria-describedby': [props['aria-describedby'], preview && descriptionId].filter(Boolean).join(' ') || undefined,
    className: cn('leading-normal', props.className),
  };
  return (
    <div className={cn('relative min-w-0 w-full', props.className?.includes('flex-1') && 'flex-1')}>
      {inputProps ? <Input {...inputProps} {...shared} ref={(el) => { control.current = el; assignRef(inputProps.ref, el); }}
        onChange={(event) => { if (inputProps.value === undefined) setDraft(event.target.value); inputProps.onChange?.(event); }}
        onScroll={(event) => { syncScroll(); inputProps.onScroll?.(event); }} /> :
        <Textarea {...textareaProps} {...shared} ref={(el) => { control.current = el; assignRef(textareaProps?.ref, el); }}
          onChange={(event) => { if (textareaProps?.value === undefined) setDraft(event.target.value); textareaProps?.onChange?.(event); }}
          onScroll={(event) => { syncScroll(); textareaProps?.onScroll?.(event); }} />}
      <div ref={mirror} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 overflow-hidden rounded-lg border-solid border-transparent text-transparent">
        <div ref={content} style={{ whiteSpace: textareaProps ? 'pre-wrap' : 'pre', overflowWrap: textareaProps ? 'break-word' : 'normal', ...(inputProps ? { display: 'flex', alignItems: 'center', height: '100%' } : {}) }}>
          <span>{parts}</span>
        </div>
      </div>
      {preview && <span id={descriptionId} className="sr-only">{preview}</span>}
    </div>
  );
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}
