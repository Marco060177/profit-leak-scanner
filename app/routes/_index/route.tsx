import type { LoaderFunctionArgs } from "react-router";
import { data, redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import prisma from "~/db.server";
import { capturePartnerReferral } from "~/services/partner-referral-flow.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const capture = await capturePartnerReferral(prisma, request, process.env.SHOPIFY_API_SECRET ?? "");
  const headers = capture.setCookie ? { "Set-Cookie": capture.setCookie } : undefined;

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`, { headers });
  }

  return data({ showForm: Boolean(login) }, { headers });
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>A short heading about [your app]</h1>
        <p className={styles.text}>
          A tagline about [your app] that describes your value proposition.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
        </ul>
      </div>
    </div>
  );
}
