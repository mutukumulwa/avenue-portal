import { NextResponse } from "next/server";

export function validateApiKey(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key");
  
  // Example valid API Key standard. In production this queries a DB `ApiKeys` table
  const VALID_KEY = process.env.API_KEY || "av-slade360-dev-key";
  
  if (!authHeader || !authHeader.includes(VALID_KEY)) {
    return false;
  }
  return true;
}

/**
 * Wrapper for B2B API endpoints ensuring stateless API key logic
 */
export function withApiKey(handler: (req: Request, ...args: unknown[]) => Promise<Response>) {
  return async (req: Request, ...args: unknown[]) => {
    if (!validateApiKey(req)) {
      return NextResponse.json({ error: "Unauthorized. Invalid or missing API Key." }, { status: 401 });
    }
    return handler(req, ...args);
  };
}
