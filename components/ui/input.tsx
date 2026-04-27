import * as React from 'react';

import { cn } from '@/lib/utils';
import { dsField } from '@/components/ui/design-system';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(dsField.input, 'flex h-10 file:border-0 file:bg-transparent file:text-sm file:font-medium', className)}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
