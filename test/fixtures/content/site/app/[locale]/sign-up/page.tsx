import Link from "next/link";
export const metadata = { title: "Sign up | Acme" };
export default function SignUp() {
  return <main><h1>Sign up</h1><Link href="/sign-up">Back to Sign up</Link></main>;
}
