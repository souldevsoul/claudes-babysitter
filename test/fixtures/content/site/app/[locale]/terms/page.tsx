import { PolicyLayout } from "@/components/PolicyLayout";
export const metadata = { title: "Terms of Service | Acme" };
export default function Terms() {
  return (
    <PolicyLayout title="Terms of Service">
      <h2>Refund Policy</h2>
      <p>You can ask for a refund within 30 days of purchase.</p>
      <p>We accept Visa, Mastercard and American Express.</p>
      <p>Prices are in USD only.</p>
      <p>We delete your account data within 7 days of account deletion.</p>
      <p>You can also raise a chargeback with your bank.</p>
      <p>Delete your account from settings; you can delete your account at any time.</p>
      <p>Invoices are kept for 7 years. We keep transaction records for at least five (5) years.</p>
    </PolicyLayout>
  );
}
