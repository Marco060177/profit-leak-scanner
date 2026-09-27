import * as React from "react";
import type { PartnerDashboardViewModel } from "~/services/partner-dashboard.server";
import styles from "./PartnerDashboard.module.css";

export function PartnerDashboard({ dashboard }: { dashboard: PartnerDashboardViewModel }) {
  const [copied, setCopied] = React.useState(false);
  const copyLink = async () => {
    await navigator.clipboard.writeText(dashboard.partner.referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><b>MARGIN<span>LAB</span></b><small>{dashboard.partner.displayName}</small></header>
    <section className={styles.hero}><div><p className={styles.eyebrow}>PARTNER PROGRAM</p><h1>Earn up to <span>{dashboard.summary.maximumReward.formatted}</span></h1><p>Grow your qualified customer community and unlock cumulative rewards.</p></div><div className={styles.heroProgress}><b>{dashboard.progressToMaximumPercent}%</b><small>to Legend</small></div></section>
    <section className={styles.metrics} aria-label="Partner progress summary">
      <article><span>Qualified Customers</span><b>{dashboard.summary.qualifiedCustomers}</b></article>
      <article><span>Reward Unlocked</span><b>{dashboard.summary.rewardUnlocked.formatted}</b></article>
      <article><span>Total Referrals</span><b>{dashboard.summary.attributedReferrals}</b></article>
    </section>
    <section className={styles.grid}>
      <article className={styles.card}><p className={styles.eyebrow}>{dashboard.nextMilestone ? "NEXT REWARD" : "MAXIMUM REWARD"}</p>
        {dashboard.nextMilestone ? <><strong className={styles.reward}>{dashboard.nextMilestone.reward.formatted}</strong><div className={styles.progressLabel}><span>{dashboard.summary.qualifiedCustomers} / {dashboard.nextMilestone.qualifiedCustomerTarget} qualified customers</span><b>{dashboard.nextMilestone.progressPercent}%</b></div><div className={styles.track}><div style={{ width: `${dashboard.nextMilestone.progressPercent}%` }} /></div><p>{dashboard.nextMilestone.customersRemaining} more qualified customers to unlock {dashboard.nextMilestone.reward.formatted}</p></> : <><strong className={styles.reward}>{dashboard.summary.maximumReward.formatted}</strong><p>Legend unlocked. You reached the top Partner milestone.</p></>}
      </article>
      <article className={styles.card}><p className={styles.eyebrow}>YOUR REFERRAL</p><span className={styles.label}>Referral code</span><strong className={styles.code}>{dashboard.partner.referralCode}</strong><span className={styles.label}>Referral link</span><div className={styles.link}><span>{dashboard.partner.referralLink}</span><button type="button" onClick={copyLink}>{copied ? "Copied" : "Copy"}</button></div></article>
    </section>
    <section className={`${styles.card} ${styles.ladder}`}><p className={styles.eyebrow}>PAYOUT STATUS</p><h2>Your payout summary</h2><div className={styles.tiers}>
      <article className={styles.tier}><div><small>PAID</small><h3>{dashboard.payouts.paid.formatted}</h3></div></article>
      <article className={styles.tier}><div><small>OUTSTANDING</small><h3>{dashboard.payouts.outstanding.formatted}</h3></div><div><span>{dashboard.payouts.pending.formatted} pending · {dashboard.payouts.approved.formatted} approved</span></div></article>
      {dashboard.payouts.history.map((entry, index) => <article key={`${entry.createdAt}-${index}`} className={styles.tier}><div><small>{entry.status}</small><h3>{entry.amount.formatted}</h3></div><div><span>{new Date(entry.createdAt).toLocaleDateString()}</span></div></article>)}
    </div></section>
    <section className={`${styles.card} ${styles.ladder}`}><p className={styles.eyebrow}>MILESTONE LADDER</p><h2>Your path to Legend</h2><div className={styles.tiers}>{dashboard.milestones.map((tier) => <article key={tier.key} className={`${styles.tier} ${styles[tier.state.toLowerCase()]}`}><div><small>{tier.state === "NEXT" ? "CURRENT / NEXT" : tier.state}</small><h3>{tier.label}</h3></div><div><b>{tier.reward.formatted}</b><span>{tier.qualifiedCustomerTarget} qualified</span></div></article>)}</div></section>
  </div></main>;
}
