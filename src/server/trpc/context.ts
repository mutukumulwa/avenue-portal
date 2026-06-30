import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const createContext = async () => {
  const session = await auth();

  return {
    session,
    prisma,
    tenantId: session?.user?.tenantId,
    // Client confinement (G2.1): set => user is confined to this one client;
    // undefined => operator-level Medvex ops user who spans all clients.
    clientId: session?.user?.clientId,
    user: session?.user,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
