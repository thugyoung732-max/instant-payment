import React from 'react';

import { FlaskConical, Search } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/fairmoney/avatar";
import { BrandMark } from "@/components/fairmoney/brand";
import { ChatPanel } from "@/components/fairmoney/admin/chat-panel";
import {
  CodeRowActions,
  CodeStatusBadge,
  CreateDepositCodeForm,
  SeedDepositCodesButton,
  type DepositCodeRow,
} from "@/components/fairmoney/admin/deposit-code-panel";
import { ExportCsvButton } from "@/components/fairmoney/admin/export-csv-button";
import {
  ClearTransactionsButton,
  DeleteTransactionButton,
} from "@/components/fairmoney/admin/transaction-actions";
import { SeedDemoAccountsButton, UserRowActions } from "@/components/fairmoney/admin/user-row-actions";
import { WithdrawalActions } from "@/components/fairmoney/admin/withdrawal-actions";
import { WithdrawalFeePanel } from "@/components/fairmoney/admin/withdrawal-fee-panel";
import { SignOutButton } from "@/components/fairmoney/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { requireAdminProfile } from "@/lib/auth";
import { chatIsLive } from "@/lib/chat";
import { chatScriptUrl, type ChatProviderId } from "@/lib/chat-config";
import {
  getAdminOverview,
  getAdminTransactions,
  getAdminUsers,
  getChatSettings,
  getDepositCodes,
  getPendingWithdrawals,
  getTransactionCounts,
  getWithdrawalFeeSettings,
  type AdminTransactionFilter,
  type AdminTransactionRow,
} from "@/lib/data/queries";
import { formatShortDateTime } from "@/lib/datetime";
import { DEMO_PASSWORD } from "@/lib/demo-accounts";
import { formatUSD } from "@/lib/money";

