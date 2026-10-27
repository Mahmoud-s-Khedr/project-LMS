import React from 'react';

export const metadata = {
  title: 'Learning Experience | Player',
  description: 'Distraction-free learning player and assessment runner',
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground antialiased">{children}</div>;
}
