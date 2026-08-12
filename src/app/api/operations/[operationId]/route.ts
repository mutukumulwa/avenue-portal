/**
 * UAT-HF P01.02 — authorized status lookup for one operation.
 *
 * This is what `MutationOutcome`'s "Check whether it was saved" link points at.
 * DEF-065 left an operator with a crashed screen and a write that may or may not
 * have committed, and nothing to ask. Now every submit carries an opaque
 * operation id, and this endpoint answers for it.
 *
 * Privacy rules this endpoint exists under:
 *
 *   * The key is the client's RANDOM idempotency key. It is never a member
 *     number, card number, national ID or email — DEF-057 and DEF-079 were
 *     precisely about identifiers travelling in URLs. The shape is validated so a
 *     member number cannot be probed here even by hand.
 *   * Scoped to the caller's own tenant AND their own operations. A receipt that
 *     is not theirs returns 404, not 403 — a 403 would confirm the id exists.
 *   * The projection carries no request payload and no request hash.
 *
 * Note for future edits (Next 15): `params` is a Promise and must be awaited.
 * See docs/vendor/nextjs-15.5.15/01-app/03-api-reference/03-file-conventions/route.mdx.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOperationId } from "@/lib/correlation";
import { OperationReceiptService } from "@/server/services/operation-receipt.service";

export async function GET(_request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { operationId } = await params;

  // Reject anything that is not one of our opaque ids, so this cannot be used to
  // probe for member numbers or any other business identifier.
  if (!isOperationId(operationId)) {
    return NextResponse.json({ error: "Not a valid operation reference." }, { status: 400 });
  }

  const status = await OperationReceiptService.lookup({
    tenantId: session.user.tenantId,
    actorId: session.user.id,
    idempotencyKey: operationId,
  });

  if (!status) {
    // Deliberately 404 rather than 403: do not confirm that an id exists for
    // somebody else.
    return NextResponse.json({ error: "No operation found for that reference." }, { status: 404 });
  }

  return NextResponse.json(status, {
    // A receipt's state changes; never let a proxy or the browser serve a stale
    // "still processing" to somebody deciding whether to resubmit.
    headers: { "Cache-Control": "no-store" },
  });
}
