import payroll from "../../../out/PayrollEscrow.sol/PayrollEscrow.json";

export const CHAIN_ID = 5042002;
export const PAYROLL_ESCROW_ADDRESS =
  "0xa421D25E734c295EA3cE01d8e3001c3389f14A68";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;

export const PAYROLL_ESCROW_ABI = (payroll as any).abi as any;
