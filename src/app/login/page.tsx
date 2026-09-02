import { LoginForm } from "@/components/login-form";

/**
 * `proxy.ts` already bounces signed-in visitors away from here, so this page
 * only ever renders for someone who needs to type the password.
 */
export const metadata = { title: "Sign in — Sales CRM" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </main>
  );
}
