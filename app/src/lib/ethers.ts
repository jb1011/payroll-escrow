import { BrowserProvider, Contract, Eip1193Provider, JsonRpcSigner } from 'ethers'
import { CHAIN_ID, PAYROLL_ESCROW_ABI, PAYROLL_ESCROW_ADDRESS } from './contracts'

export async function getProvider(): Promise<BrowserProvider> {
  const ethereum = (window as any).ethereum as Eip1193Provider | undefined
  if (!ethereum) throw new Error('No injected provider found. Install MetaMask.')
  return new BrowserProvider(ethereum)
}

export async function connectWallet(): Promise<{ address: string; signer: JsonRpcSigner }>{
  const provider = await getProvider()
  await provider.send('wallet_requestPermissions', [{ eth_accounts: {} }]).catch(() => {})
  const accounts = await provider.send('eth_requestAccounts', [])
  const signer = await provider.getSigner()
  const address = accounts[0] || (await signer.getAddress())
  return { address, signer }
}

export async function ensureChain(): Promise<void> {
  const provider = await getProvider()
  const current = await provider.send('eth_chainId', [])
  const currentId = parseInt(current, 16)
  if (currentId !== CHAIN_ID) {
    try {
      await provider.send('wallet_switchEthereumChain', [{ chainId: '0x' + CHAIN_ID.toString(16) }])
    } catch (_e) {
      // ignore; user can switch manually if unknown chain
    }
  }
}

export async function getPayrollContract(signerOrProvider?: JsonRpcSigner | BrowserProvider) {
  if (!signerOrProvider) signerOrProvider = await getProvider()
  return new Contract(PAYROLL_ESCROW_ADDRESS, PAYROLL_ESCROW_ABI, signerOrProvider)
}


