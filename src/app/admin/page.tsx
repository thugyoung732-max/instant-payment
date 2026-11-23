import React from 'react';

import { FlaskConical, LogOut, Search } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/fairmoney/avatar";
import { BrandMark } from "@/components/fairmoney/brand";
import {
  CodeRowActions,
  CodeStatusBadge,
  CreateDepositCodeForm,
  SeedDepositCodesButton,
  type DepositCodeRow,
} from "@/components/fairmoney/admin/deposit-code-panel";
import { ChatPanel } from "@/components/fairmoney/admin/chat-panel";
import {
  ClearTransactionsButton,
  DeleteTransactionButton,
} from "@/components/fairmoney/admin/transaction-actions";
import { WithdrawalActions } from "@/components/fairmoney/admin/withdrawal-actions";
import {
  SeedDemoAccountsButton,
  UserRowActions,
} from "@/components/fairmoney/admin/user-row-actions";
import { Badge } from "@/components/ui/badge";
import { logOutAction } from "@/server/actions/auth";
import { requireAdmin } from "@/lib/auth";
import { chatIsLive, getChatSettings } from "@/lib/chat";
import { chatScriptUrl, type ChatProviderId } from "@/lib/chat-config";
import { formatShortDateTime } from "@/lib/datetime";
import { DEMO_PASSWORD } from "@/lib/demo-accounts";
import { formatUSD } from "@/lib/money";
import {
  getAdminOverview,
  getAdminTransactions,
  getAdminUsers,
  getDepositCodes,
  getPendingWithdrawals,
  getTransactionCounts,
  type AdminTransactionFilter,
} from "@/lib/queries";

