import * as React from 'react';

import { cn } from '@/lib/utils';
import { dsField } from '@/components/ui/design-system';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(dsField.textarea, 'flex min-h-[100px] disabled:cursor-not-allowed disabled:opacity-50', className)}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
