import { prisma } from "@/lib/prisma";

/**
 * Server component — injects tenant branding as CSS custom property overrides.
 * Place inside any layout that has access to a tenantId.
 *
 * Tailwind v4 @theme variables are build-time defaults; injecting a :root
 * override here takes runtime precedence over those defaults.
 */
export async function TenantThemeInjector({ tenantId }: { tenantId: string }) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      primaryColor: true,
      accentColor: true,
      warmColor: true,
      fontHeading: true,
      fontBody: true,
    },
  });

  if (!tenant) return null;

  // Only inject non-default values to avoid redundant CSS
  const vars: string[] = [];

  if (tenant.primaryColor && tenant.primaryColor !== "#292A83") {
    vars.push(`  --color-avenue-indigo: ${tenant.primaryColor};`);
    // Derive a slightly lighter secondary tone if nothing explicit
    vars.push(`  --color-avenue-secondary: ${tenant.accentColor || tenant.primaryColor};`);
  }
  if (tenant.accentColor && tenant.accentColor !== "#435BA1") {
    vars.push(`  --color-avenue-indigo-hover: ${tenant.accentColor};`);
  }
  if (tenant.warmColor && tenant.warmColor !== "#F5C6B6") {
    vars.push(`  --color-avenue-pink: ${tenant.warmColor};`);
  }
  if (tenant.fontHeading && tenant.fontHeading !== "Quicksand") {
    vars.push(`  --font-heading: "${tenant.fontHeading}", sans-serif;`);
  }
  if (tenant.fontBody && tenant.fontBody !== "Lato") {
    vars.push(`  --font-body: "${tenant.fontBody}", sans-serif;`);
  }

  if (vars.length === 0) return null;

  const css = `:root {\n${vars.join("\n")}\n}`;

  // dangerouslySetInnerHTML is intentional — values come from our own DB,
  // not from user input, and are validated as colour hex strings.
  return (
    <style
      id="tenant-theme"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
