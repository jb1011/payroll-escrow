# Hello ARC DApp

Simple React + Vite app to interact with `PayrollEscrow`.

## Install

```bash
cd app
npm install
```

## Run

```bash
npm run dev
```

Open the URL printed by Vite. Connect MetaMask on chain ID `5042002`.

The app uses:
- Contract address from `broadcast/Deploy.s.sol/5042002/run-latest.json`
- ABI from `out/PayrollEscrow.sol/PayrollEscrow.json`

If you redeploy, update `app/src/lib/contracts.ts` accordingly.

