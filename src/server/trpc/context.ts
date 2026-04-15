import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const createContext = async () => {
  const session = await auth();

  return {
    session,
    prisma,
    tenantId: session?.user?.tenantId,
    user: session?.user,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