export const metadata = { title: "Operations console — INSTANT PAYMENT" };

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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; filter?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const tab: TabId = TABS.some((item) => item.id === params.tab)
    ? (params.tab as TabId)
    : "overview";
  const query = params.q ?? "";
  const ledgerFilter: AdminTransactionFilter = LEDGER_FILTERS.some(
    (item) => item.id === params.filter,
  )
    ? (params.filter as AdminTransactionFilter)
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
          <form action={logOutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-3.5 py-2.5 font-display text-[12.5px] font-semibold text-white/70 transition-colors hover:bg-white/8"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </form>
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

      <main className="mx-auto max-w-6xl space-y-7 px-6 py-7 lg:px-8 lg:py-9">
        {tab === "overview" ? <OverviewTab query={query} /> : null}
        {tab === "users" ? <UsersTab query={query} /> : null}
        {tab === "codes" ? <CodesTab /> : null}
        {tab === "withdrawals" ? <WithdrawalsTab /> : null}
        {tab === "chat" ? <ChatTab /> : null}
        {tab === "ledger" ? <LedgerTab filter={ledgerFilter} query={query} /> : null}

        <p className="pb-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
          INSTANT PAYMENT · operations console · audit every movement
        </p>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

async function OverviewTab({ query }: { query: string }) {
  const [overview, recent] = await Promise.all([
    getAdminOverview(),
    getAdminTransactions("all", 6),
  ]);

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold leading-tight">Overview</h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/55">
            Every profile, balance and movement in one place. Seeded test profiles use the password{" "}
            <span className="font-mono text-fm-lime">{DEMO_PASSWORD}</span>.
            {query ? ` Search is active on the Profiles tab for “${query}”.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <SeedDemoAccountsButton />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Stat
          label="Profiles"
          value={String(overview.userCount)}
          hint={`${overview.txCount} ledger rows`}
        />
        <Stat
          label="Balances held"
          value={formatUSD(overview.totalBalanceCents)}
          hint="sum of all balances"
        />
        <Stat
          label="Transferred"
          value={formatUSD(overview.movedCents)}
          hint="settled peer transfers"
        />
        <Stat
          label="Withdrawals in review"
          value={formatUSD(overview.pendingWithdrawalCents)}
          hint={`${overview.pendingWithdrawalCount} pending · ${overview.declined} failed attempts`}
          tone={overview.pendingWithdrawalCount > 0 ? "warn" : "default"}
        />
      </section>

      <LedgerTable
        title="Latest activity"
        transactions={recent}
        footer={
          <Link href="/admin?tab=ledger" className="text-[11.5px] text-fm-lime hover:underline">
            Open full ledger →
          </Link>
        }
      />
    </>
  );
}

async function UsersTab({ query }: { query: string }) {
  const users = await getAdminUsers(query);

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold leading-tight">Profiles</h1>
          <p className="mt-2 text-[12.5px] text-white/55">
            {users.length} profile{users.length === 1 ? "" : "s"} · adjust balances or reset an
            account
          </p>
        </div>
        <form className="relative" action="/admin">
          <input type="hidden" name="tab" value="users" />
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search @handle, name or email"
            className="w-72 rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-3.5 text-[12.5px] text-white outline-none placeholder:text-white/30 focus:border-fm-green-bright/50"
          />
        </form>
        <a
          href="/admin/audit/export?scope=profiles"
          className="rounded-full border border-fm-lime/30 bg-fm-lime/12 px-4 py-2 font-display text-[12.5px] font-semibold text-fm-lime transition-colors hover:bg-fm-lime/20"
        >
          Export profiles CSV
        </a>
      </section>

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-white/8 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                <th className="px-5 py-3.5 font-medium">Profile</th>
                <th className="px-5 py-3.5 font-medium">Email</th>
                <th className="px-5 py-3.5 text-right font-medium">Balance</th>
                <th className="px-5 py-3.5 text-right font-medium">Sent / received</th>
                <th className="px-5 py-3.5 font-medium">Joined</th>
                <th className="px-5 py-3.5 text-right font-medium">Actions</th>
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
                              className="border-fm-lime/30 bg-fm-lime/12 font-mono text-[9.5px] uppercase tracking-[0.12em] text-fm-lime"
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
                  <td className="px-5 py-3.5 text-white/60">{user.email}</td>
                  <td className="fm-numeric px-5 py-3.5 text-right font-display font-semibold text-white">
                    {formatUSD(user.balanceCents)}
                  </td>
                  <td className="fm-numeric px-5 py-3.5 text-right text-white/55">
                    {user._count.sent} / {user._count.received}
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
                  <td colSpan={6} className="px-5 py-10 text-center text-[12.5px] text-white/45">
                    No profiles match “{query}”. Try seeding the demo roster from the Overview tab.
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

  const totalIssued = rows.reduce((sum, row) => sum + row.uses, 0);

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold leading-tight">Deposit codes</h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/55">
            Codes are the only way money enters a wallet besides a transfer. A code always credits
            its configured amount, single-use codes cannot be redeemed twice, and everything is
            verified server-side.
          </p>
        </div>
        <SeedDepositCodesButton />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <CreateDepositCodeForm />

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <h3 className="font-display text-[13.5px] font-semibold text-white">
            How redemption works
          </h3>
          <ol className="mt-3.5 space-y-3 text-[12px] leading-relaxed text-white/55">
            <li>1 · The user submits the code from the app.</li>
            <li>2 · The server looks the code up and rejects unknown or disabled codes.</li>
            <li>
              3 · Redemption capacity is claimed with a conditional update, so a single-use code can
              never be redeemed twice — even by concurrent requests.
            </li>
            <li>4 · Only then is the balance credited and a deposit row written.</li>
            <li>5 · Failed attempts are recorded with the reason for review.</li>
          </ol>
          <p className="mt-5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/45">
            {rows.length} codes issued · {totalIssued} total redemptions
          </p>
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-white/8 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                <th className="px-5 py-3.5 font-medium">Code</th>
                <th className="px-5 py-3.5 font-medium">Label</th>
                <th className="px-5 py-3.5 text-right font-medium">Credits</th>
                <th className="px-5 py-3.5 text-right font-medium">Used / limit</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium">Created</th>
                <th className="px-5 py-3.5 text-right font-medium">Actions</th>
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

async function WithdrawalsTab() {
  const [pending, history] = await Promise.all([
    getPendingWithdrawals(),
    getAdminTransactions("withdrawals", 15),
  ]);

  const pendingHeldCents = pending.reduce((sum, row) => sum + row.amountCents + row.feeCents, 0);

  return (
    <>
      <section>
        <h1 className="font-display text-[26px] font-semibold leading-tight">Withdrawals</h1>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/55">
          Requests hold the exact amount against the user&apos;s balance while they wait, and no fee
          is charged on a payout. Resolving a request only changes its database status — nothing is
          ever disbursed to a bank, card or wallet. Failing a request releases the hold back to the
          user.
        </p>
      </section>

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0e1a16]">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-3.5">
          <h2 className="mr-auto font-display text-sm font-semibold">Awaiting review</h2>
          <span className="fm-numeric rounded-full border border-amber-300/25 bg-amber-300/10 px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-amber-200">
            {pending.length} pending · {formatUSD(pendingHeldCents)} held
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-white/8 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                <th className="px-5 py-3.5 font-medium">Transaction</th>
                <th className="px-5 py-3.5 font-medium">User</th>
                <th className="px-5 py-3.5 font-medium">Destination</th>
                <th className="px-5 py-3.5 text-right font-medium">Withdrawal</th>
                <th className="px-5 py-3.5 text-right font-medium">Held</th>
                <th className="px-5 py-3.5 font-medium">Requested</th>
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
                  <td className="fm-numeric px-5 py-3.5 text-right text-white/70">
                    {formatUSD(row.amountCents + row.feeCents)}
                  </td>
                  <td className="px-5 py-3.5 text-white/45">{formatShortDateTime(row.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <WithdrawalActions transactionId={row.id} reference={row.reference} />
                      <DeleteTransactionButton
                        transactionId={row.id}
                        reference={row.reference}
                        heldCents={row.amountCents + row.feeCents}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[12.5px] text-white/45">
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
          <a
            href="/admin/audit/export?scope=ledger"
            className="rounded-full border border-fm-lime/30 bg-fm-lime/12 px-4 py-2 font-display text-[12.5px] font-semibold text-fm-lime transition-colors hover:bg-fm-lime/20"
          >
            Export ledger CSV
          </a>
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
  transactions: Awaited<ReturnType<typeof getAdminTransactions>>;
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
              <th className="px-5 py-3.5 text-right font-medium">Withdrawal</th>
              <th className="px-5 py-3.5 text-right font-medium">Fee</th>
              <th className="px-5 py-3.5 text-right font-medium">Total</th>
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
                </td>
                <td className="fm-numeric px-5 py-3.5 text-right font-display font-semibold text-white">
                  {formatUSD(tx.amountCents + tx.feeCents)}
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
                      tx.type === "WITHDRAWAL" && tx.status === "PENDING"
                        ? tx.amountCents + tx.feeCents
                        : 0
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
