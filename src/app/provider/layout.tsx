import { ProviderNav } from "@/components/layouts/ProviderNav";
import { requireProvider } from "@/lib/provider-portal";

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const { provider } = await requireProvider();
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <ProviderNav providerName={provider.name} />
      <main className="max-w-6xl mx-auto px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
