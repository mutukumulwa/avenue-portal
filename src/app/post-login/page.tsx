import { getCachedSession } from "@/lib/auth";
import { measureAsync } from "@/lib/perf";
import { redirect } from "next/navigation";

export default async function PostLoginPage() {
  return measureAsync("post-login.redirect", async () => {
    const session = await getCachedSession();
    const role = session?.user?.role;

    if (!session?.user) redirect("/login");

    if (role === "BROKER_USER") redirect("/broker/dashboard");
    if (role === "MEMBER_USER") redirect("/member/dashboard");
    if (role === "HR_MANAGER") redirect("/hr/dashboard");
    if (role === "FUND_ADMINISTRATOR") redirect("/fund/dashboard");
    if (role === "PROVIDER_USER") redirect("/provider/dashboard");

    redirect("/dashboard");
  });
}
