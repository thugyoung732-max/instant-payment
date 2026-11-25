"use client";
import React from 'react';

import { AnimatePresence, motion } from "framer-motion";
import { Check, CircleAlert, Clock, Landmark, Loader2, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AnimatedAmount } from "@/components/fairmoney/animated-amount";
import { Magnetic } from "@/components/fairmoney/magnetic";
import {
  COUNTRIES,
  COUNTRY_REGIONS,
  WALLET_DESTINATIONS,
  checkBankField,
  findBank,
  findCountry,
  findWallet,
  searchBanks,
} from "@/lib/destinations";
import type { WithdrawalFeeSettings } from "@/lib/data/types";
import { formatUSD, parseAmountToCents } from "@/lib/money";
import { withdrawAction } from "@/lib/actions/wallet";

type Submitted = {
  reference: string;
  amountCents: number;
  feeCents: number;
  feeReason: string | null;
  totalCents: number;
  destination: string;
  balanceAfterCents: number;
  createdAt: string;
};

type Mode = "bank" | "wallet";

// The withdrawal fee is informational only. A $10,000 request with a $500 fee
// debits exactly $10,000 — never $10,500, and the request is never reduced to
// $9,500. The fee is recorded against the request for the customer's records.

const fieldClass =
  "mt-3.5 w-full rounded-[18px] border border-border bg-secondary/40 px-4 py-3.5 text-[16px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/45 focus:bg-card";

const modeButtonClass = (active: boolean) =>
  `rounded-[14px] px-3 py-2.5 font-display text-[13px] font-semibold transition-colors ${
    active
      ? "bg-card text-foreground shadow-[0_10px_24px_-20px_rgba(7,24,20,0.9)]"
      : "text-muted-foreground hover:text-foreground"
  }`;

