import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Lock } from 'lucide-react';
import { Wizard } from '@/components/deploy/Wizard';

const Deploy = () => {
  useSeoMeta({
    title: 'Deploy a Signer — Universal Edge Signer',
    description: 'Configure, test, and deploy your own Cloudflare Worker API gateway in minutes.',
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Universal Edge Signer</span>
          </Link>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="h-4 w-4 text-primary" />
            Deploy a Signer
          </div>
          <div className="w-24" />
        </div>
      </header>

      <main className="py-10">
        <Wizard />
      </main>
    </div>
  );
};

export default Deploy;
