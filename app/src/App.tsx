import { useEffect, useMemo, useState } from "react";
import { BigNumberish, BrowserProvider, formatUnits, parseUnits } from "ethers";
import {
  CHAIN_ID,
  PAYROLL_ESCROW_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "./lib/contracts";
import {
  connectWallet,
  ensureChain,
  getPayrollContract,
  getProvider,
} from "./lib/ethers";
import { getErc20 } from "./lib/erc20";

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

export default function App() {
  const [address, setAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>();
  const [streamCounter, setStreamCounter] = useState<string>("…");
  const [loading, setLoading] = useState<boolean>(false);

  const [employee, setEmployee] = useState<string>("");
  const [totalAmount, setTotalAmount] = useState<string>("0");
  const [duration, setDuration] = useState<string>("0");

  const [depositStreamId, setDepositStreamId] = useState<string>("0");
  const [depositAmount, setDepositAmount] = useState<string>("0");

  const [withdrawStreamId, setWithdrawStreamId] = useState<string>("0");

  const [approveAmount, setApproveAmount] = useState<string>("0");
  const [allowance, setAllowance] = useState<string>("—");
  const [queryStreamId, setQueryStreamId] = useState<string>("0");
  const [queriedStream, setQueriedStream] = useState<any | null>(null);

  const shortAddr = useMemo(
    () => (address ? address.slice(0, 6) + "…" + address.slice(-4) : ""),
    [address]
  );
  const shortContract = useMemo(
    () =>
      PAYROLL_ESCROW_ADDRESS
        ? PAYROLL_ESCROW_ADDRESS.slice(0, 5) +
          "…" +
          PAYROLL_ESCROW_ADDRESS.slice(-3)
        : "",
    []
  );

  useEffect(() => {
    (async () => {
      try {
        const provider: BrowserProvider = await getProvider().catch(
          () => undefined as any
        );
        if (!provider) return;
        const idHex = await provider.send("eth_chainId", []);
        setChainId(parseInt(idHex, 16));
        const accounts = (await provider.send("eth_accounts", [])) as string[];
        if (accounts && accounts[0]) setAddress(accounts[0]);
        await refreshCounter();
        (provider as any).on?.("chainChanged", () => window.location.reload());
        (provider as any).on?.("accountsChanged", (accs: string[]) =>
          setAddress(accs?.[0] ?? "")
        );
      } catch {}
    })();
  }, []);

  async function refreshCounter() {
    try {
      const c = await getPayrollContract();
      const sc: BigNumberish = await c.streamCounter();
      setStreamCounter(sc.toString());
    } catch {
      setStreamCounter("—");
    }
  }

  async function onConnect() {
    setLoading(true);
    try {
      await ensureChain();
      const { address: a } = await connectWallet();
      setAddress(a);
      await refreshCounter();
      await refreshAllowance(a);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAllowance(ownerAddr?: string) {
    try {
      const provider = await getProvider();
      const c = getErc20(USDC_ADDRESS, provider);
      const owner = ownerAddr || address;
      if (!owner) {
        setAllowance("—");
        return;
      }
      const v = await c.allowance(owner, PAYROLL_ESCROW_ADDRESS);
      setAllowance(v.toString());
    } catch {
      setAllowance("—");
    }
  }

  async function onCreateStream(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { signer } = await connectWallet();
      const contract = await getPayrollContract(signer);
      const amountBase = parseUnits(
        (totalAmount || "0") as `${number}` | `${bigint}` | string,
        USDC_DECIMALS
      );
      const tx = await contract.createStream(employee, amountBase, duration);
      await tx.wait();
      await refreshCounter();
      await refreshAllowance();
      setEmployee("");
      setTotalAmount("0");
      setDuration("0");
    } finally {
      setLoading(false);
    }
  }

  async function onDeposit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { signer } = await connectWallet();
      const contract = await getPayrollContract(signer);
      const amountBase = parseUnits(
        (depositAmount || "0") as `${number}` | `${bigint}` | string,
        USDC_DECIMALS
      );
      const tx = await contract.deposit(depositStreamId, amountBase);
      await tx.wait();
      await refreshAllowance();
    } finally {
      setLoading(false);
    }
  }

  async function onWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { signer } = await connectWallet();
      const contract = await getPayrollContract(signer);
      const tx = await contract.withdraw(withdrawStreamId);
      await tx.wait();
    } finally {
      setLoading(false);
    }
  }

  async function onFetchStream(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const c = await getPayrollContract();
      const s = await c.getStream(queryStreamId);
      setQueriedStream({
        employer: s.employer,
        employee: s.employee,
        totalAmount: s.totalAmount?.toString?.() ?? String(s.totalAmount),
        startTime: s.startTime?.toString?.() ?? String(s.startTime),
        endTime: s.endTime?.toString?.() ?? String(s.endTime),
        withdrawnAmount:
          s.withdrawnAmount?.toString?.() ?? String(s.withdrawnAmount),
        active: Boolean(s.active),
        cancelled: Boolean(s.cancelled),
      });
    } finally {
      setLoading(false);
    }
  }

  async function onApprove(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { signer, address: owner } = await connectWallet();
      const usdc = getErc20(USDC_ADDRESS, signer);
      const amountBase = parseUnits(
        (approveAmount || "0") as `${number}` | `${bigint}` | string,
        USDC_DECIMALS
      );
      const tx = await usdc.approve(PAYROLL_ESCROW_ADDRESS, amountBase);
      await tx.wait();
      await refreshAllowance(owner);
      setApproveAmount("0");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="arc-container">
      <div className="arc-header">
        <h1 className="arc-title">Payroll Escrow</h1>
        <div className="controls">
          <button
            className="btn primary"
            onClick={onConnect}
            disabled={loading}
          >
            {address ? `Connected: ${shortAddr}` : "Connect Wallet"}
          </button>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h3>Contract</h3>
          <div className="section">
            <LabelValue label="Address" value={shortContract} />
            <LabelValue
              label="USDC"
              value={USDC_ADDRESS.slice(0, 5) + "…" + USDC_ADDRESS.slice(-3)}
            />
            <LabelValue label="Stream Counter" value={streamCounter} />
            <div className="row">
              <button
                className="btn"
                onClick={refreshCounter}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <form className="card" onSubmit={onApprove}>
          <h3>Approve USDC</h3>
          <div className="section">
            <LabelValue label="Current Allowance" value={allowance} />
            <label>
              Amount to Approve (USDC)
              <input
                className="input"
                required
                type="number"
                min="0"
                value={approveAmount}
                onChange={(e) => setApproveAmount(e.target.value)}
              />
            </label>
            <div className="row">
              <button className="btn primary" type="submit" disabled={loading}>
                Approve
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => refreshAllowance()}
                disabled={loading}
              >
                Refresh my Allowance
              </button>
            </div>
          </div>
        </form>

        <form className="card" onSubmit={onFetchStream}>
          <h3>Get Stream</h3>
          <div className="section">
            <label>
              Stream ID
              <input
                className="input"
                required
                type="number"
                min="0"
                value={queryStreamId}
                onChange={(e) => setQueryStreamId(e.target.value)}
              />
            </label>
            <button className="btn primary" type="submit" disabled={loading}>
              Fetch
            </button>
            {queriedStream && (
              <div className="section" style={{ marginTop: 8 }}>
                <LabelValue label="Employer" value={queriedStream.employer} />
                <LabelValue label="Employee" value={queriedStream.employee} />
                <LabelValue
                  label="Total Amount"
                  value={formatUnits(queriedStream.totalAmount, USDC_DECIMALS)}
                />
                <LabelValue
                  label="Withdrawn"
                  value={queriedStream.withdrawnAmount}
                />
                <LabelValue
                  label="Start Time"
                  value={queriedStream.startTime}
                />
                <LabelValue label="End Time" value={queriedStream.endTime} />
                <LabelValue
                  label="Active"
                  value={String(queriedStream.active)}
                />
                <LabelValue
                  label="Cancelled"
                  value={String(queriedStream.cancelled)}
                />
              </div>
            )}
          </div>
        </form>

        <form className="card" onSubmit={onCreateStream}>
          <h3>Create Stream</h3>
          <div className="section">
            <label>
              Employee Address
              <input
                className="input"
                required
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
                placeholder="0x..."
              />
            </label>
            <label>
              Total Amount (USDC)
              <input
                className="input"
                required
                type="number"
                min="0"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </label>
            <label>
              Duration (seconds)
              <input
                className="input"
                required
                type="number"
                min="1"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </label>
            <button className="btn primary" type="submit" disabled={loading}>
              Create
            </button>
          </div>
        </form>

        <form className="card" onSubmit={onDeposit}>
          <h3>Deposit</h3>
          <div className="section">
            <label>
              Stream ID
              <input
                className="input"
                required
                type="number"
                min="0"
                value={depositStreamId}
                onChange={(e) => setDepositStreamId(e.target.value)}
              />
            </label>
            <label>
              Amount (USDC)
              <input
                className="input"
                required
                type="number"
                min="1"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </label>
            <button className="btn primary" type="submit" disabled={loading}>
              Deposit
            </button>
          </div>
        </form>

        <form className="card" onSubmit={onWithdraw}>
          <h3>Withdraw</h3>
          <div className="section">
            <label>
              Stream ID
              <input
                className="input"
                required
                type="number"
                min="0"
                value={withdrawStreamId}
                onChange={(e) => setWithdrawStreamId(e.target.value)}
              />
            </label>
            <button className="btn primary" type="submit" disabled={loading}>
              Withdraw
            </button>
          </div>
        </form>
      </div>

      <p className="subtle">
        Note: USDC transfers require sufficient allowance to the escrow contract
        for deposits, and sufficient escrow balance for withdrawals.
      </p>
    </div>
  );
}
