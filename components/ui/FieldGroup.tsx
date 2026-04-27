import { cn } from '@/lib/utils';
import { dsField } from '@/components/ui/design-system';

export type FieldGroupProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

export function FieldGroup({ title, children, className }: FieldGroupProps) {
  return (
    <section className={cn(dsField.groupCard, className)}>
      <h3 className={dsField.groupTitle}>{title}</h3>
      {children}
    </section>
  );
}
