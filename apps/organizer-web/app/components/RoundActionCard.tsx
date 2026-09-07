import { actionCardClass } from './ui';

export type RoundActionCardProps = {
  as?: 'form' | 'div';
  formAction?: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
};

export default function RoundActionCard({ as = 'form', formAction, children }: RoundActionCardProps) {
  if (as === 'div') {
    return <div className={`${actionCardClass} text-center mb-6`}>{children}</div>;
  }
  return (
    <form action={formAction} className={`${actionCardClass} text-center mb-6`}>
      {children}
    </form>
  );
}
