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
  const [view, setView] = useState<"employer" | "employee">(() => {
    const hash = window.location.hash.toLowerCase();
    return hash.includes("employee") ? "employee" : "employer";
  });

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
  const [employeeStreams, setEmployeeStreams] = useState<
    Array<{ id: string; vested: string }>
  >([]);
  const [withdrawMessage, setWithdrawMessage] = useState<string>("");
  const [newlyCreatedStreamId, setNewlyCreatedStreamId] = useState<
    string | null
  >(null);
  const [showDepositPrompt, setShowDepositPrompt] = useState<boolean>(false);

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
        const eth: any = (window as any).ethereum;
        eth?.removeAllListeners?.("chainChanged");
        eth?.removeAllListeners?.("accountsChanged");
        eth?.on?.("chainChanged", () => window.location.reload());
        eth?.on?.("accountsChanged", (accs: string[]) =>
          setAddress(accs?.[0] ?? "")
        );
      } catch {}
    })();
  }, []);

  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.toLowerCase();
      setView(hash.includes("employee") ? "employee" : "employer");
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
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
      const { signer, address: owner } = await connectWallet();
      const contract = await getPayrollContract(signer);
      const amountBase = parseUnits(
        (totalAmount || "0") as `${number}` | `${bigint}` | string,
        USDC_DECIMALS
      );

      // Check allowance first
      const usdc = getErc20(USDC_ADDRESS, signer);
      const currentAllowance = await usdc.allowance(
        owner,
        PAYROLL_ESCROW_ADDRESS
      );

      if (BigInt(currentAllowance.toString()) < BigInt(amountBase.toString())) {
        // Need to approve first
        const approveTx = await usdc.approve(
          PAYROLL_ESCROW_ADDRESS,
          amountBase
        );
        await approveTx.wait();
        await refreshAllowance(owner);
      }

      // Create the stream
      const tx = await contract.createStream(employee, amountBase, duration);
      await tx.wait();

      // Get the new stream ID from the counter
      const newCounter = await contract.streamCounter();
      const newStreamId = (BigInt(newCounter.toString()) - 1n).toString();

      await refreshCounter();
      await refreshAllowance(owner);

      // Set up for deposit prompt
      setNewlyCreatedStreamId(newStreamId);
      setDepositStreamId(newStreamId);
      setDepositAmount(totalAmount);
      setShowDepositPrompt(true);

      // Don't clear form yet - wait for deposit
    } finally {
      setLoading(false);
    }
  }

  async function onDepositAfterCreate() {
    if (!newlyCreatedStreamId) return;
    setLoading(true);
    try {
      const { signer } = await connectWallet();
      const contract = await getPayrollContract(signer);
      const amountBase = parseUnits(depositAmount || "0", USDC_DECIMALS);
      const tx = await contract.deposit(newlyCreatedStreamId, amountBase);
      await tx.wait();
      await refreshAllowance();

      // Clear everything after successful deposit
      setShowDepositPrompt(false);
      setNewlyCreatedStreamId(null);
      setEmployee("");
      setTotalAmount("0");
      setDuration("0");
      setDepositStreamId("0");
      setDepositAmount("0");
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
      const amountBase = parseUnits(depositAmount || "0", USDC_DECIMALS);
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
      const { signer, address: owner } = await connectWallet();
      const contract = await getPayrollContract(signer);
      console.log("contract", contract);
      console.log("owner", owner);

      // const who = owner || address;
      // if (!who) return;
      const ids = await contract.getEmployeeStreams(owner);
      console.log("ids", ids);
      // if (!ids || ids.length === 0) return;
      const id = ids[ids.length - 1]?.toString?.();
      console.log("id", id);
      const vested: any = await contract.calculateVested(id);
      console.log("vested", vested);
      // const vestedBig = BigInt(vested?.toString?.() ?? String(vested));
      // if (vestedBig === 0n) {
      //   setWithdrawMessage("No vested funds available yet.");
      //   return;
      // }
      // const usdc = getErc20(USDC_ADDRESS, signer);
      // const bal = await (usdc as any).balanceOf(PAYROLL_ESCROW_ADDRESS);
      // const balBig = BigInt(bal?.toString?.() ?? String(bal));
      // if (balBig < vestedBig) {
      //   setWithdrawMessage("Escrow not funded enough to cover vested amount.");
      //   return;
      // }
      const tx = await contract.withdraw(BigInt(id));
      console.log("tx", tx);
      // await tx.wait();
      setWithdrawMessage(`Withdrawn from stream #${id}.`);
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

  async function onLoadEmployeeStreams() {
    setLoading(true);
    try {
      const c = await getPayrollContract();
      const owner = address;
      if (!owner) {
        await onConnect();
      }
      const who = owner || address;
      if (!who) return;
      const ids: Array<any> = await (c as any).getEmployeeStreams(who);
      const list: Array<{ id: string; vested: string }> = [];
      for (const rawId of ids as any[]) {
        const id = rawId?.toString?.() ?? String(rawId);
        const vested = await (c as any).calculateVested(id);
        list.push({ id, vested: vested?.toString?.() ?? String(vested) });
      }
      setEmployeeStreams(list);
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

      <div className="tabs">
        <a
          href="#/employer"
          className={`btn tab ${view === "employer" ? "tab-active" : ""}`}
          onClick={() => setView("employer")}
        >
          Employer
        </a>
        <a
          href="#/employee"
          className={`btn tab ${view === "employee" ? "tab-active" : ""}`}
          onClick={() => setView("employee")}
        >
          Employee
        </a>
      </div>

      <div className="grid">
        {view === "employer" && (
          <>
            <div className="card">
              <h3>Contract</h3>
              <div className="section">
                <LabelValue label="Address" value={shortContract} />
                <LabelValue
                  label="USDC"
                  value={
                    USDC_ADDRESS.slice(0, 5) + "…" + USDC_ADDRESS.slice(-3)
                  }
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

            {/* <form className="card" onSubmit={onApprove}>
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
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={loading}
                  >
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
            </form> */}

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
                <button
                  className="btn primary"
                  type="submit"
                  disabled={loading}
                >
                  Create Stream
                </button>
              </div>
            </form>

            {/* <form className="card" onSubmit={onDeposit}>
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
                <button
                  className="btn primary"
                  type="submit"
                  disabled={loading}
                >
                  Deposit
                </button>
              </div>
            </form> */}
          </>
        )}

        {view === "employee" && (
          <>
            <div className="card">
              <h3>My Streams</h3>
              <div className="section">
                <div className="row">
                  <button
                    className="btn primary"
                    onClick={onLoadEmployeeStreams}
                    disabled={loading}
                  >
                    Load My Streams
                  </button>
                </div>
                {employeeStreams.length > 0 && (
                  <div className="section" style={{ marginTop: 8 }}>
                    {employeeStreams.map((s) => (
                      <div key={s.id} className="section" style={{ gap: 6 }}>
                        <LabelValue label="Stream ID" value={s.id} />
                        <LabelValue
                          label="Claimable (USDC)"
                          value={formatUnits(s.vested, USDC_DECIMALS)}
                        />
                        <div className="divider" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <form onSubmit={onWithdraw}>
                <h3>Withdraw</h3>
                <button
                  className="btn primary"
                  type="submit"
                  disabled={loading}
                >
                  Withdraw Vested
                </button>
                {withdrawMessage && (
                  <span className="value" style={{ marginTop: 8 }}>
                    {withdrawMessage}
                  </span>
                )}
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
