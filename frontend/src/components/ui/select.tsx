import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SelectOption<V extends string> {
  value: V;
  label: string;
}

interface SelectProps<V extends string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: ReadonlyArray<SelectOption<V>>;
  placeholder?: string;
}

function SelectInner<V extends string>(
  { options, placeholder, className, ...rest }: SelectProps<V>,
  ref: React.Ref<HTMLSelectElement>,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 py-2 text-sm shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...rest}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export const Select = forwardRef(SelectInner) as <V extends string>(
  props: SelectProps<V> & { ref?: React.Ref<HTMLSelectElement> },
) => ReturnType<typeof SelectInner>;