export function WithdrawForm({
  balanceCents,
  fee = null,
}: {
  balanceCents: number;
  fee?: WithdrawalFeeSettings | null;
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Mode>("bank");
  const [accountName, setAccountName] = useState("");

  // Bank directory state. No bank is preselected: the customer has to pick one
  // from their country's list so a payout can never default to the wrong bank.
  const [countryCode, setCountryCode] = useState<string>("US");
  const [bankQuery, setBankQuery] = useState("");
  const [bankId, setBankId] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});

  // Wallet state.
  const [walletId, setWalletId] = useState<string>(WALLET_DESTINATIONS[0].id);
  const [identifier, setIdentifier] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);

  const country = findCountry(countryCode) ?? COUNTRIES[0];
  const bank = bankId ? findBank(bankId) : undefined;
  const selectedBank = bank && bank.countryCode === country.code ? bank : undefined;
  const bankMatches = searchBanks(country.code, bankQuery);
  const wallet = findWallet(walletId) ?? WALLET_DESTINATIONS[0];

  const amountCents = parseAmountToCents(amount);

  // Read from the stored settings row on the server. Nothing here is submitted:
  // the database looks the fee up itself when the request is created, so this is
  // disclosure, not calculation.
  const feeKnown = fee !== null;
  const feeCents = fee?.feeCents ?? 0;
  const feeReason = fee?.feeReason ?? "";

  // "Total withdrawal request" is the requested amount. The fee is recorded
  // beside it and never added to (or subtracted from) the wallet movement.
  const totalCents = amountCents ?? 0;
  const overdraft = amountCents !== null && amountCents > balanceCents;

  const detailsComplete = country.fields.every(
    (spec) => checkBankField(spec, details[spec.key] ?? "") === null,
  );
  const bankReady = Boolean(selectedBank) && detailsComplete;
  const destinationReady =
    mode === "bank" ? bankReady : identifier.trim().length >= 3;

  const canSubmit =
    Boolean(amountCents) &&
    !overdraft &&
    accountName.trim().length >= 2 &&
    destinationReady &&
    !busy;

  function chooseCountry(next: string) {
    setCountryCode(next);
    setBankId("");
    setBankQuery("");
    setDetails({});
  }

  async function submit() {
    if (!canSubmit || !amountCents) return;
    setBusy(true);
    setError(null);

    const holder = accountName.trim();

    const result =
      mode === "bank"
        ? selectedBank
          ? await withdrawAction({
              amountCents,
              accountName: holder,
              bank: { countryCode: country.code, bankId: selectedBank.id, details },
            })
          : null
        : await withdrawAction({
            amountCents,
            accountName: holder,
            destinationId: wallet.id,
            identifier,
          });

    setBusy(false);

    if (!result) {
      setError("Choose a bank from the directory.");
      return;
    }

    if (!result.ok) {
      setError(result.message);
      toast.error(result.message);
      return;
    }

    setSubmitted({
      reference: result.reference,
      amountCents: result.amountCents,
      feeCents: result.feeCents,
      feeReason: result.feeReason ?? (feeReason || null),
      totalCents: result.totalCents,
      destination: result.destination,
      balanceAfterCents: result.balanceAfterCents,
      createdAt: result.createdAt,
    });
    toast.success("Withdrawal submitted — pending approval");
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 18, mass: 0.4 }}
          className="fm-card fm-card-ink relative isolate overflow-hidden px-6 py-7 text-white"
        >
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "radial-gradient(80% 60% at 86% 0%, rgba(245,158,11,0.26), transparent 60%), radial-gradient(60% 50% at 0% 100%, rgba(22,199,139,0.2), transparent 65%)",
            }}
          />
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 14, mass: 0.5, delay: 0.06 }}
            className="grid h-14 w-14 place-items-center rounded-full bg-amber-300 text-fm-ink"
          >
            <Clock className="h-6 w-6" strokeWidth={2.3} />
          </motion.span>

          <p className="fm-label mt-6 text-white/55">Withdrawal submitted</p>
          <p className="fm-numeric mt-3 font-display text-[40px] font-semibold leading-none tracking-[-0.03em]">
            {formatUSD(submitted.amountCents)}
          </p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/12 px-3.5 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-amber-200">
            <Clock className="h-3.5 w-3.5" />
            Pending approval
          </span>

          <dl className="mt-6 space-y-3 text-[12.5px] text-white/60">
            <div className="flex items-start justify-between gap-4">
              <dt>Transaction ID</dt>
              <dd className="fm-numeric font-mono text-white/85">{submitted.reference}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0">Destination</dt>
              <dd className="max-w-[64%] break-words text-right text-white/85">
                {submitted.destination}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt>Withdrawal fee</dt>
              <dd className="fm-numeric text-white/85">
                {submitted.feeCents > 0 ? formatUSD(submitted.feeCents) : "No fee"}
              </dd>
            </div>
            {submitted.feeReason ? (
              <div className="flex items-start justify-between gap-4">
                <dt>Fee reason</dt>
                <dd className="max-w-[62%] text-right text-white/85">{submitted.feeReason}</dd>
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4">
              <dt>Total withdrawal request</dt>
              <dd className="fm-numeric text-white/85">{formatUSD(submitted.totalCents)}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt>Status</dt>
              <dd className="text-white/85">Pending approval</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt>Requested</dt>
              <dd className="fm-numeric text-white/85">
                {new Date(submitted.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC
              </dd>
            </div>
          </dl>

          <div className="mt-6 rounded-[22px] bg-white/8 px-5 py-4">
            <p className="fm-label text-white/50">Available balance</p>
            <AnimatedAmount
              cents={submitted.balanceAfterCents}
              className="mt-2 block font-display text-[26px] font-semibold"
            />
          </div>

          <p className="mt-6 text-[12.5px] leading-relaxed text-white/55">
            We&apos;ll email you once this withdrawal has been reviewed. Requests are usually settled
            within 1–2 business days.
          </p>
        </motion.section>

        <button
          type="button"
          onClick={() => {
            setSubmitted(null);
            setAmount("");
            setAccountName("");
            setIdentifier("");
            setDetails({});
          }}
          className="fm-btn fm-btn-ghost w-full"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="fm-card px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="fm-label">Withdrawal fee</p>
          <p className="fm-numeric font-display text-[17px] font-semibold text-foreground">
            {feeKnown ? (feeCents > 0 ? formatUSD(feeCents) : "No fee") : "—"}
          </p>
        </div>

        {feeKnown && feeCents > 0 ? (
          <>
            {feeReason ? (
              <p className="mt-2 text-[12.5px] leading-relaxed text-foreground">{feeReason}</p>
            ) : null}
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              A flat fee, recorded with the request. It is never deducted from your wallet — you are
              debited only the amount you ask for, and the request stays pending until it is
              approved.
            </p>
          </>
        ) : feeKnown ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            No withdrawal fee is currently charged. Requests are still reviewed before payout.
          </p>
        ) : (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            Fee details could not be loaded right now. The exact fee, if any, appears on your
            confirmation once you submit.
          </p>
        )}
      </section>

      <section className="fm-card px-6 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <label htmlFor="withdraw-amount" className="fm-label">
            Amount
          </label>
          <span className="fm-numeric text-[12.5px] text-muted-foreground">
            Available {formatUSD(balanceCents)}
          </span>
        </div>

        <div className="mt-3.5 flex items-center gap-3 rounded-[18px] border border-border bg-secondary/40 px-4 py-3.5 transition-colors focus-within:border-primary/45 focus-within:bg-card">
          <span className="font-display text-[26px] font-semibold text-muted-foreground">$</span>
          <input
            id="withdraw-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            className="fm-numeric min-w-0 flex-1 bg-transparent font-display text-[26px] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/45"
          />
          <button
            type="button"
            onClick={() => setAmount((balanceCents / 100).toFixed(2))}
            className="shrink-0 rounded-full border border-fm-ink/15 bg-fm-ink px-3.5 py-2 font-display text-[12.5px] font-semibold text-fm-lime"
          >
            Max
          </button>
        </div>

        {amountCents ? (
          <dl className="mt-5 space-y-2.5 rounded-[20px] border border-border bg-secondary/40 px-4 py-4 text-[13px]">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Withdrawal amount</dt>
              <dd className="fm-numeric text-foreground">{formatUSD(amountCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Withdrawal fee</dt>
              <dd className="fm-numeric text-foreground">
                {feeKnown ? (feeCents > 0 ? formatUSD(feeCents) : "No fee") : "—"}
              </dd>
            </div>
            {feeReason ? (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Fee reason</dt>
                <dd className="max-w-[62%] text-right text-foreground">{feeReason}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-2.5">
              <dt className="font-semibold text-foreground">Total withdrawal request</dt>
              <dd className="fm-numeric font-display text-[15px] font-semibold text-foreground">
                {formatUSD(totalCents)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-mono text-[11px] uppercase tracking-[0.12em] text-amber-600">
                Pending approval
              </dd>
            </div>
          </dl>
        ) : null}

        {overdraft ? (
          <p className="mt-3.5 flex items-center gap-2 text-[12.5px] text-destructive">
            <CircleAlert className="h-4 w-4" />
            That is more than your available balance.
          </p>
        ) : null}
      </section>

      <section className="fm-card px-6 py-6">
        <p className="fm-label">Withdraw to</p>

        <div
          role="tablist"
          aria-label="Destination type"
          className="mt-3.5 grid grid-cols-2 gap-1 rounded-[18px] border border-border bg-secondary/50 p-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "bank"}
            onClick={() => setMode("bank")}
            className={modeButtonClass(mode === "bank")}
          >
            Bank account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "wallet"}
            onClick={() => setMode("wallet")}
            className={modeButtonClass(mode === "wallet")}
          >
            Wallet or app
          </button>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {mode === "bank" ? (
            <motion.div
              key="bank"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <label htmlFor="withdraw-country" className="fm-label mt-6 block">
                Country
              </label>
              <select
                id="withdraw-country"
                value={country.code}
                onChange={(event) => chooseCountry(event.target.value)}
                className={fieldClass}
              >
                {COUNTRY_REGIONS.map((region) => (
                  <optgroup key={region} label={region}>
                    {COUNTRIES.filter((item) => item.region === region).map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                Pick the country where the account is held. The banking details we ask for change
                with the country.
              </p>

              <label htmlFor="bank-search" className="fm-label mt-6 block">
                Bank
              </label>
              <div className="mt-3.5 flex items-center gap-2.5 rounded-[18px] border border-border bg-secondary/40 px-4 py-3 transition-colors focus-within:border-primary/45 focus-within:bg-card">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  id="bank-search"
                  type="search"
                  value={bankQuery}
                  onChange={(event) => setBankQuery(event.target.value)}
                  placeholder={`Search ${country.name} banks`}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/50"
                />
              </div>

              <div
                role="listbox"
                aria-label={`${country.name} bank directory`}
                className="mt-3 max-h-[260px] overflow-y-auto rounded-[18px] border border-border bg-secondary/25 p-1.5"
              >
                {bankMatches.length ? (
                  bankMatches.map((item) => {
                    const active = item.id === selectedBank?.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => setBankId(item.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-[14px] px-3.5 py-3 text-left transition-colors ${
                          active
                            ? "bg-card text-foreground"
                            : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-medium">{item.name}</span>
                          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                            {country.name}
                            {item.generic ? " · not listed" : ""}
                          </span>
                        </span>
                        {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="px-3.5 py-4 text-[12.5px] leading-relaxed text-muted-foreground">
                    No bank matches “{bankQuery.trim()}”. Try a shorter search, or choose “Other{" "}
                    {country.shortName} bank” after clearing it.
                  </p>
                )}
              </div>

              {selectedBank ? (
                <p className="mt-3 text-[12.5px] text-muted-foreground">
                  Sending to{" "}
                  <span className="font-semibold text-foreground">{selectedBank.name}</span> ·{" "}
                  {country.name}
                </p>
              ) : (
                <p className="mt-3 text-[12.5px] text-muted-foreground">
                  Choose the bank that holds the account.
                </p>
              )}

              <label htmlFor="account-name" className="fm-label mt-6 block">
                Name on account
              </label>
              <input
                id="account-name"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value.slice(0, 60))}
                placeholder="Full name on the account"
                autoComplete="name"
                className={fieldClass}
              />
              <p className="mt-3 text-[12.5px] text-muted-foreground">
                Required. It must match the name the bank has on file.
              </p>

              {country.fields.map((spec) => {
                const raw = details[spec.key] ?? "";
                // Only complain once something has been typed: an empty field
                // shows its hint instead of an error.
                const issue = raw.trim() ? checkBankField(spec, raw) : null;
                return (
                  <div key={spec.key}>
                    <label htmlFor={`bank-${spec.key}`} className="fm-label mt-6 block">
                      {spec.label}
                    </label>
                    <input
                      id={`bank-${spec.key}`}
                      value={raw}
                      onChange={(event) =>
                        setDetails((previous) => ({
                          ...previous,
                          [spec.key]: event.target.value.slice(0, spec.maxLength + 4),
                        }))
                      }
                      placeholder={spec.placeholder}
                      inputMode={spec.inputMode}
                      autoComplete="off"
                      spellCheck={false}
                      className={`${fieldClass} ${spec.inputMode === "numeric" ? "fm-numeric" : ""}`}
                    />
                    {issue ? (
                      <p className="mt-2 flex items-center gap-2 text-[12px] text-destructive">
                        <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                        {issue}
                      </p>
                    ) : spec.hint ? (
                      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                        {spec.hint}
                      </p>
                    ) : null}
                  </div>
                );
              })}

              <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
                Only masked banking details are stored with the request — the last few characters of
                the account and routing numbers. We never keep the full numbers on the transaction.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="wallet"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <label htmlFor="withdraw-wallet" className="fm-label mt-6 block">
                Wallet or app
              </label>
              <select
                id="withdraw-wallet"
                value={wallet.id}
                onChange={(event) => setWalletId(event.target.value)}
                className={fieldClass}
              >
                {WALLET_DESTINATIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>

              <label htmlFor="account-name" className="fm-label mt-6 block">
                Name on account
              </label>
              <input
                id="account-name"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value.slice(0, 60))}
                placeholder="Full name on the account"
                autoComplete="name"
                className={fieldClass}
              />
              <p className="mt-3 text-[12.5px] text-muted-foreground">
                Required. It must match the name on the wallet.
              </p>

              <label htmlFor="identifier" className="fm-label mt-6 block">
                {wallet.identifierLabel}
              </label>
              <input
                id="identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value.slice(0, 64))}
                placeholder={wallet.identifierPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className={fieldClass}
              />
              <p className="mt-3 text-[12.5px] text-muted-foreground">
                This handle is stored with the request so the payout can be addressed.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fm-notice border border-destructive/25 bg-destructive/8 text-destructive"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Magnetic className="w-full" strength={0.16}>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="fm-btn fm-btn-primary w-full"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting
            </>
          ) : (
            <>
              <Landmark className="h-4 w-4" />
              Confirm withdrawal
            </>
          )}
        </button>
      </Magnetic>

      <p className="flex items-start justify-center gap-2.5 text-center text-[12.5px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Only the amount you request is held from your balance while it is reviewed. Any withdrawal
        fee is recorded with the request and never taken out of your wallet.
      </p>
    </div>
  );
}