/**
 * Operations console.
 *
 * The page is a server component: every table is fetched under the
 * administrator's own Supabase session, so Row Level Security — not the markup —
 * decides what can be read. Actions are server actions that call `admin_*`
 * database functions, and those functions re-check `is_admin` themselves. A
 * customer who reaches this URL is redirected before any of this renders, and a
 * customer who forges an action still fails inside Postgres.
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Profiles" },
  { id: "codes", label: "Deposit codes" },
  { id: "withdrawals", label: "Withdrawals" },
  { id: "chat", label: "Live chat" },
  { id: "ledger", label: "Ledger" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const LEDGER_FILTERS: Array<{ id: AdminTransactionFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "transfers", label: "Transfers" },
  { id: "deposits", label: "Deposits" },
  { id: "withdrawals", label: "Withdrawals" },
  { id: "pending", label: "Pending" },
  { id: "declined", label: "Failed" },
];

const STATE_COLOR: Record<string, string> = {
  COMPLETED: "text-fm-lime",
  PENDING: "text-amber-300",
  FAILED: "text-red-300",
};

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminProfile();
  const params = await searchParams;

  const tabValue = single(params.tab);
  const filterValue = single(params.filter);
  const query = single(params.q);

  const tab: TabId = TABS.some((item) => item.id === tabValue) ? (tabValue as TabId) : "overview";
  const ledgerFilter: AdminTransactionFilter = LEDGER_FILTERS.some((item) => item.id === filterValue)
    ? (filterValue as AdminTransactionFilter)
    : "all";

  const tabHref = (id: TabId) => (id === "overview" ? "/admin" : `/admin?tab=${id}`);

  return (
    <div className="min-h-dvh bg-[#0b1512] text-white">
      <header className="border-b border-white/8 bg-[#08110e]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-5 lg:px-8">
          <Link href="/admin" className="mr-auto flex items-center gap-3">
            <BrandMark tone="light" />
            <span className="hidden items-center gap-1.5 rounded-full border border-fm-lime/30 bg-fm-lime/12 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-fm-lime sm:inline-flex">
              <FlaskConical className="h-3 w-3" />
              operations console
            </span>
          </Link>

          <span className="flex items-center gap-2.5">
            <Avatar
              displayName={admin.displayName}
              hue={admin.avatarHue}
              username={admin.username}
              avatarUpdatedAt={admin.avatar?.updatedAt ?? null}
              size="sm"
            />
            <span className="fm-numeric font-mono text-[11.5px] text-white/45">
              @{admin.username}
            </span>
          </span>
          <Link
            href="/app"
            className="rounded-xl border border-white/12 px-3.5 py-2.5 font-display text-[12.5px] font-semibold text-white/85 transition-colors hover:bg-white/8"
          >
            Open wallet
          </Link>
          <SignOutButton className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-3.5 py-2.5 font-display text-[12.5px] font-semibold text-white/70 transition-colors hover:bg-white/8" />
        </div>

        <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-6 pb-4 lg:px-8">
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={tabHref(item.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
                item.id === tab
                  ? "bg-fm-lime text-fm-ink"
                  : "border border-white/10 text-white/55 hover:bg-white/8"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-7 px-6 py-8 lg:px-8">
        {tab === "overview" ? <OverviewTab /> : null}
        {tab === "users" ? <UsersTab query={query} /> : null}
        {tab === "codes" ? <CodesTab /> : null}
        {tab === "withdrawals" ? <WithdrawalsTab /> : null}
        {tab === "chat" ? <ChatTab /> : null}
        {tab === "ledger" ? <LedgerTab filter={ledgerFilter} query={query} /> : null}
      </main>
    </div>
  );
}

async function OverviewTab() {
  const [overview, recent] = await Promise.all([
    getAdminOverview(),
    getAdminTransactions("all", 8),
  ]);

  return (
    <>
      <section>
        <h1 className="font-display text-[26px] font-semibold leading-tight">Overview</h1>
        <p className="mt-2 text-[12.5px] text-white/55">
          {overview.txCount} ledger row{overview.txCount === 1 ? "" : "s"} · {overview.declined}{" "}
          failed · every figure is read under your own admin session
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Profiles"
          value={String(overview.userCount)}
          hint="registered accounts"
        />
        <Stat
          label="Money moved"
          value={formatUSD(overview.movedCents)}
          hint="completed transfers"
        />
        <Stat
          label="Pending withdrawals"
          value={formatUSD(overview.pendingWithdrawalCents)}
          hint={`${overview.pendingWithdrawalCount} awaiting review`}
          tone="warn"
        />
        <Stat
          label="Total balances"
          value={formatUSD(overview.totalBalanceCents)}
          hint="held across every wallet"
        />
      </div>

      <LedgerTable title="Latest activity" transactions={recent} />
    </>
  );
}

async function UsersTab({ query }: { query: string }) {
  const users = await getAdminUsers(query);

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold leading-tight">Profiles</h1>
          <p className="mt-2 text-[12.5px] text-white/55">
            {users.length} account{users.length === 1 ? "" : "s"} · adjustments are written by
            Postgres, never by the browser
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/admin" className="flex items-center gap-2">
            <input type="hidden" name="tab" value="users" />
            <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2">
              <Search className="h-3.5 w-3.5 text-white/35" />
              <input
                name="q"
                defaultValue={query}
                placeholder="Search handle, name or email"
                className="w-52 bg-transparent font-mono text-[11.5px] text-white outline-none placeholder:text-white/30"
              />
            </label>
          </form>
          <SeedDemoAccountsButton />
          <ExportCsvButton scope="profiles" profiles={users} />
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-white/8 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                <th className="px-5 py-3.5 font-medium">Profile</th>
                <th className="px-5 py-3.5 font-medium">Email</th>
                <th className="px-5 py-3.5 text-right font-medium">Balance</th>
                <th className="px-5 py-3.5 text-right font-medium">Sent</th>
                <th className="px-5 py-3.5 text-right font-medium">Received</th>
                <th className="px-5 py-3.5 font-medium">Joined</th>
                <th className="px-5 py-3.5 text-right font-medium">Adjust</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar
                        displayName={user.displayName}
                        hue={user.avatarHue}
                        username={user.username}
                        avatarUpdatedAt={user.avatar?.updatedAt ?? null}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-medium text-white">
                          {user.displayName}
                          {user.isAdmin ? (
                            <Badge
                              variant="outline"
                              className="border-fm-lime/30 bg-fm-lime/12 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-fm-lime"
                            >
                              admin
                            </Badge>
                          ) : null}
                        </p>
                        <p className="fm-numeric truncate font-mono text-[10.5px] text-white/45">
                          @{user.username}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-white/55">{user.email}</td>
                  <td className="fm-numeric px-5 py-3.5 text-right font-display font-semibold text-white">
                    {formatUSD(user.balanceCents)}
                  </td>
                  <td className="fm-numeric px-5 py-3.5 text-right text-white/55">
                    {user._count.sent}
                  </td>
                  <td className="fm-numeric px-5 py-3.5 text-right text-white/55">
                    {user._count.received}
                  </td>
                  <td className="px-5 py-3.5 text-white/45">{formatShortDateTime(user.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <UserRowActions
                      userId={user.id}
                      username={user.username}
                      balanceCents={user.balanceCents}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[12.5px] text-white/45">
                    No profiles match that search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <p className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4 text-[12px] leading-relaxed text-white/45">
        Demo accounts are created with the server-only service-role key and share one password
        (<span className="font-mono text-white/70">{DEMO_PASSWORD}</span>). Without that key, run{" "}
        <span className="font-mono text-white/70">supabase/seed.sql</span> once instead.
      </p>
    </>
  );
}

async function CodesTab() {
  const codes = await getDepositCodes();

  const rows: DepositCodeRow[] = codes.map((code) => ({
    id: code.id,
    code: code.code,
    creditCents: code.creditCents,
    label: code.label,
    active: code.active,
    singleUse: code.singleUse,
    maxUses: code.maxUses,
    uses: code.uses,
    createdAt: code.createdAt,
    redemptions: code._count.transactions,
  }));

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold leading-tight">Deposit codes</h1>
          <p className="mt-2 text-[12.5px] text-white/55">
            A code credits its own configured amount — never what the customer types in.
          </p>
        </div>
        <SeedDepositCodesButton />
      </section>

      <CreateDepositCodeForm />

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-white/8 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                <th className="px-5 py-3.5 font-medium">Code</th>
                <th className="px-5 py-3.5 font-medium">Label</th>
                <th className="px-5 py-3.5 text-right font-medium">Credits</th>
                <th className="px-5 py-3.5 text-right font-medium">Uses</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium">Created</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="fm-numeric px-5 py-3.5 font-mono text-[12.5px] tracking-[0.12em] text-white">
                    {row.code}
                  </td>
                  <td className="px-5 py-3.5 text-white/60">{row.label ?? "—"}</td>
                  <td className="fm-numeric px-5 py-3.5 text-right font-display font-semibold text-white">
                    {formatUSD(row.creditCents)}
                  </td>
                  <td className="fm-numeric px-5 py-3.5 text-right text-white/60">
                    {row.uses} / {row.maxUses === null ? "∞" : row.maxUses}
                    {row.singleUse ? (
                      <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-white/35">
                        single
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5">
                    <CodeStatusBadge row={row} />
                  </td>
                  <td className="px-5 py-3.5 text-white/45">{formatShortDateTime(row.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <CodeRowActions codeId={row.id} code={row.code} active={row.active} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[12.5px] text-white/45">
                    No deposit codes yet. Issue one above, or seed the samples.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const [pending, history, feeSettings] = await Promise.all([
  getPendingWithdrawals(),
  getAdminTransactions("withdrawals", 15),
  getWithdrawalFeeSettings(),
]);

  // Only the requested amount is held. The fee is informational, so it is never
  // added to the hold and never returned on a rejection.
  const pendingHeldCents = pending.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <>
      <section>
        <h1 className="font-display text-[26px] font-semibold leading-tight">Withdrawals</h1>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/55">
          Requests hold exactly the requested amount against the user&apos;s balance while they
          wait. The withdrawal fee is recorded beside the request for the customer&apos;s records —
          it is never debited from a wallet, and rejecting a request returns exactly the requested
          amount. Resolving a request only changes its status; nothing is disbursed to a bank, card
          or wallet.
        </p>
      </section>

      <WithdrawalFeePanel settings={feeSettings} />

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-3.5">
          <h2 className="mr-auto font-display text-sm font-semibold">Awaiting review</h2>
          <span className="fm-numeric rounded-full border border-amber-300/25 bg-amber-300/10 px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-amber-200">
            {pending.length} pending · {formatUSD(pendingHeldCents)} held
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-white/8 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                <th className="px-5 py-3.5 font-medium">Reference</th>
                <th className="px-5 py-3.5 font-medium">User</th>
                <th className="px-5 py-3.5 font-medium">Destination</th>
                <th className="px-5 py-3.5 text-right font-medium">Requested</th>
                <th className="px-5 py-3.5 text-right font-medium">Fee</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium">Requested at</th>
                <th className="px-5 py-3.5 text-right font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="fm-numeric px-5 py-3.5 font-mono text-[11.5px] text-white/70">
                    {row.reference}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar
                        displayName={row.sender?.displayName ?? "Unknown"}
                        hue={row.sender?.avatarHue ?? 200}
                        username={row.sender?.username}
                        avatarUpdatedAt={row.sender?.avatar?.updatedAt ?? null}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {row.sender?.displayName ?? "Unknown"}
                        </p>
                        <p className="fm-numeric truncate font-mono text-[10.5px] text-white/45">
                          @{row.sender?.username ?? "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-white/60">{row.destination ?? "—"}</td>
                  <td className="fm-numeric px-5 py-3.5 text-right font-display font-semibold text-white">
                    {formatUSD(row.amountCents)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="fm-numeric block text-amber-200">
                      {row.feeCents > 0 ? formatUSD(row.feeCents) : "—"}
                    </span>
                    {row.feeReason ? (
                      <span className="mt-0.5 block max-w-[190px] truncate text-[10.5px] text-white/35">
                        {row.feeReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`font-mono text-[10.5px] uppercase tracking-[0.1em] ${STATE_COLOR[row.status] ?? "text-white/60"}`}>
                      {row.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-white/45">{formatShortDateTime(row.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <WithdrawalActions transactionId={row.id} reference={row.reference} />
                      <DeleteTransactionButton
                        transactionId={row.id}
                        reference={row.reference}
                        heldCents={row.amountCents}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[12.5px] text-white/45">
                    No withdrawals waiting on review.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <LedgerTable title="Recent withdrawal requests" transactions={history} />
    </>
  );
}

async function ChatTab() {
  const settings = await getChatSettings();

  const loaderUrl = chatScriptUrl({
    enabled: settings.enabled,
    provider: settings.provider as ChatProviderId,
    primaryKey: settings.primaryKey,
    secondaryKey: settings.secondaryKey,
    customScriptUrl: settings.customScriptUrl,
  });

  return (
    <>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold leading-tight">Live chat</h1>
            <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-white/55">
              Connect the chat customers see. Choose a provider, paste its public widget key, and the
              widget loads on customer pages only — the console is excluded automatically. Any other
              product that ships a loader script can be wired up with “Any other script”.
            </p>
          </div>
          <span
            className={`rounded-full border px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] ${
              chatIsLive(settings)
                ? "border-fm-lime/30 bg-fm-lime/12 text-fm-lime"
                : "border-white/12 text-white/50"
            }`}
          >
            {chatIsLive(settings) ? "live" : "offline"}
          </span>
        </div>
      </section>

      <ChatPanel settings={settings} />

      <p className="rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4 text-[12px] leading-relaxed text-white/45">
        Active loader:{" "}
        <span className="font-mono text-white/70">{loaderUrl ?? "none — chat is not loading"}</span>
      </p>
    </>
  );
}

async function LedgerTab({ filter, query }: { filter: AdminTransactionFilter; query: string }) {
  const [transactions, counts] = await Promise.all([
    getAdminTransactions(filter, 40),
    getTransactionCounts(),
  ]);

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold leading-tight">Ledger</h1>
          <p className="mt-2 text-[12.5px] text-white/55">
            {counts.total} row{counts.total === 1 ? "" : "s"} in total · newest first · deleting a
            row never changes a balance
          </p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {LEDGER_FILTERS.map((item) => {
            const active = item.id === filter;
            const href = `/admin?tab=ledger${item.id === "all" ? "" : `&filter=${item.id}`}${
              query ? `&q=${encodeURIComponent(query)}` : ""
            }`;
            return (
              <Link
                key={item.id}
                href={href}
                className={`rounded-full px-3.5 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? "bg-fm-lime text-fm-ink"
                    : "border border-white/10 text-white/55 hover:bg-white/8"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportCsvButton scope="ledger" transactions={transactions} />
          <ClearTransactionsButton
            total={counts.total}
            settled={counts.settled}
            pendingCount={counts.pendingCount}
            pendingHeldCents={counts.pendingHeldCents}
          />
        </div>
      </section>

      <LedgerTable transactions={transactions} />
    </>
  );
}

function LedgerTable({
  title,
  transactions,
  footer,
}: {
  title?: string;
  transactions: AdminTransactionRow[];
  footer?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
      {title ? (
        <div className="flex items-center gap-4 border-b border-white/8 px-5 py-3.5">
          <h2 className="mr-auto font-display text-sm font-semibold">{title}</h2>
          {footer}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1160px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-white/8 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
              <th className="px-5 py-3.5 font-medium">Transaction ID</th>
              <th className="px-5 py-3.5 font-medium">Type</th>
              <th className="px-5 py-3.5 font-medium">User</th>
              <th className="px-5 py-3.5 text-right font-medium">Amount</th>
              <th className="px-5 py-3.5 text-right font-medium">Fee</th>
              <th className="px-5 py-3.5 text-right font-medium">Debited</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
              <th className="px-5 py-3.5 font-medium">When (UTC)</th>
              <th className="px-5 py-3.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                <td className="fm-numeric px-5 py-3.5 font-mono text-[11.5px] text-white/70">
                  {tx.reference}
                </td>
                <td className="px-5 py-3.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-white/50">
                  {tx.type}
                </td>
                <td className="px-5 py-3.5 text-white/70">
                  {tx.sender || tx.recipient ? (
                    <span className="block truncate">
                      @{tx.sender?.username ?? tx.recipient?.username ?? "—"}
                    </span>
                  ) : (
                    <span className="text-white/40">system</span>
                  )}
                  {tx.sender && tx.recipient && tx.senderId !== tx.recipientId ? (
                    <span className="fm-numeric block truncate font-mono text-[10.5px] text-white/45">
                      → @{tx.recipient.username}
                    </span>
                  ) : null}
                  {tx.destination ? (
                    <span className="block truncate text-[10.5px] text-white/35">
                      {tx.destination}
                    </span>
                  ) : null}
                  {tx.depositCode ? (
                    <span className="fm-numeric block font-mono text-[10.5px] text-white/35">
                      code {tx.depositCode.code}
                    </span>
                  ) : null}
                </td>
                <td className="fm-numeric px-5 py-3.5 text-right font-display font-semibold text-white">
                  {formatUSD(tx.amountCents)}
                </td>
                <td className="fm-numeric px-5 py-3.5 text-right text-amber-200">
                  {tx.feeCents > 0 ? formatUSD(tx.feeCents) : "—"}
                  {tx.feeReason ? (
                    <span className="mt-0.5 block max-w-[170px] truncate text-[10.5px] font-sans normal-case tracking-normal text-white/35">
                      {tx.feeReason}
                    </span>
                  ) : null}
                </td>
                <td className="fm-numeric px-5 py-3.5 text-right font-display font-semibold text-white">
                  {formatUSD(tx.amountCents)}
                  {tx.feeCents > 0 ? (
                    <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.1em] text-white/30">
                      fee not charged
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`font-mono text-[10.5px] uppercase tracking-[0.1em] ${
                      STATE_COLOR[tx.status] ?? "text-white/60"
                    }`}
                  >
                    {tx.status.toLowerCase()}
                  </span>
                  {tx.failureReason ? (
                    <span className="block text-[10.5px] text-red-300/70">{tx.failureReason}</span>
                  ) : null}
                </td>
                <td className="fm-numeric px-5 py-3.5 text-white/45">
                  {formatShortDateTime(tx.createdAt)}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <DeleteTransactionButton
                    transactionId={tx.id}
                    reference={tx.reference}
                    heldCents={
                      tx.type === "WITHDRAWAL" && tx.status === "PENDING" ? tx.amountCents : 0
                    }
                  />
                </td>
              </tr>
            ))}
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-[12.5px] text-white/45">
                  Nothing in this view yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0e1a16] px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p
        className={`fm-numeric mt-2.5 font-display text-xl font-semibold ${
          tone === "warn" ? "text-amber-300" : "text-white"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10.5px] text-white/35">{hint}</p>
    </div>
  );
}
