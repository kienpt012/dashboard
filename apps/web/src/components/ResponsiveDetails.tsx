import { Grid } from 'antd';
import { type ReactNode } from 'react';

export function ResponsiveDetails({ title, children }: { title: string; children: ReactNode }) {
  const screens = Grid.useBreakpoint();
  if (screens.md) return <>{children}</>;
  return <details className="responsive-details"><summary>{title}</summary>{children}</details>;
}
