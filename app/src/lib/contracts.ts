import type { Abi } from "ethers";
import payroll from "../../../out/PayrollEscrow.sol/PayrollEscrow.json";

export const CHAIN_ID = 5042002;
export const PAYROLL_ESCROW_ADDRESS =
  "0xa29a0e473fee3c99b38ab2354562ebb6e454047f";
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;

export const PAYROLL_ESCROW_ABI = (payroll as any).abi as Abi;
